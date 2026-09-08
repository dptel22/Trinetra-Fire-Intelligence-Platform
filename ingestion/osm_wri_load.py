"""OSM/WRI static features + state assignment from the raw local inputs.

Ports the notebook logic (notebooks/eda/osi-wri-data.ipynb cells 7/9/13/15)
into callable functions:

- WRI Global Power Plant distances: cell 9 — per-fuel nearest-neighbor distance
  (km) and 10 km count, computed in the locked projected CRS EPSG:7755.
- OSM feature extraction: cell 13's osmium tags-filter, ported to pyosmium
  (same six tag filters; the CLI is not required — pyosmium ships Windows
  wheels). The extraction runs ONCE over the 1.7 GB India PBF and is cached to
  a parquet; every subsequent run computes distances from the cache.
- OSM distances/counts: cell 15 — centroid-to-centroid distances in EPSG:7755,
  counts within 5 km, per CATEGORY_TAGS.
- State assignment: cell 7 — point-in-polygon with nearest-boundary
  resolution, using the SAME pinned shapefile source as the notebook
  (AnujTiwari/India-State-and-Country-Shapefile-Updated-Jan-2020), pinned to
  commit 90b700cf2459be79b66f677a6e2c8dd2eff17c30 with sha256 verification.

Fail-loud contract: raw inputs are validated up front with exact paths.
"""

from __future__ import annotations

import hashlib
import logging
import time
from pathlib import Path

import numpy as np
import pandas as pd
from pyproj import Transformer
from shapely.geometry import Point, Polygon, shape
from shapely.ops import transform as shp_transform
from shapely.strtree import STRtree
from sklearn.neighbors import NearestNeighbors

logger = logging.getLogger("ingestion.osm_wri")

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

# --- Raw inputs (validated fail-loud before any processing) -----------------

PBF_GLOB = "data/raw/*.osm.pbf"
PBF_PATH = DATA_DIR / "raw" / "india-260907.osm.pbf"
WRI_CSV = DATA_DIR / "raw" / "globalpowerplantdatabasev130" / "global_power_plant_database.csv"

OSM_CACHE_PATH = DATA_DIR / "processed" / "osm_features_cache.parquet"

# --- State boundary source: pinned commit + sha256 (no "latest" fetching) ---

STATE_SHP_DIR = DATA_DIR / "raw" / "india_state_boundary"
STATE_SHP_BASENAME = "India_State_Boundary"
STATE_SOURCE_COMMIT = "90b700cf2459be79b66f677a6e2c8dd2eff17c30"
STATE_SOURCE_URL_TEMPLATE = (
    "https://raw.githubusercontent.com/AnujTiwari/India-State-and-Country-Shapefile-Updated-Jan-2020/"
    + STATE_SOURCE_COMMIT
    + "/India_State_Boundary.{ext}"
)
STATE_SHA256 = {
    "shp": "f2da6f9be7cfbcf0b5793d427820be13fa3ab478c72d29bf7475defb5e7dc6e3",
    "shx": "016e0fb886b74383a308223dec14faa00200e0018d09e5b69431ddc4e29ef591",
    "dbf": "c5fca70f77a98c2f61cec2994e19bd36c237e4adb6dd8581648f4db53362700d",
    "prj": "f2e7fb14d55bdd8d6a3bc2c272a48729d8f9d0ad72936e20eae6a9a81c2fccd0",
    "cpg": "3ad3031f5503a4404af825262ee8232cc04d4ea6683d42c5dd0a2f2a27ac9824",
}

# osi-wri-data.ipynb cell 3.
TRAIN_STATES = ["Maharashtra", "Karnataka", "Madhya Pradesh", "Punjab", "Andhra Pradesh", "Telangana"]
TEST_A_STATES = ["Gujarat", "Tamil Nadu"]
TEST_B_STATES = ["Jharkhand", "Rajasthan"]
SERVING_STATES = TRAIN_STATES + TEST_A_STATES + TEST_B_STATES

