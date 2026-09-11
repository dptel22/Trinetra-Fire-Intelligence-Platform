"""
Generate synthetic demo serving parquets for PS26162 backend.

Produces both files needed by feature_store.py:
  data/processed/sih2026_h3_daily_features_firms.parquet
  data/processed/sih2026_h3_daily_features_with_osm_wri.parquet

Uses realistic H3 res-8 cells spread across India's major industrial/mining
belts, agricultural zones, and forest areas.
"""
import random
from pathlib import Path

import h3
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data" / "processed"
DATA_DIR.mkdir(parents=True, exist_ok=True)

random.seed(42)
np.random.seed(42)

# Representative lat/lon anchors inside India, with expected class bias
HOTSPOT_ANCHORS = [
    # Industrial / power plants
    (19.0, 72.8, "industrial"),
    (22.8, 86.2, "industrial"),
    (21.2, 81.4, "industrial"),
    (25.3, 86.4, "industrial"),
    (12.9, 77.6, "industrial"),
    (17.4, 78.5, "industrial"),
    (28.6, 77.2, "industrial"),
    (23.0, 72.6, "industrial"),
    (20.9, 85.1, "industrial"),
    (26.9, 75.8, "industrial"),
    # Mining / quarries
    (23.6, 85.4, "mining"),
    (22.2, 82.7, "mining"),
    (21.5, 83.9, "mining"),
    (15.4, 74.0, "mining"),
    (14.7, 76.0, "mining"),
    (24.6, 74.7, "mining"),
    (24.0, 85.3, "mining"),
    # Agricultural burns
    (30.9, 75.9, "agricultural_burn"),
    (29.9, 76.6, "agricultural_burn"),
    (27.1, 80.9, "agricultural_burn"),
    (25.7, 85.1, "agricultural_burn"),
    (16.5, 80.6, "agricultural_burn"),
    (18.0, 77.5, "agricultural_burn"),
    # Wildfires
    (22.2, 78.2, "wildfire"),
    (24.4, 82.8, "wildfire"),
    (19.8, 84.0, "wildfire"),
    (26.0, 91.7, "wildfire"),
    (11.4, 76.7, "wildfire"),
    (30.3, 78.9, "wildfire"),
    (33.4, 75.5, "wildfire"),
]

STATE_MAP = {
    "industrial": [
        ("Maharashtra", "within"),
        ("Jharkhand", "within"),
        ("Chhattisgarh", "within"),
        ("Gujarat", "within"),
        ("Karnataka", "within"),
        ("Telangana", "within"),
        ("Bihar", "within"),
        ("Odisha", "within"),
        ("Rajasthan", "within"),
    ],
    "mining": [
        ("Jharkhand", "within"),
        ("Chhattisgarh", "within"),
        ("Odisha", "within"),
        ("Goa", "within"),
        ("Karnataka", "within"),
        ("Rajasthan", "within"),
    ],
    "agricultural_burn": [
        ("Punjab", "within"),
        ("Haryana", "within"),
        ("Uttar Pradesh", "within"),
        ("Bihar", "within"),
        ("Andhra Pradesh", "within"),
        ("Telangana", "within"),
    ],
    "wildfire": [
        ("Madhya Pradesh", "within"),
        ("Odisha", "within"),
        ("Assam", "within"),
        ("Tamil Nadu", "within"),
        ("Uttarakhand", "within"),
        ("Jammu and Kashmir", "nearest_boundary_tie_break"),
    ],
}


def jitter(v, scale=0.12):
    return v + np.random.uniform(-scale, scale)


def gen_daily_row(h3_08, acq_date, fire_class):
    is_industrial = fire_class == "industrial"
    is_mining = fire_class == "mining"
    is_agri = fire_class == "agricultural_burn"

    frp_max = float(max(1.0, np.random.exponential(35 if is_industrial else 15 if is_mining else 8 if is_agri else 20)))
    frp_mean = round(frp_max * np.random.uniform(0.4, 0.85), 2)
    n_det = max(1, int(np.random.poisson(6 if is_industrial else 3 if is_mining else 2 if is_agri else 4)))
    daynight = "N" if is_industrial and random.random() < 0.6 else "D"

    active_7 = int(np.random.poisson(5 if is_industrial else 2 if is_mining else 1 if is_agri else 2))
    active_30 = min(30, int(active_7 * np.random.uniform(2, 5)))
    active_90 = min(90, int(active_30 * np.random.uniform(1.5, 3)))

    ts = pd.Timestamp(acq_date)
    doy = ts.day_of_year
    return {
        "h3_08": h3_08,
        "acq_date": acq_date,
        "frp_max": round(frp_max, 2),
        "frp_mean": frp_mean,
        "n_detections": n_det,
        "ti4_max": round(np.random.uniform(320, 380), 2),
        "is_saturated_max": int(frp_max > 100),
        "scan_mean": round(np.random.uniform(0.4, 1.2), 3),
        "track_mean": round(np.random.uniform(0.4, 1.2), 3),
        "confidence_high_any": 1,
        "pct_high_confidence": round(np.random.uniform(0.6, 1.0), 3),
        "frp_max_night": round(frp_max if daynight == "N" else frp_max * 0.2, 2),
        "frp_max_day": round(frp_max if daynight == "D" else frp_max * 0.2, 2),
        "n_detections_night": n_det if daynight == "N" else 0,
        "n_detections_day": n_det if daynight == "D" else 0,
        "scan_max": round(np.random.uniform(0.5, 1.5), 3),
        "track_max": round(np.random.uniform(0.5, 1.5), 3),
        "daynight": daynight,
        "satellite_nunique": random.randint(1, 2),
        "frp_max_lag7": round(frp_max * np.random.uniform(0.5, 1.2) if active_7 > 1 else 0, 2),
        "active_days_7d": active_7,
        "frp_max_lag30": round(frp_max * np.random.uniform(0.4, 1.0) if active_30 > 3 else 0, 2),
        "active_days_30d": active_30,
        "active_days_90d": active_90,
        "acq_month": ts.month,
        "doy_sin": float(np.sin(2 * np.pi * doy / 365.25)),
        "doy_cos": float(np.cos(2 * np.pi * doy / 365.25)),
        "is_first_observation": int(active_90 <= 1),
    }


