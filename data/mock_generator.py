"""
SYNTHETIC DATA GENERATOR — DEMO / QUICKSTART PATH ONLY
=======================================================
This file generates a synthetic point-level dataset to allow the backend to be
started and demoed without the real production ML training artifact.

The REAL training pipeline:
  - Uses 1.19M rows of harmonized VIIRS data from docs/eda-findings.md
  - Applies the Phase 6 H3-day label bootstrap
  - Trains on the 52-column enriched H3-day schema
  - Is managed by the ML Lead in a separate notebook/workspace

This script must NOT be used as evidence of a valid production model.
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings
from pipeline.feature_engineering import latlng_to_h3

# FOUR TRAINED CLASSES — matches settings.TARGET_CLASSES
# "unclassified" is NOT generated here; it is a post-inference confidence fallback.
FOUR_CLASSES = settings.TARGET_CLASSES  # ["agricultural_burn", "industrial", "mining", "wildfire"]

# FIRMS confidence strings — VIIRS C2 reports these, not a float
CONFIDENCE_LEVELS = ["low", "nominal", "high"]
SATELLITES = ["N", "S"]  # N = NOAA-20, S = Suomi-NPP (as per harmonized schema)


def generate_mock_firms_data(n_samples: int = 1500, random_state: int = 42) -> pd.DataFrame:
    """
    Generate synthetic VIIRS-like point observations with 4-class labels.
    Uses physically realistic VIIRS brightness/FRP signatures per class.
    """
    np.random.seed(random_state)

    # Spatial clusters anchored on real Indian regions matching each class
    regions = [
        {"lat": 30.5, "lon": 75.8, "spread": 0.8,  "primary_class": "agricultural_burn"},  # Punjab stubble belt
        {"lat": 22.3, "lon": 73.2, "spread": 0.5,  "primary_class": "industrial"},           # Gujarat industrial
        {"lat": 21.8, "lon": 85.3, "spread": 0.6,  "primary_class": "mining"},               # Odisha/Jharkhand mines
        {"lat": 22.0, "lon": 79.0, "spread": 1.2,  "primary_class": "wildfire"},             # Central India forest
    ]

    rows = []
    for i in range(n_samples):
        reg = regions[i % len(regions)]
        lat = float(np.random.normal(reg["lat"], reg["spread"]))
        lon = float(np.random.normal(reg["lon"], reg["spread"]))

        # 70% chance of primary class, 30% any of the four classes
        cls = reg["primary_class"] if np.random.rand() < 0.70 else np.random.choice(FOUR_CLASSES)
        cls_idx = FOUR_CLASSES.index(cls)

        # Per-class VIIRS physical signatures (bright_ti4 in Kelvin, frp in MW)
        if cls == "wildfire":
            bright_ti4 = float(np.random.normal(360, 25))
            frp = float(np.random.exponential(80) + 20)
            persistence = int(np.random.randint(1, 10))
            landuse = "forest"
            canopy = float(np.random.uniform(60, 95))
            dist_road = float(np.random.uniform(5, 30))
            dist_water = float(np.random.uniform(3, 20))
            confidence = np.random.choice(["nominal", "high"], p=[0.35, 0.65])
        elif cls == "agricultural_burn":
            bright_ti4 = float(np.random.normal(325, 15))
            frp = float(np.random.exponential(25) + 5)
            persistence = int(np.random.randint(1, 5))
            landuse = "farmland"
            canopy = float(np.random.uniform(5, 25))
            dist_road = float(np.random.uniform(0.5, 5))
            dist_water = float(np.random.uniform(1, 10))
            confidence = np.random.choice(["nominal", "high"], p=[0.6, 0.4])
        elif cls == "industrial":
            bright_ti4 = float(np.random.normal(375, 30))
            frp = float(np.random.exponential(120) + 50)
            persistence = int(np.random.randint(65, 90))  # High 90-day persistence
            landuse = "industrial"
            canopy = float(np.random.uniform(0, 10))
            dist_road = float(np.random.uniform(0.1, 1.5))
            dist_water = float(np.random.uniform(0.5, 8))
            confidence = np.random.choice(["nominal", "high"], p=[0.3, 0.7])
        else:  # mining
            bright_ti4 = float(np.random.normal(340, 20))
            frp = float(np.random.exponential(40) + 15)
            persistence = int(np.random.randint(30, 75))
            landuse = "mining"
            canopy = float(np.random.uniform(0, 20))
            dist_road = float(np.random.uniform(0.2, 3))
            dist_water = float(np.random.uniform(2, 15))
            confidence = np.random.choice(["low", "nominal", "high"], p=[0.1, 0.5, 0.4])

        h3_idx = latlng_to_h3(lat, lon, settings.H3_RESOLUTION)

        rows.append({
            "hotspot_id": f"FIRMS-SYN-{i + 10001}",
            "latitude": round(lat, 5),
            "longitude": round(lon, 5),
            "h3_index": str(h3_idx),
            "bright_ti4": round(max(280.0, bright_ti4), 2),
            "bright_ti5": round(max(250.0, bright_ti4 - float(np.random.uniform(20, 50))), 2),
            "scan": round(float(np.random.uniform(0.35, 1.2)), 2),
            "track": round(float(np.random.uniform(0.35, 1.2)), 2),
            "acq_date": "2026-08-20",
            "acq_time": f"{np.random.randint(0, 23):02d}{np.random.randint(0, 59):02d}",
            "satellite": str(np.random.choice(SATELLITES)),
            "confidence": str(confidence),
            "frp": round(max(0.1, frp), 2),
            "daynight": str(np.random.choice(["D", "N"], p=[0.65, 0.35])),
            "persistence_90d": persistence,
            "observed_days_in_90d": int(np.random.choice([79, 85, 90], p=[0.2, 0.3, 0.5])),
            "landuse_tag": landuse,
            "canopy_cover_pct": round(canopy, 1),
            "distance_to_road_km": round(dist_road, 2),
            "distance_to_water_km": round(dist_water, 2),
            "type": 2 if cls == "industrial" else (1 if cls == "mining" else 0),
            "target_label": cls_idx,
            "target_class": cls,
        })

    return pd.DataFrame(rows)


def init_duckdb_feature_store(df: pd.DataFrame):
    """Populate DuckDB H3 Feature Store with pre-computed contextual features."""
    conn = duckdb.connect(settings.DUCKDB_PATH)
    conn.execute("""
        CREATE OR REPLACE TABLE h3_spatial_context (
            h3_index VARCHAR PRIMARY KEY,
            landuse_tag VARCHAR,
            canopy_cover_pct DOUBLE,
            distance_to_road_km DOUBLE,
            distance_to_water_km DOUBLE,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    context_df = df[["h3_index", "landuse_tag", "canopy_cover_pct",
                      "distance_to_road_km", "distance_to_water_km"]].drop_duplicates(subset=["h3_index"])
    conn.register("context_view", context_df)
    conn.execute("""
        INSERT OR REPLACE INTO h3_spatial_context
        SELECT h3_index, landuse_tag, canopy_cover_pct, distance_to_road_km, distance_to_water_km, CURRENT_TIMESTAMP
        FROM context_view
    """)

    count = conn.execute("SELECT count(*) FROM h3_spatial_context").fetchone()[0]
    print(f"[Feature Store] Initialized DuckDB H3 Context Store with {count} unique hexagonal cells.")
    conn.close()


if __name__ == "__main__":
    df = generate_mock_firms_data(n_samples=2000)
    sample_path = settings.DATA_DIR / "sample_firms.csv"
    df.to_csv(sample_path, index=False)
    print(f"[Data] Generated 4-class synthetic FIRMS dataset: {sample_path} ({len(df)} rows)")
    init_duckdb_feature_store(df)