# osi-wri-data.ipynb cell 7: source-name fixes (37 shapes, 36 unique names).
STATE_NAME_FIXES = {
    "Chhattishgarh": "Chhattisgarh",
    "Telengana": "Telangana",
    "Tamilnadu": "Tamil Nadu",
}

PROJECT_CRS = "EPSG:7755"
_transformer_7755 = Transformer.from_crs("EPSG:4326", PROJECT_CRS, always_xy=True)
_transformer_4326 = Transformer.from_crs("EPSG:3857", "EPSG:4326", always_xy=True)  # shapefile native CRS

# osi-wri-data.ipynb cell 15.
CATEGORY_TAGS = {
    "industrial": ("landuse", "industrial"),
    "quarry": ("landuse", "quarry"),
    "farmland": ("landuse", "farmland"),
    "mineshaft": ("man_made", "mineshaft"),
    "adit": ("man_made", "adit"),
    "power_infra": ("power", ["plant", "substation", "generator"]),
}

# Locked contract columns (from sih2026_h3_daily_features_with_osm_wri.parquet).
WRI_FUELS = ["solar", "coal", "wind", "gas", "hydro", "biomass", "oil", "nuclear"]
WRI_COLUMNS = (
    [f"dist_wri_{fuel}_km" for fuel in WRI_FUELS]
    + [f"n_wri_{fuel}_10km" for fuel in WRI_FUELS]
)
OSM_COLUMNS = (
    [f"dist_osm_{name}_km" for name in CATEGORY_TAGS]
    + [f"n_osm_{name}_5km" for name in CATEGORY_TAGS]
)


class RawInputError(RuntimeError):
    """Raised when a raw input file is missing or empty (fail loud, early)."""


def validate_raw_inputs() -> dict[str, Path]:
    """Confirm the OSM PBF, WRI CSV and state shapefile exist and are non-empty.

    This is the explicit fix for the original failure mode: a missing raw input
    surfaced three layers deep as a FileNotFoundError instead of a clear error.
    """
    import glob

    required: dict[str, Path] = {}
    pbf_matches = sorted(glob.glob(str(REPO_ROOT / PBF_GLOB)))
    if PBF_PATH.exists():
        pbf = PBF_PATH
    elif pbf_matches:
        pbf = Path(pbf_matches[-1])
    else:
        pbf = PBF_PATH
    required["osm_pbf"] = pbf
    required["wri_csv"] = WRI_CSV
    for ext in ("shp", "shx", "dbf", "prj"):
        required[f"state_shp.{ext}"] = STATE_SHP_DIR / f"{STATE_SHP_BASENAME}.{ext}"

    for name, path in required.items():
        if not path.exists():
            raise RawInputError(f"Required raw input '{name}' is missing: {path}")
        if path.stat().st_size == 0:
            raise RawInputError(f"Required raw input '{name}' is empty: {path}")
    logger.info("Raw inputs validated: %s", {k: str(v) for k, v in required.items()})
    return required


# ---------------------------------------------------------------------------
# WRI distances (osi-wri-data.ipynb cell 9, verbatim math)
# ---------------------------------------------------------------------------


def load_wri_india(wri_csv: Path | None = None) -> pd.DataFrame:
    path = wri_csv or WRI_CSV
    wri = pd.read_csv(path, low_memory=False)
    wri_india = wri[wri["country_long"] == "India"].copy()
    logger.info("WRI India plants (all fuel types): %d", len(wri_india))
    return wri_india


def project_lonlat_to_7755(lon, lat):
    x, y = _transformer_7755.transform(np.asarray(lon, dtype="float64"), np.asarray(lat, dtype="float64"))
    return np.column_stack([np.atleast_1d(x), np.atleast_1d(y)])


def _nn_distance_km(query_xy, ref_xy):
    if len(ref_xy) == 0:
        return np.full(len(query_xy), np.nan, dtype="float64")
    nn = NearestNeighbors(n_neighbors=1, algorithm="ball_tree", metric="euclidean")
    nn.fit(ref_xy)
    d, _ = nn.kneighbors(query_xy)
    return d[:, 0] / 1000.0


