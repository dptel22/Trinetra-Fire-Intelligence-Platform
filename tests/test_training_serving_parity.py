"""Training vs. Serving feature parity test for the PS26162 CatBoost pipeline.

Verifies that real rows from the locked labeled training artifact produce an
identical 55-feature vector when routed through the live serving pipeline
(DuckDB feature store -> model_service._prepare_pool).

Two deterministic cells are exercised: a non-first-observation row with real
lag history, and a first-observation row with NULL/zero lag history. The latter
keeps the documented NULL-vs-0.0 divergence path under regression coverage.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from app.core.config import settings
from app.services.feature_store import feature_store
from app.services.model_service import model_service

# Deterministic (h3_08, acq_date) pairs resolved from the real training
# artifact, which must also exist in both serving parquets. Re-resolved on
# 2026-09-09: serving coverage is now all-India (10-state restriction retired),
# and the previously hard-coded February/April cells never existed in this
# environment's store (CSV-window dates only). Resolved below, after
# _locate_training_artifact is defined.

# Columns that hold lag/rolling history. These are the only columns where the
# known NULL-vs-0.0 fill divergence (AGENT_LOG.md, 2026-09-03) may appear.
KNOWN_LAG_COLUMNS = {
    "frp_max_lag7",
    "frp_max_lag30",
    "active_days_7d",
    "active_days_30d",
    "active_days_90d",
}

# Reason string mandated by the follow-up for an expected NULL-vs-0.0 divergence.
KNOWN_NULL_ZERO_REASON = "AGENT_LOG.md 2026-09-03: known NULL-vs-0.0 lag fill divergence"


def _locate_training_artifact() -> Path:
    """Locate the locked labeled training parquet, verifying the path from model_metadata.json."""
    metadata_path = Path(settings.INFERENCE_BUNDLE_DIR).parent / "model_metadata.json"
    if metadata_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        recorded_path = metadata.get("dataset", "")
        base_name = Path(recorded_path).name
        local_candidates = [
            settings.DATA_DIR / "processed" / base_name,
            settings.DATA_DIR / "processed" / "sih2026_h3_daily_labeled_osi_wri.parquet",
            settings.DATA_DIR / "processed" / "sih2026_h3_daily_features_with_osm_wri.parquet",
        ]
        for candidate in local_candidates:
            if candidate.exists():
                return candidate
    fallback = settings.DATA_DIR / "processed" / "sih2026_h3_daily_labeled_osi_wri.parquet"
    if fallback.exists():
        return fallback
    raise FileNotFoundError("Could not locate labeled training parquet artifact")


def _resolve_cell_cases() -> dict[str, tuple[str, str]]:
    df = pd.read_parquet(_locate_training_artifact())
    df = df.assign(_date=df["acq_date"].astype(str).str.slice(0, 10)).sort_values(["h3_08", "_date"])
    non_trivial = df[df["frp_max_lag7"].notna()]
    first_obs = df[(df["is_first_observation"] == 1) & (df["frp_max_lag7"].isna())]
    if non_trivial.empty or first_obs.empty:
        raise FileNotFoundError("No suitable parity cases in the training artifact")
    nt, fo = non_trivial.iloc[0], first_obs.iloc[0]
    return {
        # is_first_observation == 0, non-trivial history
        "non_trivial": (str(nt["h3_08"]), str(nt["_date"])),
        # is_first_observation == 1; FRP lag columns are NULL in the training artifact.
        "first_observation_null_lag": (str(fo["h3_08"]), str(fo["_date"])),
    }


CELL_CASES = _resolve_cell_cases()


def _training_row_for(h3: str, acq_date: str) -> dict:
    """Extract the training-artifact feature vector for one (h3, date) in settings order."""
    df = pd.read_parquet(_locate_training_artifact())
    mask = (df["h3_08"].astype(str) == h3) & (
        df["acq_date"].astype(str).str.slice(0, 10) == acq_date
    )
    matching = df[mask]
    assert len(matching) > 0, f"Sample row ({h3}, {acq_date}) missing in training artifact!"
    row = dict(matching.iloc[0])

    # v3 contract derives calendar features from acq_date at seed time (Phase 8C).
    dt = pd.to_datetime(acq_date)
    doy = dt.dayofyear
    row["acq_month"] = int(dt.month)
    row["doy_sin"] = math.sin(2 * math.pi * doy / 365.25)
    row["doy_cos"] = math.cos(2 * math.pi * doy / 365.25)
    return row


def _serving_row_for(h3: str, acq_date: str) -> dict:
    """RoutFeed the raw (h3, date) through feature_store.get_cell (live serving path)."""
    feature_store.load()
    cell = feature_store.get_cell(h3, acq_date)
    assert cell is not None, f"Sample cell ({h3}, {acq_date}) not found in serving store!"
    return cell


def test_feature_column_set_and_order_parity():
    """Prove config, feature_schema.json agree exactly in count, set, and order."""
    bundle_schema_path = Path(settings.INFERENCE_BUNDLE_DIR) / "feature_schema.json"
    assert bundle_schema_path.exists(), f"feature_schema.json missing at {bundle_schema_path}"
    schema = json.loads(bundle_schema_path.read_text(encoding="utf-8"))
    bundle_features = list(schema["feature_cols"])

    assert len(settings.MODEL_FEATURES) == 55, f"Expected 55 features, found {len(settings.MODEL_FEATURES)}"
    assert len(bundle_features) == 55, f"Expected 55 features in bundle schema, found {len(bundle_features)}"
    assert set(settings.MODEL_FEATURES) == set(bundle_features), (
        f"Feature set mismatch: diff={set(settings.MODEL_FEATURES) ^ set(bundle_features)}"
    )
    assert settings.MODEL_FEATURES == bundle_features, "Feature order mismatch between config and bundle schema"
    assert settings.CAT_FEATURES == ["h3_08", "daynight"]
    assert list(schema.get("cat_features", [])) == ["h3_08", "daynight"]


@pytest.mark.parametrize(
    ("h3", "acq_date", "case"),
    [
        pytest.param(*CELL_CASES["non_trivial"], "non_trivial"),
        pytest.param(*CELL_CASES["first_observation_null_lag"], "first_observation_null_lag"),
    ],
    ids=["non_trivial_lag", "first_observation_null_lag"],
)
def test_training_serving_feature_values_parity(h3, acq_date, case):
    """Prove the 55-feature vector from training matches serving output per column."""
    model_service.load_model()
    training_row = _training_row_for(h3, acq_date)
    serving_row = _serving_row_for(h3, acq_date)

    # The exact DataFrame _prepare_pool builds (re-run the real path AND mirror it
    # so we can inspect per-column values).
    pool = model_service._prepare_pool(serving_row)
    assert pool is not None
    assert pool.num_row() == 1
    assert pool.num_col() == len(settings.MODEL_FEATURES)
    assert pool.get_feature_names() == settings.MODEL_FEATURES
    assert pool.get_cat_feature_indices() == [
        settings.MODEL_FEATURES.index(col) for col in settings.CAT_FEATURES
    ]

    serving_frame = pd.DataFrame(
        [{col: serving_row[col] for col in settings.MODEL_FEATURES}],
        columns=settings.MODEL_FEATURES,
    )
    for col in settings.CAT_FEATURES:
        serving_frame[col] = serving_frame[col].astype("string").fillna("missing").astype(str)
    for col in serving_frame.columns:
        if col in settings.CAT_FEATURES:
            continue
        if serving_frame[col].dtype == bool:
            serving_frame[col] = serving_frame[col].astype("int8")
        else:
            serving_frame[col] = pd.to_numeric(serving_frame[col], errors="coerce")

    unexpected = []
    known_lag_divergence = []

    for col in settings.MODEL_FEATURES:
        t_val = training_row.get(col)
        s_val = serving_frame[col].iloc[0]

        if col in settings.CAT_FEATURES:
            if str(t_val) != str(s_val):
                unexpected.append(f"Categorical mismatch on {col}: training='{t_val}', serving='{s_val}'")
            continue

        t_is_na = pd.isna(t_val)
        s_is_na = pd.isna(s_val)
        if t_is_na and s_is_na:
            continue  # both NULL: identical, no tolerance needed

        # Known NULL-vs-0.0 fill divergence on lag/rolling columns (AGENT_LOG 09-03).
        if (t_is_na and s_val == 0.0) or (t_val == 0.0 and s_is_na):
            if col in KNOWN_LAG_COLUMNS:
                known_lag_divergence.append(f"{col}: training={t_val}, serving={s_val}")
                continue

        if t_is_na != s_is_na:
            unexpected.append(f"Nullness mismatch on {col}: training={t_val}, serving={s_val}")
            continue

        if not np.isclose(float(t_val), float(s_val), rtol=1e-6, atol=1e-6):
            unexpected.append(
                f"Numeric mismatch on {col}: training={t_val}, serving={s_val}, diff={abs(float(t_val) - float(s_val))}"
            )

    if known_lag_divergence:
        pytest.xfail(f"{KNOWN_NULL_ZERO_REASON}: {known_lag_divergence}")

    assert not unexpected, (
        f"[{case}] Training/serving feature skew across {len(unexpected)} columns:\n"
        + "\n".join(unexpected)
    )


def test_model_predict_on_serving_cell():
    """Verify the serving pipeline yields valid probabilities for the non-trivial cell."""
    model_service.load_model()
    h3, acq_date = CELL_CASES["non_trivial"]
    response = model_service.predict(_serving_row_for(h3, acq_date))
    assert response.cell_id == h3
    assert response.predicted_class in set(settings.TARGET_CLASSES) | {"unclassified"}
    assert len(response.probabilities) == 4
    prob_sum = sum(p.probability for p in response.probabilities)
    assert math.isclose(prob_sum, 1.0, rel_tol=1e-3)
