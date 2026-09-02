from fastapi import APIRouter, Query
from app.services.feature_store import feature_store

router = APIRouter()

@router.get("/spatial/viewport")
def get_viewport_hexagons(
    min_lat: float = Query(..., ge=-90.0, le=90.0),
    max_lat: float = Query(..., ge=-90.0, le=90.0),
    min_lon: float = Query(..., ge=-180.0, le=180.0),
    max_lon: float = Query(..., ge=-180.0, le=180.0),
    zoom: float = Query(8.0, ge=1.0, le=20.0),
    limit: int = Query(500, ge=10, le=5000)
):
    """
    Viewport-Culling spatial query for Deck.gl frontend rendering.
    Enforces bounding-box limits to prevent DOM overload and browser crashes.
    """
    # Guard against excessively large bounding boxes (e.g. zooming out to entire globe)
    lat_span = max_lat - min_lat
    lon_span = max_lon - min_lon
    
    if lat_span > 20.0 or lon_span > 20.0:
        # Aggregated macro view
        hexagons = feature_store.get_viewport_hexagons(min_lat, max_lat, min_lon, max_lon, limit=100)
        mode = "aggregated_macro"
    else:
        hexagons = feature_store.get_viewport_hexagons(min_lat, max_lat, min_lon, max_lon, limit=limit)
        mode = "detailed_hexagons"

    return {
        "mode": mode,
        "zoom": zoom,
        "total_hexagons": len(hexagons),
        "hexagons": hexagons
    }
