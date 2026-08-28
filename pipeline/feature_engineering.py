import h3
import pandas as pd
import numpy as np
from app.core.config import settings

def latlng_to_h3(lat: float, lng: float, resolution: int = 8) -> str:
    """Convert lat/lon to H3 hexagon string index across different h3-py versions."""
    try:
        # h3 v4.x
        return h3.latlng_to_cell(lat, lng, resolution)
    except AttributeError:
        # h3 v3.x
        return h3.geo_to_h3(lat, lng, resolution)

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Transforms raw NASA FIRMS records into CatBoost-ready feature dataframe.
    Adheres strictly to the NTRO & CatBoost specification:
    - Passes H3 index, satellite, landuse as raw strings in cat_features.
    - Normalizes persistence_90d by observed days to account for missing days.
    - Uses FIRMS 'type' as an inferred feature ('is_static_source') rather than ground truth.
    """
    processed = df.copy()

    # 1. H3 Hexagonal Index generation
    if "h3_index" not in processed.columns:
        processed["h3_index"] = processed.apply(
            lambda row: latlng_to_h3(row["latitude"], row["longitude"], settings.H3_RESOLUTION),
            axis=1
        )

    # 2. String categorical enforcement (DO NOT OHE OR LABEL ENCODE)
    processed["h3_index"] = processed["h3_index"].astype(str)
    processed["satellite"] = processed.get("satellite", pd.Series(["SNPP"] * len(processed))).astype(str)
    processed["daynight"] = processed.get("daynight", pd.Series(["D"] * len(processed))).astype(str)
    processed["landuse_tag"] = processed.get("landuse_tag", pd.Series(["unknown"] * len(processed))).astype(str)

    # 3. Time / Persistence Normalization (Handling missing days gap)
    if "observed_days_in_90d" not in processed.columns or processed["observed_days_in_90d"].isnull().all():
        observed_days = 90
    else:
        observed_days = processed["observed_days_in_90d"].fillna(90).clip(lower=1)

    raw_persistence = processed.get("persistence_90d", pd.Series([0] * len(processed))).fillna(0)
    # Normalized score: persistence count divided by observed days in the 90d window
    processed["persistence_90d_norm"] = raw_persistence / observed_days

    # 4. Inferred 'type' to feature conversion
    if "type" in processed.columns:
        # 0 = presumed vegetation fire, 1 = active volcano, 2 = other static land source, 3 = offshore
        processed["is_static_source"] = processed["type"].apply(lambda t: 1.0 if t in [1, 2, 3] else 0.0)
    else:
        processed["is_static_source"] = 0.0

    # 5. Default environmental context features if not already joined
    for col, default_val in [
        ("brightness", 320.0),
        ("scan", 1.0),
        ("track", 1.0),
        ("frp", 15.0),
        ("bright_t31", 295.0),
        ("confidence", 80.0),
        ("distance_to_water_km", 5.0),
        ("distance_to_road_km", 2.0),
        ("canopy_cover_pct", 45.0)
    ]:
        if col not in processed.columns:
            processed[col] = default_val
        else:
            processed[col] = processed[col].fillna(default_val).astype(float)

    return processed