def _nn_count_within_km(query_xy, ref_xy, radius_km):
    if len(ref_xy) == 0:
        return np.zeros(len(query_xy), dtype="int64")
    nn = NearestNeighbors(radius=radius_km * 1000.0, algorithm="ball_tree", metric="euclidean")
    nn.fit(ref_xy)
    counts = nn.radius_neighbors(query_xy, return_distance=False)
    return np.fromiter((len(x) for x in counts), dtype="int64", count=len(query_xy))


def compute_wri_features(cells: pd.DataFrame, wri_india: pd.DataFrame | None = None) -> pd.DataFrame:
    """Per-fuel dist_wri_*_km (nearest, km) and n_wri_*_10km for each cell row.

    `cells` needs latitude/longitude (H3 cell centroids). Missing fuel columns
    in the source data yield NaN distance / 0 count, matching the notebook.
    """
    wri = load_wri_india() if wri_india is None else wri_india
    query_xy = project_lonlat_to_7755(cells["longitude"].to_numpy(), cells["latitude"].to_numpy())

    out = pd.DataFrame(index=cells.index)
    fuels_present = {f.lower().replace(" ", "_") for f in wri["primary_fuel"].dropna().unique()}
    for fuel in WRI_FUELS:
        if fuel not in fuels_present:
            out[f"dist_wri_{fuel}_km"] = np.nan
            out[f"n_wri_{fuel}_10km"] = 0
            continue
        sub = wri[wri["primary_fuel"].str.lower().str.replace(" ", "_") == fuel]
        ref_xy = project_lonlat_to_7755(sub["longitude"].to_numpy(), sub["latitude"].to_numpy())
        out[f"dist_wri_{fuel}_km"] = _nn_distance_km(query_xy, ref_xy)
        out[f"n_wri_{fuel}_10km"] = _nn_count_within_km(query_xy, ref_xy, radius_km=10.0)
    return out


# ---------------------------------------------------------------------------
# OSM extraction via pyosmium (cell 13's tag filters) + distances (cell 15)
# ---------------------------------------------------------------------------


def _tag_category(tags) -> str | None:
    for name, (key, val) in CATEGORY_TAGS.items():
        v = tags.get(key) if tags is not None else None
        if v is None:
            continue
        if isinstance(val, list):
            if v in val:
                return name
        elif v == val:
            return name
    return None


def _centroid_lonlat(coords: list[tuple[float, float]]) -> tuple[float, float]:
    if len(coords) >= 4:
        poly = Polygon(coords)
        if poly.is_valid and not poly.is_empty:
            c = poly.centroid
            return float(c.x), float(c.y)
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    return float(sum(xs) / len(xs)), float(sum(ys) / len(ys))


