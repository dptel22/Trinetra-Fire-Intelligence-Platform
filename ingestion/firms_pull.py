"""NASA FIRMS area-API live pull for the locked SNPP + NOAA-20 VIIRS fusion.

The raw NRT column schema produced here is the exact schema the EDA notebook
(`notebooks/eda/data-eda.ipynb`) ingests, byte-verified against the historical
repo CSVs (data/J1_VIIRS_C2_South_Asia_7d.csv, deleted from HEAD but recovered
from git):

    latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,
    confidence,version,bright_ti5,frp,daynight

with satellite values N (SNPP) / N20 (NOAA-20). Provenance tags
(`satellite_name`, `source`) follow the notebook's cell-8 convention.

The MAP_KEY is read from .env (FIRMS_MAP_KEY, alias FIRMS_API_KEY) and is never
logged. FIRMS rate limit is 5000 transactions / 10 min per key; the CSV body
carries no explicit transaction counter, so usage is tracked via row counts and
response Content-Length only — no invented numbers.

URL construction is hardened: https-only, fixed FIRMS host allowlist, every
path segment validated before it can enter the URL, resolved IPs must be
public (blocks private/loopback/link-local and metadata endpoints), and
redirects are never followed.
"""

from __future__ import annotations

import io
import logging
import os
import re
import time
from datetime import date as date_cls
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv

logger = logging.getLogger("ingestion.firms_pull")

REPO_ROOT = Path(__file__).resolve().parent.parent

FIRMS_BASE_URL = "https://firms.modaps.eosdis.nasa.gov/api"
_ALLOWED_HOST = "firms.modaps.eosdis.nasa.gov"

SOURCES = ("VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT")
SATELLITE_NAME_BY_SOURCE = {
    "VIIRS_SNPP_NRT": "SUOMI-NPP",
    "VIIRS_NOAA20_NRT": "NOAA-20",
}

# Raw NRT schema (FIRMS area API, VIIRS 375m NRT).
NRT_COLUMNS = [
    "latitude", "longitude", "bright_ti4", "scan", "track", "acq_date",
    "acq_time", "satellite", "confidence", "version", "bright_ti5", "frp",
    "daynight",
]

# FIRMS area-API day-range ceiling. NASA docs mention up to 10, but the live
# endpoint rejects spans >5 for the VIIRS NRT sources ("Invalid day range.
# Expects [1..5]", verified 2026-09-08) — the locked sources use 5.
MAX_DAY_RANGE = 5

# Strict component validators — anything failing these never reaches a URL.
_RE_MAP_KEY = re.compile(r"^[0-9a-fA-F]{16,64}$")
_RE_BBOX = re.compile(r"^-?\d{1,3}(?:\.\d+)?(?:,-?\d{1,3}(?:\.\d+)?){3}$")
_RE_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

_RETRY_DELAYS_S = (2.0, 5.0)


class IngestionError(RuntimeError):
    """Raised for fail-loud ingestion failures (bad key, bad response, ...)."""


def validate_bbox(bbox: str) -> str:
    """Strict west,south,east,north validation; returns the normalized string."""
    if not _RE_BBOX.match(bbox.strip()):
        raise IngestionError(
            f"Invalid bbox {bbox!r}: expected 'west,south,east,north' decimal degrees "
            "(e.g. 68.03,6.75,97.42,37.10)"
        )
    w, s, e, n = (float(p) for p in bbox.strip().split(","))
    if not (-180 <= w < e <= 180 and -90 <= s < n <= 90):
        raise IngestionError(f"Invalid bbox ordering/ranges: {bbox!r}")
    return bbox.strip()


def validate_date(date: str | None) -> str | None:
    if date is None:
        return None
    if not _RE_DATE.match(date.strip()):
        raise IngestionError(f"Invalid date {date!r}: expected YYYY-MM-DD")
    try:
        date_cls.fromisoformat(date.strip())
    except ValueError as err:
        raise IngestionError(f"Invalid date {date!r}: {err}") from err
    return date.strip()


