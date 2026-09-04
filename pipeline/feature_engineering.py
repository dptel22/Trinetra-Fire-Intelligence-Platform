import h3 as h3lib
import pandas as pd

from app.core.config import settings


def latlng_to_h3(lat: float, lng: float, resolution: int = settings.H3_RESOLUTION) -> str:
    """Convert lat/lon to H3 hexagon string index. Handles h3-py v3 and v4 APIs."""
    try:
        return h3lib.latlng_to_cell(lat, lng, resolution)   # h3 v4.x
    except AttributeError:
        return h3lib.geo_to_h3(lat, lng, resolution)         # h3 v3.x


def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transforms harmonized NASA FIRMS/VIIRS point records into CatBoost-ready features.

    Key design contracts (verified against docs/eda-findings.md):
    - bright_ti4 / bright_ti5: VIIRS I4/I5 channel temperatures (Kelvin). NOT brightness/bright_t31.
    - confidence: string categorical ("low" | "nominal" | "high"). NOT float 0-100.
    - H3 resolution 7 is the project-locked default (~1.2 km² cell, ~50K cells for India).
    - persistence_90d_norm = persistence_90d / observed_days_in_90d (missing-day correction).
    - All categorical features (h3_index, satellite, daynight, confidence) are passed as raw
      strings to CatBoost cat_features — NO OHE, NO label encoding.
    """
    processed = df.copy()

    # 1. H3 Hexagonal Index (resolution 7)
    if "h3_index" not in processed.columns:
        processed["h3_index"] = processed.apply(
            lambda row: latlng_to_h3(row["latitude"], row["longitude"], settings.H3_RESOLUTION),
            axis=1
        )

    # 2. Categorical feature type enforcement (raw strings for CatBoost)
    processed["h3_index"] = processed["h3_index"].astype(str)
    for col, default_str in [
        ("satellite", "N"),
        ("daynight", "D"),
        ("confidence", "nominal"),
        ("landuse_tag", "unknown"),
    ]:
        if col not in processed.columns:
            processed[col] = default_str
        else:
            processed[col] = processed[col].fillna(default_str)
        processed[col] = processed[col].astype(str)

    # 3. VIIRS channel brightness (Kelvin) — use ti4/ti5, NOT MODIS brightness/bright_t31
    for col, default in [("bright_ti4", 320.0), ("bright_ti5", 295.0)]:
        if col not in processed.columns:
            processed[col] = default
        else:
            processed[col] = processed[col].fillna(default).astype(float)

    # 4. Point geometry and FRP
    for col, default in [("scan", 1.0), ("track", 1.0), ("frp", 15.0)]:
        if col not in processed.columns:
            processed[col] = default
        else:
            processed[col] = processed[col].fillna(default).astype(float)

    # 5. Temporal Persistence Normalization
    #    Divides by OBSERVED days (not a fixed 90) to handle cloud/sensor blackout gaps
    observed_days = processed.get("observed_days_in_90d", pd.Series([90] * len(processed))).fillna(90).clip(lower=1)
    raw_persistence = processed.get("persistence_90d", pd.Series([0] * len(processed))).fillna(0)
    processed["persistence_90d_norm"] = raw_persistence / observed_days

    # 6. FIRMS type → is_static_source feature
    #    0=vegetation fire, 1=active volcano, 2=other static land source, 3=offshore
    if "type" in processed.columns:
        processed["is_static_source"] = processed["type"].apply(
            lambda t: 1.0 if (t is not None and int(t) in [1, 2, 3]) else 0.0
        )
    else:
        processed["is_static_source"] = 0.0

    # 7. Spatial context defaults (filled from DuckDB feature store during inference)
    for col, default_val in [
        ("distance_to_water_km", 5.0),
        ("distance_to_road_km", 2.0),
        ("canopy_cover_pct", 45.0),
    ]:
        if col not in processed.columns:
            processed[col] = default_val
        else:
            processed[col] = processed[col].fillna(default_val).astype(float)

    return processed