def extract_osm_points_from_pbf(pbf_path: Path) -> pd.DataFrame:
    """pyosmium port of `osmium tags-filter` + `osmium export` (memory-bounded).

    Three sequential scans of the PBF, never building a full-file node
    location index (the naive `apply_file(locations=True, idx="flex_mem")`
    approach buffers locations for every node in India — multi-GB RSS):

      1. Tag scan: matching nodes (coords kept directly), matching ways (node
         refs), matching relations (member way ids).
      2. Way scan: node refs for the ways needed in step 1.
      3. Node scan: coords for the node ids referenced by those ways.

    Closed ways become polygon centroids; open ways use vertex means;
    multipolygon relations use the centroid of their member-way vertices.
    NOTE (documented best-effort projection, same stance as
    pipeline/aggregation.py): the notebook took EPSG:7755 centroids of full
    exported geometries via geopandas; here centroids are computed in lon/lat
    then projected — equivalent for the small parcels these tags produce, not
    bit-identical for very large multipolygons.
    """
    import osmium

    t_total = time.perf_counter()
    key_filter = osmium.filter.KeyFilter("landuse", "man_made", "power")

    # Pass 1 (C++ key filter: only entities carrying one of the six tag keys
    # reach Python): matching nodes keep their coords directly, matching ways
    # and relation member ways record id -> category.
    node_rows: list[tuple[str, float, float]] = []
    way_cat: dict[int, str] = {}
    rel_member_way_cat: dict[int, str] = {}
    t0 = time.perf_counter()
    for obj in osmium.FileProcessor(str(pbf_path)).with_filter(key_filter):
        cat = _tag_category(obj.tags)
        if not cat:
            continue
        if obj.is_node():
            node_rows.append((cat, obj.location.lon, obj.location.lat))
        elif obj.is_way():
            way_cat[obj.id] = cat
        elif obj.is_relation():
            for m in obj.members:
                if str(m.type) == "w" and m.ref not in rel_member_way_cat:
                    rel_member_way_cat[m.ref] = cat
    logger.info(
        "PBF pass 1/3 (tags): %.1fs — %d nodes, %d ways, %d relation-member ways",
        time.perf_counter() - t0, len(node_rows), len(way_cat), len(rel_member_way_cat),
    )

    needed_ways = set(way_cat) | set(rel_member_way_cat)

    # Pass 2 (C++ id filter): node refs for the needed ways.
    way_nodes: dict[int, list[int]] = {}
    t0 = time.perf_counter()
    for obj in osmium.FileProcessor(str(pbf_path)).with_filter(osmium.filter.IdFilter(needed_ways)):
        if obj.is_way():
            way_nodes[obj.id] = [nd.ref for nd in obj.nodes]
    logger.info("PBF pass 2/3 (way geometry): %.1fs — %d/%d ways captured", time.perf_counter() - t0, len(way_nodes), len(needed_ways))

    needed_nodes: set[int] = set()
    for refs in way_nodes.values():
        needed_nodes.update(refs)

    # Pass 3 (C++ id filter): coords for those node ids only.
    locs: dict[int, tuple[float, float]] = {}
    t0 = time.perf_counter()
    for obj in osmium.FileProcessor(str(pbf_path)).with_filter(osmium.filter.IdFilter(needed_nodes)):
        if obj.is_node():
            locs[obj.id] = (obj.location.lon, obj.location.lat)
    logger.info("PBF pass 3/3 (node coords): %.1fs — %d/%d coords resolved", time.perf_counter() - t0, len(locs), len(needed_nodes))

    # Assemble one representative point per feature: nodes direct; closed ways
    # as polygon centroids; open ways as vertex means; multipolygon-relation
    # member ways carry the relation's category (one point per member ring —
    # a documented approximation of the notebook's single exported MultiPolygon).
    rows = list(node_rows)
    for way_id, cat in way_cat.items():
        refs = way_nodes.get(way_id)
        if not refs:
            continue
        coords = [locs[r] for r in refs if r in locs]
        if len(coords) < 2 or len(coords) < len(refs):
            continue
        rows.append((cat, *_centroid_lonlat(coords)))
    for way_id, cat in rel_member_way_cat.items():
        refs = way_nodes.get(way_id)
        if not refs:
            continue
        coords = [locs[r] for r in refs if r in locs]
        if len(coords) < 2:
            continue
        rows.append((cat, *_centroid_lonlat(coords)))

    df = pd.DataFrame(rows, columns=["category", "lon", "lat"])
    logger.info("pyosmium extraction over %s took %.1fs total (%d features)", pbf_path.name, time.perf_counter() - t_total, len(df))
    if df.empty:
        raise RawInputError(
            f"OSM extraction produced 0 features from {pbf_path} — the PBF may be truncated or wrong"
        )
    return df