def load_map_key() -> str:
    """Read FIRMS_MAP_KEY (alias FIRMS_API_KEY) from the environment / .env."""
    load_dotenv(REPO_ROOT / ".env")
    key = os.environ.get("FIRMS_MAP_KEY") or os.environ.get("FIRMS_API_KEY")
    if not key:
        raise IngestionError(
            "FIRMS_MAP_KEY not set. Add it to .env (never hardcode or commit it). "
            "Generate/revoke keys at https://firms.modaps.eosdis.nasa.gov/api/map_key/"
        )
    key = key.strip()
    if not _RE_MAP_KEY.match(key):
        # Prevents path injection via the env var; real MAP_KEYS are hex.
        raise IngestionError("FIRMS_MAP_KEY has an unexpected format (expected hex token).")
    return key


def fetch_firms(
    source: str,
    bbox: str,
    day_range: int,
    date: str | None = None,
    map_key: str | None = None,
) -> pd.DataFrame:
    """Fetch one FIRMS area-CSV request as a raw DataFrame.

    `date` (YYYY-MM-DD) is the start of the DAY_RANGE window. When omitted the
    API returns the most recent window ending now. A zero-detection day is a
    valid outcome and returns an empty DataFrame with the NRT column schema.
    """
    if source not in SOURCES:
        raise IngestionError(f"Unknown FIRMS source {source!r}; expected one of {SOURCES}")
    if not 1 <= int(day_range) <= MAX_DAY_RANGE:
        raise IngestionError(f"day_range must be 1..{MAX_DAY_RANGE}, got {day_range}")

    bbox = validate_bbox(bbox)
    date = validate_date(date)
    key = map_key if (map_key and _RE_MAP_KEY.match(map_key)) else load_map_key()

    # All segments validated above; host is the fixed FIRMS API host.
    url = f"{FIRMS_BASE_URL}/area/csv/{key}/{source}/{bbox}/{int(day_range)}"
    if date:
        url += f"/{date}"

    text = None
    last_err: Exception | None = None
    for attempt in range(len(_RETRY_DELAYS_S) + 1):
        try:
            resp = _get(url)
            if resp.status_code != 200:
                raise IngestionError(
                    f"FIRMS returned HTTP {resp.status_code} for {source}: {_safe(resp.text)}"
                )
            body = resp.text
            head = body.strip()[:200].lower()
            if "invalid" in head and "key" in head:
                raise IngestionError("FIRMS rejected the MAP_KEY (invalid/expired); rotate it at firms.modaps.eosdis.nasa.gov/api/map_key/")
            if "rate limit" in head:
                raise IngestionError("FIRMS rate limit hit (5000 transactions / 10 min per key); back off and retry.")
            text = body
            break
        except IngestionError:
            raise
        except Exception as err:  # network/timeout — retry with backoff
            last_err = err
            if attempt < len(_RETRY_DELAYS_S):
                delay = _RETRY_DELAYS_S[attempt]
                logger.warning("FIRMS request failed (%s); retrying in %.0fs", err, delay)
                time.sleep(delay)

    if text is None:
        raise IngestionError(f"FIRMS request failed after retries for {source}: {last_err}")

    df = _parse_csv(text, source)
    logger.info(
        "FIRMS %s [%s..+%dd]: %d rows (Content-Length: %s; ~%d%% of the 5000/10min transaction budget)",
        source, date or "latest", day_range, len(df),
        _last_content_length if _last_content_length is not None else "n/a",
        round(100.0 * len(df) / 5000.0),
    )
    return df


_last_content_length: int | None = None


