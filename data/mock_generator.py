import duckdb
import pandas as pd
import numpy as np
import os
from pathlib import Path
import sys

# Ensure project root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.core.config import settings
from pipeline.feature_engineering import latlng_to_h3

LANDUSE_TYPES = ["forest", "farmland", "industrial", "mining", "residential", "waterbody", "grassland"]
SATELLITES = ["SNPP", "NOAA-20", "Aqua", "Terra"]

def generate_mock_firms_data(n_samples: int = 1500, random_state: int = 42) -> pd.DataFrame:
    """Generates synthetic NASA FIRMS hotspots with realistic spatial and physical signatures across 6 classes."""
    np.random.seed(random_state)
    
    # Generate points clustered across 4 major regions in India (Central India, Punjab, Western Ghats, Odisha Industrial)
    regions = [
        {"name": "Central_Forest", "lat_center": 22.0, "lon_center": 79.0, "spread": 1.2, "primary_class": 0},      # Wildfire
        {"name": "Punjab_Agri", "lat_center": 30.5, "lon_center": 75.8, "spread": 0.8, "primary_class": 1},         # Agricultural Burn
        {"name": "Gujarat_Industrial", "lat_center": 22.3, "lon_center": 73.2, "spread": 0.5, "primary_class": 2},  # Industrial/Gas Flare
        {"name": "Odisha_Mining", "lat_center": 21.8, "lon_center": 85.3, "spread": 0.6, "primary_class": 3}        # Mining Activity
    ]
    
    rows = []
    for i in range(n_samples):
        reg = np.random.choice(regions)
        lat = float(np.random.normal(reg["lat_center"], reg["spread"]))
        lon = float(np.random.normal(reg["lon_center"], reg["spread"]))
        
        # Decide true class (mostly region's primary class, with occasional noise/urban/other)
        if np.random.rand() < 0.70:
            target_class_idx = reg["primary_class"]
        else:
            target_class_idx = int(np.random.choice([0, 1, 2, 3, 4, 5]))
            
        target_class_name = settings.TARGET_CLASSES[target_class_idx]
        
        # Characteristic signatures based on physical nature
        if target_class_name == "Wildfire":
            brightness = float(np.random.normal(360, 25))
            frp = float(np.random.exponential(80) + 20)
            persistence = int(np.random.randint(1, 10))
            landuse = "forest"
            canopy = float(np.random.uniform(60, 95))
            dist_road = float(np.random.uniform(5, 30))
            dist_water = float(np.random.uniform(3, 20))
        elif target_class_name == "Agricultural Burn":
            brightness = float(np.random.normal(325, 15))
            frp = float(np.random.exponential(25) + 5)
            persistence = int(np.random.randint(1, 5))
            landuse = "farmland"
            canopy = float(np.random.uniform(5, 25))
            dist_road = float(np.random.uniform(0.5, 5))
            dist_water = float(np.random.uniform(1, 10))
        elif target_class_name == "Industrial/Gas Flare":
            brightness = float(np.random.normal(375, 30))
            frp = float(np.random.exponential(120) + 50)
            persistence = int(np.random.randint(65, 90)) # High persistence over 90d
            landuse = "industrial"
            canopy = float(np.random.uniform(0, 10))
            dist_road = float(np.random.uniform(0.1, 1.5))
            dist_water = float(np.random.uniform(0.5, 8))
        elif target_class_name == "Mining Activity":
            brightness = float(np.random.normal(340, 20))
            frp = float(np.random.exponential(40) + 15)
            persistence = int(np.random.randint(30, 75))
            landuse = "mining"
            canopy = float(np.random.uniform(0, 20))
            dist_road = float(np.random.uniform(0.2, 3))
            dist_water = float(np.random.uniform(2, 15))
        elif target_class_name == "Urban/Infrastructure":
            brightness = float(np.random.normal(315, 10))
            frp = float(np.random.exponential(15) + 2)
            persistence = int(np.random.randint(15, 45))
            landuse = "residential"
            canopy = float(np.random.uniform(0, 15))
            dist_road = float(np.random.uniform(0.05, 0.8))
            dist_water = float(np.random.uniform(1, 6))
        else: # False Positive / Noise
            brightness = float(np.random.normal(305, 8))
            frp = float(np.random.uniform(1, 8))
            persistence = int(np.random.randint(0, 2))
            landuse = "waterbody" if np.random.rand() < 0.5 else "grassland"
            canopy = float(np.random.uniform(0, 40))
            dist_road = float(np.random.uniform(1, 20))
            dist_water = float(np.random.uniform(0.01, 1.0))
            
        h3_idx = latlng_to_h3(lat, lon, settings.H3_RESOLUTION)
        
        rows.append({
            "hotspot_id": f"FIRMS-IND-{i+10001}",
            "latitude": round(lat, 5),
            "longitude": round(lon, 5),
            "h3_index": str(h3_idx),
            "brightness": round(max(280.0, brightness), 2),
            "scan": round(float(np.random.uniform(0.35, 1.2)), 2),
            "track": round(float(np.random.uniform(0.35, 1.2)), 2),
            "acq_date": "2026-08-20",
            "acq_time": f"{np.random.randint(0,23):02d}{np.random.randint(0,59):02d}",
            "satellite": str(np.random.choice(SATELLITES)),
            "confidence": round(float(np.random.uniform(50.0, 100.0)), 1),
            "bright_t31": round(max(270.0, brightness - np.random.uniform(15, 45)), 2),
            "frp": round(max(0.1, frp), 2),
            "daynight": str(np.random.choice(["D", "N"], p=[0.65, 0.35])),
            "persistence_90d": persistence,
            "observed_days_in_90d": int(np.random.choice([79, 85, 90], p=[0.2, 0.3, 0.5])), # Simulation of missing days
            "landuse_tag": landuse,
            "canopy_cover_pct": round(canopy, 1),
            "distance_to_road_km": round(dist_road, 2),
            "distance_to_water_km": round(dist_water, 2),
            "type": 2 if target_class_name == "Industrial/Gas Flare" else (0 if target_class_name in ["Wildfire", "Agricultural Burn"] else 1),
            "target_label": target_class_idx,
            "target_class": target_class_name
        })
        
    return pd.DataFrame(rows)

def init_duckdb_feature_store(df: pd.DataFrame):
    """Populate DuckDB H3 Feature Store with pre-computed contextual features."""
    conn = duckdb.connect(settings.DUCKDB_PATH)
    
    # Create H3 contextual features table
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
    
    # Extract unique H3 cells and their context
    context_df = df[["h3_index", "landuse_tag", "canopy_cover_pct", "distance_to_road_km", "distance_to_water_km"]].drop_duplicates(subset=["h3_index"])
    
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
    print(f"[Data] Generated synthetic FIRMS dataset: {sample_path} ({len(df)} rows)")
    init_duckdb_feature_store(df)
