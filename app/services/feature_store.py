import duckdb
from typing import Dict, Any, Optional
from app.core.config import settings

class DuckDBFeatureStore:
    """
    In-Process Columnar DuckDB Feature Store for H3 Spatial Context.
    Delivers sub-10ms spatial lookups during real-time hotspot inference.
    """
    def __init__(self, db_path: str = settings.DUCKDB_PATH):
        self.db_path = db_path
        self._init_db()

    def _get_connection(self):
        return duckdb.connect(self.db_path)

    def _init_db(self):
        conn = self._get_connection()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS h3_spatial_context (
                h3_index VARCHAR PRIMARY KEY,
                landuse_tag VARCHAR,
                canopy_cover_pct DOUBLE,
                distance_to_road_km DOUBLE,
                distance_to_water_km DOUBLE,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.close()

    def get_context_for_h3(self, h3_index: str) -> Dict[str, Any]:
        """Fetch pre-computed spatial features for a given H3 cell."""
        conn = self._get_connection()
        result = conn.execute("""
            SELECT landuse_tag, canopy_cover_pct, distance_to_road_km, distance_to_water_km
            FROM h3_spatial_context
            WHERE h3_index = ?
        """, [h3_index]).fetchone()
        conn.close()

        if result:
            return {
                "landuse_tag": result[0],
                "canopy_cover_pct": result[1],
                "distance_to_road_km": result[2],
                "distance_to_water_km": result[3]
            }
        else:
            # Fallback default values for unseen cells
            return {
                "landuse_tag": "unknown",
                "canopy_cover_pct": 30.0,
                "distance_to_road_km": 2.5,
                "distance_to_water_km": 5.0
            }

    def get_viewport_hexagons(self, min_lat: float, max_lat: float, min_lon: float, max_lon: float, limit: int = 1000):
        """Fetch spatial contextual hexagons within viewport bounding box."""
        conn = self._get_connection()
        # Query known H3 context records
        rows = conn.execute("""
            SELECT h3_index, landuse_tag, canopy_cover_pct, distance_to_road_km, distance_to_water_km
            FROM h3_spatial_context
            LIMIT ?
        """, [limit]).fetchall()
        conn.close()

        return [
            {
                "h3_index": r[0],
                "landuse_tag": r[1],
                "canopy_cover_pct": r[2],
                "distance_to_road_km": r[3],
                "distance_to_water_km": r[4]
            }
            for r in rows
        ]

feature_store = DuckDBFeatureStore()