def build_osm_feature_cache(pbf_path: Path | None = None, force: bool = False) -> tuple[pd.DataFrame, dict]:
    """Extract once, cache to data/processed/osm_features_cache.parquet.

    Rebuilds when the cache is missing/empty or older than the PBF. Returns
    (osm_points_df, meta) with measured build/load timings.
    """
    pbf = pbf_path or PBF_PATH
    meta: dict = {"pbf": str(pbf)}
    t0 = time.perf_counter()
    if not force and OSM_CACHE_PATH.exists() and OSM_CACHE_PATH.stat().st_size > 0:
        if OSM_CACHE_PATH.stat().st_mtime > pbf.stat().st_mtime:
            df = pd.read_parquet(OSM_CACHE_PATH)
            meta["mode"] = "cache"
            meta["seconds"] = round(time.perf_counter() - t0, 2)
            meta["features"] = int(len(df))
            logger.info("OSM cache loaded: %d features (%.2fs)", len(df), meta["seconds"])
            return df, meta
    df = extract_osm_points_from_pbf(pbf)
    OSM_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(OSM_CACHE_PATH, index=False)
    meta["mode"] = "built"
    meta["seconds"] = round(time.perf_counter() - t0, 2)
    meta["features"] = int(len(df))
    return df, meta


def compute_osm_features(cells: pd.DataFrame, osm_points: pd.DataFrame | None = None) -> pd.DataFrame:
    """Cell 15 verbatim: dist_osm_*_km (to feature centroid) + n_osm_*_5km."""
    if osm_points is None:
        osm_points, _ = build_osm_feature_cache()
    query_xy = project_lonlat_to_7755(cells["longitude"].to_numpy(), cells["latitude"].to_numpy())

    out = pd.DataFrame(index=cells.index)
    for name, (key, val) in CATEGORY_TAGS.items():
        if "category" not in osm_points.columns:
            out[f"dist_osm_{name}_km"] = np.nan
            out[f"n_osm_{name}_5km"] = 0
            logger.warning("%s: no category column in OSM cache — 0 features", name)
            continue
        sub = osm_points[osm_points["category"] == name]
        if len(sub) == 0:
            out[f"dist_osm_{name}_km"] = np.nan
            out[f"n_osm_{name}_5km"] = 0
            logger.warning("%s: tag key '%s' produced 0 features — check the extraction step", name, key)
            continue
        ref_xy = project_lonlat_to_7755(sub["lon"].to_numpy(), sub["lat"].to_numpy())
        out[f"dist_osm_{name}_km"] = _nn_distance_km(query_xy, ref_xy)
        out[f"n_osm_{name}_5km"] = _nn_count_within_km(query_xy, ref_xy, radius_km=5.0)
    return out


# ---------------------------------------------------------------------------
# State assignment (osi-wri-data.ipynb cell 7, pyshp + shapely port)
# ---------------------------------------------------------------------------


def _sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def ensure_state_shapefile() -> Path:
    """Verify the pinned shapefile (sha256); download it from the pinned commit if absent."""
    STATE_SHP_DIR.mkdir(parents=True, exist_ok=True)
    missing = [ext for ext in STATE_SHA256 if not (STATE_SHP_DIR / f"{STATE_SHP_BASENAME}.{ext}").exists()]
    if missing:
        import urllib.request

        for ext in missing:
            url = STATE_SOURCE_URL_TEMPLATE.format(ext=ext)
            dest = STATE_SHP_DIR / f"{STATE_SHP_BASENAME}.{ext}"
            logger.info("Downloading pinned state boundary file %s -> %s", url, dest)
            urllib.request.urlretrieve(url, dest)  # pinned commit URL, no redirects followed
    for ext, expected in STATE_SHA256.items():
        path = STATE_SHP_DIR / f"{STATE_SHP_BASENAME}.{ext}"
        actual = _sha256(path)
        if actual != expected:
            raise RawInputError(
                f"State boundary file {path} sha256 mismatch (expected {expected}, got {actual}). "
                f"Refusing to use unpinned data. Source commit: {STATE_SOURCE_COMMIT}"
            )
    return STATE_SHP_DIR / f"{STATE_SHP_BASENAME}.shp"