def _validate_url_safety(url: str) -> None:
    """SSRF gate: https-only, fixed-host allowlist, resolve and require public IPs."""
    from urllib.parse import urlparse

    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise IngestionError(f"Refusing non-https FIRMS URL: scheme={parsed.scheme!r}")
    if parsed.hostname != _ALLOWED_HOST:
        raise IngestionError(f"Refusing unexpected FIRMS URL host: {parsed.hostname!r}")
    import ipaddress
    import socket

    try:
        infos = socket.getaddrinfo(parsed.hostname, 443, proto=socket.IPPROTO_TCP)
    except OSError as err:
        raise IngestionError(f"DNS resolution failed for {parsed.hostname}: {err}") from err
    if not infos:
        raise IngestionError(f"DNS returned no addresses for {parsed.hostname}")
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global:
            raise IngestionError(
                f"FIRMS host resolved to non-public address {ip} (private/loopback/link-local); refusing request"
            )


def _get(url: str):
    import requests

    _validate_url_safety(url)
    # allow_redirects=False: the URL is validated, never follow elsewhere.
    resp = requests.get(url, timeout=120, allow_redirects=False)
    _last_content_length = resp.headers.get("Content-Length")
    return resp


def _safe(text: str, limit: int = 200) -> str:
    """First bytes of an error body, with the MAP_KEY redacted if present."""
    try:
        key = load_map_key()
    except IngestionError:
        key = None
    snippet = (text or "")[:limit].replace("\n", " ")
    if key:
        snippet = snippet.replace(key, "***")
    return snippet


def _parse_csv(text: str, source: str) -> pd.DataFrame:
    body = (text or "").strip()
    if not body:
        return _empty_frame()
    first_line = body.splitlines()[0].strip()
    header = [c.strip() for c in first_line.split(",")]
    missing = [c for c in NRT_COLUMNS if c not in header]
    if missing:
        # Not the expected schema — surface whatever the API said instead.
        raise IngestionError(
            f"Unexpected FIRMS response for {source} (missing {missing}): {_safe(body)}"
        )
    if set(header) != set(NRT_COLUMNS):
        # FIRMS sometimes adds columns (e.g. `instrument`); keep them, the
        # notebook schema is a subset and downstream ignores extras.
        logger.info("FIRMS %s response carries extra columns: %s", source, [c for c in header if c not in NRT_COLUMNS])
    df = pd.read_csv(io.StringIO(body))
    if df.empty:
        return _empty_frame()
    return df


def _empty_frame() -> pd.DataFrame:
    return pd.DataFrame({col: pd.Series(dtype="object") for col in NRT_COLUMNS})


def harmonize_points(df: pd.DataFrame) -> pd.DataFrame:
    """Port of data-eda.ipynb cells 8 + 12 (schema harmonization + cleaning).

    Order of operations is the notebook's: provenance tags are already on the
    frame; rename archive names; normalize enums; derive NRT fire-type flags;
    validate acq_time; dedup overlap; physical sanity; confidence filter;
    satellite normalization.
    """
    if df.empty:
        return df

    df = df.copy()

    # Archive -> common VIIRS I-band naming (no-op for NRT).
    rename_map = {"brightness": "bright_ti4", "bright_t31": "bright_ti5", "type": "fire_type"}
    df = df.rename(columns={k: v for k, v in rename_map.items() if k in df.columns})

    if "confidence" in df.columns:
        df["confidence"] = df["confidence"].replace({"l": "low", "n": "nominal", "h": "high"})
    if "daynight" in df.columns:
        df["daynight"] = df["daynight"].replace({"D": "Day", "N": "Night"})

    # NRT has no archive `type` field: -1 = unknown (notebook cell 8).
    if "fire_type" in df.columns and df["fire_type"].notna().any():
        is_na = df["fire_type"].isna()
        df["is_static_land"] = np.select([is_na], [-1], default=(df["fire_type"] == 2).astype(int))
        df["is_offshore"] = np.select([is_na], [-1], default=(df["fire_type"] == 3).astype(int))
    else:
        df["is_static_land"] = -1
        df["is_offshore"] = -1

    # Cell 12: acquisition-time validation.
    df["acq_date"] = pd.to_datetime(df["acq_date"], errors="raise")
    acq_time_num = pd.to_numeric(df["acq_time"], errors="coerce")
    if not acq_time_num.notna().all():
        raise IngestionError("acq_time contains non-numeric values.")
    if not acq_time_num.between(0, 2359).all():
        raise IngestionError("acq_time contains values outside 0000-2359.")
    if not (acq_time_num % 100 < 60).all():
        raise IngestionError("acq_time contains invalid minute values.")

    # Cell 12: archive/NRT overlap removal.
    dedup_cols = ["latitude", "longitude", "acq_date", "acq_time", "satellite"]
    n_before = len(df)
    df = df.drop_duplicates(subset=dedup_cols, keep="first").copy()
    logger.info("Dedup removed %d rows", n_before - len(df))

    # Cell 12: physical sanity filters.
    n_before = len(df)
    df = df[pd.to_numeric(df["bright_ti4"], errors="coerce") > 200].copy()
    df = df[pd.to_numeric(df["frp"], errors="coerce") >= 0].copy()
    logger.info("Sanity filters removed %d rows", n_before - len(df))

    # Cell 12: confidence filter (documented decision; low confidence is
    # disproportionately sun-glint / bare-soil / cloud-edge false alarms).
    n_before = len(df)
    df = df[df["confidence"].isin(["nominal", "high"])].copy()
    logger.info("Confidence filter removed %d rows", n_before - len(df))

    # Cell 12: satellite normalization (N -> SNPP, N20 -> NOAA20).
    df["satellite"] = df["satellite"].replace({"N": "SNPP", "N20": "NOAA20"})

    df["latitude"] = df["latitude"].astype(float)
    df["longitude"] = df["longitude"].astype(float)
    return df.reset_index(drop=True)