def gen_osm_wri_row(h3_08, lat, lon, fire_class, state, method):
    is_industrial = fire_class == "industrial"
    is_mining = fire_class == "mining"
    is_agri = fire_class == "agricultural_burn"
    return {
        "h3_08": h3_08,
        "h3_lat": round(lat, 6),
        "h3_lon": round(lon, 6),
        "state": state,
        "state_assignment_method": method,
        "dist_wri_solar_km": round(np.random.exponential(15), 3),
        "n_wri_solar_10km": int(np.random.poisson(0.5 if not is_industrial else 2)),
        "dist_wri_coal_km": round(np.random.exponential(5 if is_industrial else 30), 3),
        "n_wri_coal_10km": int(np.random.poisson(1 if is_industrial else 0.1)),
        "dist_wri_wind_km": round(np.random.exponential(20), 3),
        "n_wri_wind_10km": 0,
        "dist_wri_gas_km": round(np.random.exponential(10 if is_industrial else 40), 3),
        "n_wri_gas_10km": int(np.random.poisson(0.3)),
        "dist_wri_hydro_km": round(np.random.exponential(30), 3),
        "n_wri_hydro_10km": 0,
        "dist_wri_biomass_km": round(np.random.exponential(25), 3),
        "n_wri_biomass_10km": 0,
        "dist_wri_oil_km": round(np.random.exponential(20 if is_industrial else 50), 3),
        "n_wri_oil_10km": int(np.random.poisson(0.2)),
        "dist_wri_nuclear_km": round(np.random.exponential(200), 3),
        "n_wri_nuclear_10km": 0,
        "dist_osm_industrial_km": round(np.random.exponential(0.5 if is_industrial else 15), 3),
        "n_osm_industrial_5km": int(np.random.poisson(3 if is_industrial else 0.2)),
        "dist_osm_quarry_km": round(np.random.exponential(1 if is_mining else 25), 3),
        "n_osm_quarry_5km": int(np.random.poisson(2 if is_mining else 0.1)),
        "dist_osm_farmland_km": round(np.random.exponential(0.3 if is_agri else 8), 3),
        "n_osm_farmland_5km": int(np.random.poisson(5 if is_agri else 1)),
        "dist_osm_mineshaft_km": round(np.random.exponential(1.5 if is_mining else 30), 3),
        "n_osm_mineshaft_5km": int(np.random.poisson(1 if is_mining else 0)),
        "dist_osm_adit_km": round(np.random.exponential(2 if is_mining else 35), 3),
        "n_osm_adit_5km": int(np.random.poisson(0.5 if is_mining else 0)),
        "dist_osm_power_infra_km": round(np.random.exponential(0.3 if is_industrial else 5), 3),
        "n_osm_power_infra_5km": int(np.random.poisson(4 if is_industrial else 0.5)),
    }


print("Generating demo serving parquets for PS26162 backend...")

today = pd.Timestamp.now().normalize()
dates = [(today - pd.Timedelta(days=i)).strftime("%Y-%m-%d") for i in range(9, -1, -1)]

daily_rows = []
osm_wri_rows = []
seen_cells = {}

for lat_anchor, lon_anchor, fire_class in HOTSPOT_ANCHORS:
    n_cells = random.randint(4, 8)
    for ci in range(n_cells):
        lat = max(6.75, min(37.10, jitter(lat_anchor)))
        lon = max(68.03, min(97.42, jitter(lon_anchor)))
        h3_08 = h3.latlng_to_cell(lat, lon, 8)
        cell_lat, cell_lon = h3.cell_to_latlng(h3_08)

        if h3_08 not in seen_cells:
            state_list = STATE_MAP.get(fire_class, [("Unknown", "within")])
            state, method = random.choice(state_list)
            seen_cells[h3_08] = (state, method)
            osm_wri_rows.append(gen_osm_wri_row(h3_08, cell_lat, cell_lon, fire_class, state, method))

        for acq_date in dates:
            if random.random() < 0.65:
                daily_rows.append(gen_daily_row(h3_08, acq_date, fire_class))

print(f"  Generated {len(daily_rows)} daily rows across {len(seen_cells)} unique H3 cells")
print(f"  Date range: {dates[0]} to {dates[-1]}")

df_daily = pd.DataFrame(daily_rows)
df_static = pd.DataFrame(osm_wri_rows)

daily_path = DATA_DIR / "sih2026_h3_daily_features_firms.parquet"
static_path = DATA_DIR / "sih2026_h3_daily_features_with_osm_wri.parquet"

df_daily.to_parquet(daily_path, index=False)
df_static.to_parquet(static_path, index=False)

print(f"  Wrote: {daily_path}")
print(f"  Wrote: {static_path}")
print("Done.")