def load_state_polygons() -> tuple[list[tuple[str, object]], list[tuple[str, object]]]:
    """(name, polygon) pairs as (geographic 4326, projected 7755) versions."""
    import shapefile as pyshp

    shp_path = ensure_state_shapefile()
    reader = pyshp.Reader(str(shp_path))
    if "State_Name" not in [f[0] for f in reader.fields[1:]]:
        raise RawInputError(f"State shapefile {shp_path} lacks a State_Name field")

    # The .prj is Web Mercator (EPSG:3857): transform once to 4326 (PIP) and
    # 7755 (nearest-boundary distances), matching the notebook's to_crs calls.
    def _from_3857(target_transformer):
        def fn(geom):
            return shp_transform(lambda x, y, z=None: target_transformer.transform(x, y), geom)
        return fn

    out_4326: list[tuple[str, object]] = []
    out_7755: list[tuple[str, object]] = []
    for shp_rec in reader.iterShapeRecords():
        name_raw = str(shp_rec.record["State_Name"])
        name = STATE_NAME_FIXES.get(name_raw, name_raw)
        geom = shape(shp_rec.shape.__geo_interface__)
        if geom.is_empty:
            continue
        geom_4326 = _from_3857(_transformer_4326)(geom)
        geom_7755 = shp_transform(
            lambda x, y, z=None: _transformer_7755.transform(
                *_transformer_4326.transform(x, y)
            ),
            geom,
        )
        out_4326.append((name, geom_4326))
        out_7755.append((name, geom_7755))
    if len({name for name, _ in out_4326}) != 36:
        raise RawInputError(f"Expected 36 unique states/UTs in shapefile, got {len({n for n, _ in out_4326})}")
    return out_4326, out_7755


def assign_states(cells: pd.DataFrame) -> pd.DataFrame:
    """Point-in-polygon state assignment with nearest-boundary resolution.

    Returns state / state_assignment_method / _state_distance_km columns with
    the notebook's method vocabulary: 'within', 'nearest_boundary_tie_break',
    'nearest_unmatched'.
    """
    polys_4326, polys_7755 = load_state_polygons()
    geoms_4326 = [g for _, g in polys_4326]
    names_4326 = [n for n, _ in polys_4326]
    tree = STRtree(geoms_4326)

    names_out: list[str | None] = [None] * len(cells)
    methods_out: list[str] = [""] * len(cells)
    dists_out: list[float] = [np.nan] * len(cells)

    lons = cells["longitude"].to_numpy(dtype="float64")
    lats = cells["latitude"].to_numpy(dtype="float64")

    for i, (lon, lat) in enumerate(zip(lons, lats)):
        point = Point(lon, lat)
        p7755 = project_lonlat_to_7755(np.array([lon]), np.array([lat]))[0]
        pt_7755 = Point(p7755)
        cand_idx = [int(j) for j in tree.query(point, predicate="within")]
        if cand_idx:
            # Boundary ties resolved deterministically: shortest projected
            # distance, then state name (notebook cell 7 rule).
            scored = []
            for j in cand_idx:
                name = names_4326[j]
                geom_7755 = polys_7755[j][1]
                scored.append((geom_7755.distance(pt_7755), name))
            scored.sort(key=lambda t: (t[0], t[1]))
            d0, name0 = scored[0]
            names_out[i] = name0
            if len(scored) == 1:
                methods_out[i] = "within"
                dists_out[i] = 0.0
            else:
                methods_out[i] = "nearest_boundary_tie_break"
                dists_out[i] = float(d0) / 1000.0
        else:
            # Nearest-state resolution path (offshore / numerical edge cases).
            best = min(
                ((geom_7755.distance(pt_7755), name) for name, geom_7755 in polys_7755),
                key=lambda t: (t[0], t[1]),
            )
            names_out[i] = best[1]
            methods_out[i] = "nearest_boundary_tie_break" if best[0] == 0 else "nearest_unmatched"
            dists_out[i] = float(best[0]) / 1000.0

    return pd.DataFrame(
        {
            "state": names_out,
            "state_assignment_method": methods_out,
            "_state_distance_km": dists_out,
        },
        index=cells.index,
    )