def fetch_firms_both(
    bbox: str,
    day_range: int = 1,
    date: str | None = None,
    map_key: str | None = None,
    return_raw: bool = False,
) -> tuple[pd.DataFrame, dict] | tuple[pd.DataFrame, dict, dict[str, pd.DataFrame]]:
    """Pull both locked NRT sources in parallel, tag provenance, concat, harmonize.

    The two source requests are independent HTTP calls, so they run
    concurrently (2 threads). FIRMS' documented rate limit is 5000
    requests/10 min; a full gap-fill uses 2 requests per day-chunk — a tiny
    fraction of the budget, so parallelism here is safe.

    Returns (points_df, stats) where stats carries per-source raw row counts.
    With return_raw=True, additionally returns the untouched per-source
    `_parse_csv` output (full column superset FIRMS returned, provenance tags
    included) keyed by source — the raw evidence the immutable raw archive
    persists before harmonization can drop rows. Zero-detection days yield the
    schema-carrying empty frame so the archive can still prove the day.
    """
    bbox = validate_bbox(bbox)
    date = validate_date(date)
    stats: dict = {"raw_rows": {}, "source": list(SOURCES)}
    parts: list[pd.DataFrame] = []
    raw_by_source: dict[str, pd.DataFrame] = {}

    from concurrent.futures import ThreadPoolExecutor

    def _pull(src: str):
        return src, fetch_firms(src, bbox, day_range=day_range, date=date, map_key=map_key)

    with ThreadPoolExecutor(max_workers=len(SOURCES)) as pool:
        for src, raw in pool.map(_pull, SOURCES):
            stats["raw_rows"][src] = int(len(raw))
            if return_raw:
                raw_by_source[src] = raw
            if raw.empty:
                logger.warning("Zero detections from %s for %s (+%dd) — valid empty day.", src, date, day_range)
                continue
            raw = raw.copy()
            raw["source"] = "nrt"
            raw["satellite_name"] = SATELLITE_NAME_BY_SOURCE[src]
            parts.append(raw)

    if not parts:
        empty = _empty_frame()
        empty["is_static_land"] = pd.Series(dtype="int8")
        empty["is_offshore"] = pd.Series(dtype="int8")
        if return_raw:
            return empty, stats, raw_by_source
        return empty, stats

    df = pd.concat(parts, ignore_index=True)
    df = harmonize_points(df)
    stats["rows_after_harmonize"] = int(len(df))
    if return_raw:
        return df, stats, raw_by_source
    return df, stats
