import * as h3 from 'h3-js';

const BASE_URL = import.meta.env?.VITE_API_URL || 'http://localhost:8000';

// LOCKED Taxonomy and Colors (4 trained classes + 1 fallback)
export const CLASS_COLORS = {
  industrial: '#E67E22',
  mining: '#95A5A6',
  agricultural_burn: '#F1C40F',
  wildfire: '#E74C3C',
  unclassified: '#787878'
};

export const CLASS_LABELS = {
  industrial: 'Industrial Facility',
  mining: 'Mining / Smelter',
  agricultural_burn: 'Agricultural Burn',
  wildfire: 'Wildfire',
  unclassified: 'Unclassified Thermal Source'
};

// Aliases for backwards compatibility with any existing components
export const FIRE_COLORS = CLASS_COLORS;
export const FIRE_LABELS = CLASS_LABELS;

// Default Geographic Viewport & Bounds for India.
// Single shared geography contract (matches the ingestion INDIA_BBOX and the
// backend fetch area exactly): west 68.03, south 6.75, east 97.42, north 37.10.
// The bbox bounds fetches and map framing only — whether a detection is
// Indian is decided server-side by the India polygon land mask, never by the
// bbox alone.
// National framing must survive the narrow map pane beside the sidebar.
export const INDIA_CENTER = { lat: 20.5937, lon: 78.9629, zoom: 4 };
export const INDIA_BOUNDS = {
  min_lat: 6.75,
  max_lat: 37.10,
  min_lon: 68.03,
  max_lon: 97.42
};

// Canonical Caveat Text (Verbatim from Backend Specifications)
export const KNOWN_CAVEATS = {
  mining: 'Mining has lower labeled support and should be read cautiously.',
  agricultural_burn: 'Calibrated confidence is below the per-class review threshold; treat as provisional.',
  needs_review: 'Calibrated confidence is below the per-class review threshold; treat as provisional.'
};
export const FIRE_CAVEATS = KNOWN_CAVEATS;

export const PRIMARY_CLASSES = ['industrial', 'mining', 'agricultural_burn', 'wildfire'];

/**
 * Client-side India-territory check for one prediction.
 *
 * Server provenance (`geography`) is authoritative when present. Legacy or
 * malformed responses WITHOUT provenance fall back to conservative geometry:
 * the shared bbox plus the Sri Lanka box (south of 9.85N and east of 80E —
 * Indian mainland at those latitudes stays west of 80E). Anything without
 * usable coordinates is rejected.
 */
export function isOutsideIndia(p) {
  if (!p) return true;
  if (p.geography === 'outside_india') return true;
  if (p.geography === 'training_geography' || p.geography === 'india_outside_training') return false;
  const lat = p.latitude;
  const lon = p.longitude;
  if (typeof lat !== 'number' || typeof lon !== 'number'
    || Number.isNaN(lat) || Number.isNaN(lon)) return true;
  if (lat < INDIA_BOUNDS.min_lat || lat > INDIA_BOUNDS.max_lat) return true;
  if (lon < INDIA_BOUNDS.min_lon || lon > INDIA_BOUNDS.max_lon) return true;
  if (lat <= 9.85 && lon >= 80.0) return true; // Sri Lanka box
  return false;
}

export function formatFeatureName(featureName = '') {
  const known = {
    frp_max: 'Peak fire intensity',
    frp_mean: 'Average fire intensity',
    dist_osm_power_infra_km: 'Distance from mapped power infrastructure',
    dist_to_industrial_facility_m: 'Distance from mapped industrial facility',
    dist_osm_industrial_km: 'Distance from mapped industrial land use',
    dist_osm_mining_km: 'Distance from mapped mining area',
    dist_osm_agriculture_km: 'Distance from mapped agricultural land',
    fire_history_recurrent_ratio: 'Recurrence of the thermal signal',
    daynight: 'Observation time',
    pct_high_confidence: 'High-confidence detection share'
  };
  if (known[featureName]) return known[featureName];
  return featureName
    .replace(/^dist_/, 'Distance from ')
    .replace(/^n_(?:osm|wri)_/, 'Nearby ')
    .replace(/_km$/, '')
    .replace(/_m$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function humanizeAttribution(attr = {}) {
  const name = formatFeatureName(attr.feature_name);
  const direction = Number(attr.shap_value ?? 0) >= 0 ? 'supports' : 'argues against';
  const value = attr.feature_value ?? 'not available';
  const detail = attr.description || `${name} is ${value}.`;
  return { name, value, direction, detail };
}

function probabilityFor(probabilities, className) {
  const item = (probabilities || []).find((p) => p.class_name === className);
  return Number(item?.probability ?? 0);
}

/**
 * Presentation-only assessment for the two analyst questions. It never
 * replaces the calibrated four-class model output with a new model label.
 */
export function deriveClassificationAssessment(cell = {}, explanation = {}) {
  const predictedClass = explanation.predicted_class || cell.predicted_class || 'unclassified';
  const probabilities = explanation.probabilities || cell.probabilities || [];
  const industrialProbability = probabilityFor(probabilities, 'industrial');
  const wildfireProbability = probabilityFor(probabilities, 'wildfire');
  const text = (explanation.feature_attributions || [])
    .map((a) => `${a.feature_name || ''} ${a.description || ''}`.toLowerCase())
    .join(' ');
  const industrialEvidence = /(industrial|facility|flare|power infra|power infrastructure|recurrent|stationary)/.test(text);
  const wildfireEvidence = /(wildfire|vegetation|forest|canopy|open land|land cover)/.test(text);
  const review = cell.needs_review === true || explanation.needs_review === true || predictedClass === 'unclassified';

  let gasFlare = 'Insufficient evidence';
  if (predictedClass === 'industrial' && industrialProbability >= 0.7 && industrialEvidence && !review) {
    gasFlare = 'Yes';
  } else if ((predictedClass !== 'industrial' && industrialProbability < 0.5) || predictedClass === 'wildfire') {
    gasFlare = 'No';
  }

  let wildfire = 'Insufficient evidence';
  if (predictedClass === 'wildfire' && wildfireProbability >= 0.7 && !review) {
    wildfire = 'Yes';
  } else if ((predictedClass === 'industrial' || predictedClass === 'mining') && industrialProbability >= 0.7 && !wildfireEvidence) {
    wildfire = 'No';
  }

  return {
    primaryClass: CLASS_LABELS[predictedClass] || predictedClass,
    gasFlare,
    wildfire,
    note: review
      ? 'This assessment is provisional because the hotspot is flagged for analyst review.'
      : 'This is an evidence-based interpretation of the four-class prediction, not a separate satellite label.'
  };
}

// --- API Mode State Management ---
let currentMode = 'live'; // 'live' | 'mock'
const modeListeners = new Set();

export function getApiMode() {
  return currentMode;
}

export function setApiMode(mode) {
  const normalized = mode === 'mock' ? 'mock' : 'live';
  if (currentMode !== normalized) {
    currentMode = normalized;
    notifyModeListeners(currentMode);
  }
}

export function forceMockMode(enabled) {
  setApiMode(enabled ? 'mock' : 'live');
}

export function onApiModeChange(listener) {
  if (typeof listener === 'function') {
    modeListeners.add(listener);
    // Return unsubscribe function
    return () => {
      modeListeners.delete(listener);
    };
  }
  return () => {};
}

function notifyModeListeners(mode) {
  modeListeners.forEach((fn) => {
    try {
      fn(mode);
    } catch (err) {
      console.error('[API] Error executing onApiModeChange listener:', err);
    }
  });
}

// --- Helper Functions ---

/**
 * Splits caveat flag string on " | " and returns trimmed non-empty chips.
 * @param {string|null|undefined} caveatFlagString 
 * @returns {string[]}
 */
export function parseCaveatFlag(caveatFlagString) {
  if (!caveatFlagString || typeof caveatFlagString !== 'string') {
    return [];
  }
  return caveatFlagString
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Qualitative label is the primary cue everywhere in the UI.
 * @param {object|null} prediction 
 * @returns {'High confidence' | 'Needs review' | 'Uncertain'}
 */
export function confidenceLabel(prediction) {
  if (!prediction) return 'Uncertain';
  const predictedClass = (prediction.predicted_class || '').toLowerCase();
  if (predictedClass === 'unclassified') {
    return 'Uncertain';
  }
  if (prediction.needs_review === true || prediction.needs_review === 'true') {
    return 'Needs review';
  }
  return 'High confidence';
}

/**
 * Helper to get H3 hexagon boundary coordinates safely.
 */
export function getH3Boundary(h3Index) {
  try {
    if (typeof h3.cellToBoundary === 'function') {
      return h3.cellToBoundary(h3Index);
    }
  } catch (e) {
    console.warn('[H3] Unable to compute cell boundary:', e);
  }
  return null;
}

/**
 * Extracts unique predicted classes present in a batch of predictions,
 * ordered by canonical taxonomy. 'unclassified' is included iff empirically present.
 * @param {Array} predictions - List of PredictionResponse objects
 * @returns {string[]} List of unique class names present in the batch
 */
export function getAvailableClasses(predictions) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    return [];
  }
  const set = new Set();
  for (const p of predictions) {
    if (p && p.predicted_class) {
      set.add(p.predicted_class);
    }
  }
  const CANONICAL_ORDER = ['industrial', 'mining', 'agricultural_burn', 'wildfire', 'unclassified'];
  return CANONICAL_ORDER.filter((cls) => set.has(cls));
}

/**
 * Serializes predictions into RFC 4180 CSV format and triggers a browser download.
 * @param {Array} predictions - List of PredictionResponse objects
 * @param {string} [filename] - Optional custom filename
 * @returns {string} CSV text content
 */
/**
 * Serializes predictions into RFC 4180 CSV format and triggers a browser download.
 * @param {Array} predictions - List of PredictionResponse objects
 * @param {string} [filename] - Optional custom filename
 * @param {object} [metadata] - Provenance appended as trailing columns.
 * @param {string} [metadata.acqDate] - Acquisition date of the exported rows.
 * @param {string} [metadata.dataMode] - 'live' | 'historical' | 'demo' | 'offline'.
 * @returns {string} CSV text content
 */
export function exportPredictionsToCsv(predictions, filename, metadata = {}) {
  if (!Array.isArray(predictions) || predictions.length === 0) {
    throw new Error('No predictions available to export');
  }

  const headers = [
    'cell_id',
    'latitude',
    'longitude',
    'h3_index',
    'predicted_class',
    'confidence',
    'calibrated',
    'needs_review',
    'caveat_flag',
    'latency_ms',
    'is_synthetic',
    'acq_date',
    'data_mode'
  ];

  const escapeCsvField = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = [headers.join(',')];
  for (const p of predictions) {
    const row = [
      escapeCsvField(p.cell_id ?? p.h3_index ?? ''),
      escapeCsvField(p.latitude ?? ''),
      escapeCsvField(p.longitude ?? ''),
      escapeCsvField(p.h3_index ?? ''),
      escapeCsvField(p.predicted_class ?? ''),
      escapeCsvField(p.confidence ?? ''),
      escapeCsvField(p.calibrated ?? ''),
      escapeCsvField(p.needs_review ?? ''),
      escapeCsvField(p.caveat_flag ?? ''),
      escapeCsvField(p.latency_ms ?? ''),
      escapeCsvField(p.is_synthetic ?? false),
      escapeCsvField(p.acq_date ?? metadata.acqDate ?? ''),
      escapeCsvField(p.data_mode ?? metadata.dataMode ?? '')
    ];
    rows.push(row.join(','));
  }

  const csvContent = '\uFEFF' + rows.join('\r\n');
  const downloadName = filename || `trinetra_predictions_${new Date().toISOString().slice(0, 10)}.csv`;

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', downloadName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return csvContent;
}

// --- Backend API Endpoints ---

/**
 * Normalizes various bounding box parameter formats.
 *
 * Canonical input format for a 4-element array is a REST/Leaflet-style
 * `[min_lon, min_lat, max_lon, max_lat]` (GeoJSON ordering: longitude first).
 * The `bbox[0] >= 60 && bbox[2] <= 100` branch is an India-specific heuristic
 * that accepts this lon/lat order when the longitudes fall inside India's
 * bounds. A 4-element array whose values do NOT match that heuristic is
 * interpreted as `[min_lat, max_lat, min_lon, max_lon]` for backward
 * compatibility. Callers should prefer the canonical lon-first form and pass
 * explicit `min_lat/max_lat/min_lon/max_lon` object form when in doubt.
 */
function normalizeBbox(bbox) {
  if (!bbox) return INDIA_BOUNDS;
  if (Array.isArray(bbox)) {
    if (bbox.length === 4) {
      // Canonical: [min_lon, min_lat, max_lon, max_lat] (GeoJSON lon-lat order).
      // Fallback (legacy): [min_lat, max_lat, min_lon, max_lon].
      if (bbox[0] < bbox[2] && bbox[1] < bbox[3] && bbox[0] >= 60 && bbox[2] <= 100) {
        return { min_lon: bbox[0], min_lat: bbox[1], max_lon: bbox[2], max_lat: bbox[3] };
      }
      return { min_lat: bbox[0], max_lat: bbox[1], min_lon: bbox[2], max_lon: bbox[3] };
    }
    if (bbox.length === 2 && Array.isArray(bbox[0]) && Array.isArray(bbox[1])) {
      // [[min_lon, min_lat], [max_lon, max_lat]]
      return { min_lon: bbox[0][0], min_lat: bbox[0][1], max_lon: bbox[1][0], max_lat: bbox[1][1] };
    }
  }
  if (typeof bbox === 'object') {
    const min_lat = bbox.min_lat ?? bbox.south ?? bbox._sw?.lat ?? INDIA_BOUNDS.min_lat;
    const max_lat = bbox.max_lat ?? bbox.north ?? bbox._ne?.lat ?? INDIA_BOUNDS.max_lat;
    const min_lon = bbox.min_lon ?? bbox.west ?? bbox._sw?.lng ?? INDIA_BOUNDS.min_lon;
    const max_lon = bbox.max_lon ?? bbox.east ?? bbox._ne?.lng ?? INDIA_BOUNDS.max_lon;
    return { min_lat, max_lat, min_lon, max_lon };
  }
  return INDIA_BOUNDS;
}

// Live FIRMS ingestion targets the current day, so default queries to today
// (local calendar date, YYYY-MM-DD) instead of a stale hardcoded date.
const DEFAULT_ACQ_DATE = () => new Date().toLocaleDateString('en-CA');

/**
 * Fetches viewport predictions with automatic 2x2 tiling on 2500-limit ceiling.
 * @param {object|Array} bbox
 * @param {string} [acqDate=today YYYY-MM-DD]
 * @param {number} [zoom=8]
 * @returns {Promise<Array>} List of PredictionResponse objects
 */
export async function fetchPredictions(bbox, acqDate = DEFAULT_ACQ_DATE(), zoom = 8) {
  const normBbox = normalizeBbox(bbox);
  const effectiveDate = acqDate || DEFAULT_ACQ_DATE();
  const effectiveZoom = typeof zoom === 'number' ? Math.max(1, Math.min(20, zoom)) : 8.0;

  if (currentMode === 'mock') {
    return generateMockPredictions(normBbox, effectiveDate);
  }

  try {
    const results = await fetchPredictionsWithTiling(normBbox, effectiveDate, effectiveZoom, 0);
    if (currentMode !== 'live') {
      setApiMode('live');
    }
    return results;
  } catch (err) {
    console.warn('[API] Live fetch failed, switching to mock mode:', err.message);
    setApiMode('mock');
    return generateMockPredictions(normBbox, effectiveDate);
  }
}

/**
 * Stopgap client-side tiling for 2500 server-side limit.
 * (Note: The real long-term fix is a backend coarse-resolution aggregation endpoint).
 */
async function fetchPredictionsWithTiling(bbox, acqDate, zoom, depth = 0) {
  const { min_lat, max_lat, min_lon, max_lon } = bbox;
  const params = new URLSearchParams({
    min_lat: Number(min_lat).toFixed(4),
    max_lat: Number(max_lat).toFixed(4),
    min_lon: Number(min_lon).toFixed(4),
    max_lon: Number(max_lon).toFixed(4),
    acq_date: acqDate,
    zoom: Number(zoom).toFixed(1)
  });

  const url = `${BASE_URL}/api/v1/predictions?${params}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${url}`);
  }

  const data = await response.json();
  const predictions = Array.isArray(data) ? data : (data.predictions || []);
  const totalCount = data.total_predictions ?? predictions.length;

  // If hitting the 2500 cap and haven't exceeded max recursion depth, split into 2x2 tiles
  const SERVER_CAP = 2500;
  const MAX_TILING_DEPTH = 2; // Maximum depth to prevent excessive network requests

  if (totalCount >= SERVER_CAP && depth < MAX_TILING_DEPTH) {
    const midLat = (min_lat + max_lat) / 2;
    const midLon = (min_lon + max_lon) / 2;

    const subTiles = [
      { min_lat, max_lat: midLat, min_lon, max_lon: midLon },
      { min_lat, max_lat: midLat, min_lon: midLon, max_lon },
      { min_lat: midLat, max_lat, min_lon, max_lon: midLon },
      { min_lat: midLat, max_lat, min_lon: midLon, max_lon }
    ];

    const subResults = await Promise.all(
      subTiles.map((tile) => fetchPredictionsWithTiling(tile, acqDate, zoom, depth + 1))
    );

    // Merge and deduplicate by cell_id
    const mergedMap = new Map();
    for (const subList of subResults) {
      for (const item of subList) {
        const key = item.cell_id || item.h3_index;
        if (key && !mergedMap.has(key)) {
          mergedMap.set(key, item);
        }
      }
    }
    return Array.from(mergedMap.values());
  }

  return predictions;
}

/**
 * Newest acq_date the backend actually holds (from /api/v1/health).
 * The UI must query THIS date, not the calendar date — the store only
 * contains ingested days, and an exact-date match on an uningested day
 * returns a valid empty 200 (which used to leave the map silently blank).
 * @returns {Promise<string|null>} ISO yyyy-mm-dd, or null when unavailable
 */
export async function fetchLatestAcqDate() {
  try {
    const h = await fetchHealth();
    return h?.latest_acq_date ?? null;
  } catch {
    return null;
  }
}

// --- Alerts status derivation (pure, testable) -----------------------------

/**
 * Derives the operational status shown on the alerts page. Never infers LIVE
 * merely because rows exist: a failed live request is OFFLINE, mock mode is
 * DEMO, a backend-reported historical/demo/offline data mode wins, and an
 * older-than-newest selection is HISTORICAL.
 * @param {object} params
 * @param {string} [params.apiMode] - 'live' | 'mock' (from getApiMode()).
 * @param {boolean} [params.hasError] - The fetch for the selected date failed.
 * @param {boolean} [params.isHistorical] - Selected date < newest available.
 * @param {string} [params.backendDataMode] - Backend-reported mode for the date.
 * @returns {'LIVE'|'HISTORICAL'|'DEMO'|'OFFLINE'}
 */
export function deriveAlertsStatus({ apiMode = 'live', hasError = false, isHistorical = false, backendDataMode = null } = {}) {
  if (apiMode === 'mock') return 'DEMO';
  if (hasError) return 'OFFLINE';
  if (backendDataMode === 'demo') return 'DEMO';
  if (backendDataMode === 'offline') return 'OFFLINE';
  if (backendDataMode === 'historical') return 'HISTORICAL';
  if (backendDataMode === 'live' && !isHistorical) return 'LIVE';
  return isHistorical ? 'HISTORICAL' : 'LIVE';
}

const STALE_INGESTION_DAYS = 3;
const IMPLAUSIBLY_LOW_DAILY_ROWS = 200;

function calendarDaysBetween(fromIso, toIso) {
  const from = new Date(`${fromIso}T00:00:00Z`);
  const to = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

/**
 * ingestion_status of a single archived day → visible warning, or null when ok.
 * @param {string|null} status - 'ok'|'plausibility_warning'|'failed'|'no_run_record'
 * @returns {string|null}
 */
export function ingestionStatusWarning(status) {
  if (!status || status === 'ok') return null;
  if (status === 'plausibility_warning') {
    return 'Ingestion plausibility warning: the stored row count for this date looks implausible, so the feed may be incomplete.';
  }
  if (status === 'failed') {
    return 'The most recent ingestion run failed — this data is last-known and must not be treated as current.';
  }
  if (status === 'no_run_record') {
    return 'No ingestion run record exists for this date; it is served from the historical archive, not a live FIRMS pull.';
  }
  return null;
}

/**
 * Turns /health ingestion provenance into human-readable staleness warnings.
 * @param {object} params
 * @param {object|null} params.ingestion - health.ingestion provenance block.
 * @param {string|null} params.latestAcqDate - newest stored ISO date.
 * @param {string} [params.today] - ISO yyyy-mm-dd (defaults to today, injectable for tests).
 * @returns {{warnings: string[], stale: boolean, lowVolume: boolean}}
 */
export function assessIngestionFreshness({ ingestion = null, latestAcqDate = null, today = new Date().toLocaleDateString('en-CA') } = {}) {
  const warnings = [];
  let stale = false;
  let lowVolume = false;

  if (!latestAcqDate) {
    warnings.push('The backend did not report a newest acquisition date, so data freshness cannot be confirmed.');
    return { warnings, stale, lowVolume };
  }

  const ageDays = calendarDaysBetween(latestAcqDate, today);
  if (ageDays != null && ageDays >= STALE_INGESTION_DAYS) {
    stale = true;
    warnings.push(`FIRMS ingestion is ${ageDays} days behind the current date (newest stored observation: ${latestAcqDate}). Treat the feed as stale.`);
  }

  if (ingestion && ingestion.available) {
    if (ingestion.last_run_ok === false) {
      warnings.push('The most recent ingestion run failed. Shown data is last-known, not a live pull.');
    }
    const rows = ingestion.final_daily_rows;
    if (typeof rows === 'number' && rows > 0 && rows < IMPLAUSIBLY_LOW_DAILY_ROWS) {
      lowVolume = true;
      warnings.push(`Implausibly low national ingestion volume: only ${rows} rows were retained for the latest run, so the feed may be incomplete.`);
    }
  } else {
    warnings.push('Ingestion provenance is unavailable from the backend; ingestion freshness cannot be verified.');
  }

  return { warnings, stale, lowVolume };
}

// --- Strict live fetch (operational alerts: never silently mock) -----------

/**
 * Live-only variant of fetchPredictions for operational alert surfaces.
 * Differences from fetchPredictions:
 *  - a live failure THROWS instead of silently returning simulated rows;
 *  - the global api mode is never flipped to mock by a failed live call;
 *  - when demo mode is explicitly active, simulated rows are returned so the
 *    caller can label them DEMO (never presented as live).
 */
export async function fetchPredictionsStrict(bbox, acqDate, zoom = 8) {
  const normBbox = normalizeBbox(bbox);
  const effectiveDate = acqDate || DEFAULT_ACQ_DATE();
  const effectiveZoom = typeof zoom === 'number' ? Math.max(1, Math.min(20, zoom)) : 8.0;

  if (currentMode === 'mock') {
    return generateMockPredictions(normBbox, effectiveDate);
  }
  return fetchPredictionsWithTiling(normBbox, effectiveDate, effectiveZoom, 0);
}

// --- Archive API (Agent 1 contract: /api/v1/archive/*) ----------------------

const ARCHIVE_BASE = `${BASE_URL}/api/v1/archive`;

/**
 * Dates available in the backend archive. Never invents dates: a non-OK
 * response throws and the caller must show an error/offline state.
 * @returns {Promise<{availableDates: string[], newestDate: string|null, oldestDate: string|null, source: string, dataMode: string}>}
 */
export async function fetchArchiveDates() {
  const res = await fetch(`${ARCHIVE_BASE}/dates`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${ARCHIVE_BASE}/dates`);
  }
  const data = await res.json();
  const availableDates = Array.isArray(data?.available_dates)
    ? data.available_dates.filter((d) => typeof d === 'string' && d.length >= 8)
    : [];
  return {
    availableDates,
    newestDate: data?.newest_date ?? availableDates[availableDates.length - 1] ?? null,
    oldestDate: data?.oldest_date ?? availableDates[0] ?? null,
    source: typeof data?.source === 'string' ? data.source : '',
    dataMode: typeof data?.data_mode === 'string' ? data.data_mode : 'offline'
  };
}

/**
 * One archived day of predictions with server-side filters.
 * A 404 carrying error "archive_date_not_available" rejects with
 * err.notAvailable = true so the UI can distinguish "no data for this date"
 * from a generic backend error.
 * @param {object} params
 * @returns {Promise<{total, acqDate, predictions, dataMode, source, modelVersion, ingestionRunId, ingestionStatus}>}
 */
export async function fetchArchivePredictions({
  acqDate,
  className = null,
  state = null,
  needsReview = null,
  minConfidence = null,
  maxConfidence = null,
  limit = 200,
  offset = 0
} = {}) {
  if (!acqDate) throw new Error('fetchArchivePredictions requires an acq_date');
  const params = new URLSearchParams({ acq_date: acqDate });
  if (className) params.set('class_name', className);
  if (state) params.set('state', state);
  if (needsReview === true || needsReview === false) params.set('needs_review', String(needsReview));
  if (typeof minConfidence === 'number') params.set('min_confidence', String(minConfidence));
  if (typeof maxConfidence === 'number') params.set('max_confidence', String(maxConfidence));
  params.set('limit', String(Math.min(1000, Math.max(1, limit))));
  params.set('offset', String(Math.max(0, offset)));

  const res = await fetch(`${ARCHIVE_BASE}/predictions?${params}`);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} from ${ARCHIVE_BASE}/predictions`);
    try {
      const body = await res.json();
      if (body?.detail?.error === 'archive_date_not_available') {
        err.notAvailable = true;
        err.acqDate = body.detail.acq_date ?? acqDate;
        err.newestDate = body.detail.newest_date ?? null;
        err.oldestDate = body.detail.oldest_date ?? null;
      }
    } catch { /* non-JSON error body: keep generic error */ }
    throw err;
  }
  const data = await res.json();
  return {
    total: data?.total ?? 0,
    acqDate: data?.acq_date ?? acqDate,
    predictions: Array.isArray(data?.predictions) ? data.predictions : [],
    dataMode: typeof data?.data_mode === 'string' ? data.data_mode : 'historical',
    source: typeof data?.source === 'string' ? data.source : '',
    modelVersion: data?.model_version ?? '',
    ingestionRunId: data?.ingestion_run_id ?? null,
    ingestionStatus: data?.ingestion_status ?? null
  };
}

/**
 * Per-day archive summary (totals, needs-review totals, class/state breakdowns).
 * @param {object} [params]
 * @param {string} [params.startDate]
 * @param {string} [params.endDate]
 * @returns {Promise<{startDate, endDate, days: Array, unavailableDates: string[], dataMode, source}>}
 */
export async function fetchArchiveSummary({ startDate = null, endDate = null } = {}) {
  const params = new URLSearchParams();
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);
  const qs = params.toString();
  const res = await fetch(`${ARCHIVE_BASE}/summary${qs ? `?${qs}` : ''}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${ARCHIVE_BASE}/summary`);
  }
  const data = await res.json();
  return {
    startDate: data?.start_date ?? '',
    endDate: data?.end_date ?? '',
    days: Array.isArray(data?.days)
      ? data.days.map((d) => ({
        date: d?.date,
        total: d?.total ?? 0,
        needsReviewTotal: d?.needs_review_total ?? 0,
        byClass: d?.by_class ?? {},
        byState: d?.by_state ?? {}
      }))
      : [],
    unavailableDates: Array.isArray(data?.unavailable_dates) ? data.unavailable_dates : [],
    dataMode: typeof data?.data_mode === 'string' ? data.data_mode : 'offline',
    source: typeof data?.source === 'string' ? data.source : ''
  };
}

/**
 * Health check endpoint.
 * @returns {Promise<object>} HealthResponse
 */
export async function fetchHealth() {
  if (currentMode === 'mock') {
    return {
      status: 'healthy (mock mode)',
      database: 'connected (mock)',
      model_loaded: true,
      schema_version: '3.0.0',
      schema_hash: 'mock-hash-ps26162',
      model_path: 'models/PS26162_catboost_final/inference_bundle/catboost_hotspot_classifier.cbm',
      bundle_dir: 'models/PS26162_catboost_final/inference_bundle',
      calibrators_loaded: true,
      review_thresholds: {
        wildfire: 0.70,
        industrial: 0.70,
        mining: 0.85,
        agricultural_burn: 1.01
      },
      startup_latency_ms: 12.4,
      target_classes: ['industrial', 'mining', 'agricultural_burn', 'wildfire']
    };
  }

  try {
    const res = await fetch(`${BASE_URL}/api/v1/health`);
    if (res.ok) {
      const data = await res.json();
      return data;
    }
    // Fallback to root health if api/v1/health is aliased
    const rootRes = await fetch(`${BASE_URL}/health`);
    if (rootRes.ok) {
      return await rootRes.json();
    }
  } catch (err) {
    console.warn('[API] fetchHealth failed, returning offline status:', err.message);
  }

  return {
    status: 'offline',
    target_classes: ['industrial', 'mining', 'agricultural_burn', 'wildfire'],
    review_thresholds: {
      wildfire: 0.70,
      industrial: 0.70,
      mining: 0.85,
      agricultural_burn: 1.01
    }
  };
}

/**
 * Fetch detail for a single cell. Throws error in mock mode.
 * @param {string} cellId 
 * @param {string} acqDate 
 * @returns {Promise<object>} CellPredictionDetailResponse
 */
export async function fetchCellDetail(cellId, acqDate) {
  if (currentMode === 'mock') {
    throw new Error('Detail endpoints have no mock mode equivalent');
  }

  const effectiveDate = acqDate || DEFAULT_ACQ_DATE();
  const res = await fetch(`${BASE_URL}/api/v1/predictions/${encodeURIComponent(cellId)}?acq_date=${effectiveDate}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch cell details for ${cellId}: HTTP ${res.status}`);
  }
  return await res.json();
}

/**
 * Fetch SHAP explanation for a cell. Provides mock explanation in mock mode.
 * @param {string} cellId 
 * @param {string} acqDate 
 * @returns {Promise<object>} ExplanationResponse
 */
export async function fetchExplanation(cellId, acqDate) {
  const effectiveDate = acqDate || DEFAULT_ACQ_DATE();

  if (currentMode === 'mock') {
    // Generate realistic mock SHAP explanation
    return {
      cell_id: cellId,
      h3_index: cellId,
      predicted_class: 'industrial',
      confidence: 0.89,
      probabilities: [
        { class_name: 'industrial', probability: 0.89 },
        { class_name: 'wildfire', probability: 0.05 },
        { class_name: 'mining', probability: 0.04 },
        { class_name: 'agricultural_burn', probability: 0.02 }
      ],
      base_value: 0.25,
      feature_attributions: [
        {
          feature_name: 'dist_to_industrial_facility_m',
          feature_value: '142.5m',
          shap_value: 1.84,
          contribution: '+1.84',
          description: 'High spatial proximity (<150m) to mapped heavy industrial installation strongly favors Industrial classification.'
        },
        {
          feature_name: 'frp_mean',
          feature_value: '18.4 MW',
          shap_value: 0.62,
          contribution: '+0.62',
          description: 'Persistent high Fire Radiative Power (18.4 MW) aligns with continuous refinery/flare combustion.'
        },
        {
          feature_name: 'fire_history_recurrent_ratio',
          feature_value: '0.82',
          shap_value: 0.45,
          contribution: '+0.45',
          description: 'High recurrent hotspot activity index confirms stationary non-wildfire thermal signature.'
        }
      ],
      top_features: ['dist_to_industrial_facility_m', 'frp_mean', 'fire_history_recurrent_ratio'],
      caveat_flag: null,
      summary_statement: 'High model confidence driven by tight spatial alignment with verified industrial facilities.',
      latency_ms: 18.2
    };
  }

  const res = await fetch(`${BASE_URL}/api/v1/predictions/${encodeURIComponent(cellId)}/explain?acq_date=${effectiveDate}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch explanation for ${cellId}: HTTP ${res.status}`);
  }
  return await res.json();
}

// --- High-Fidelity Mock Predictions Generator ---

function generateMockPredictions(bbox, _acqDate = '2025-01-26') {
  const centers = [
    { lat: 22.4707, lon: 70.0577, class: 'industrial', name: 'Jamnagar Petrochemical Complex' },
    { lat: 20.2644, lon: 86.6713, class: 'industrial', name: 'Paradip Port Flare Stack' },
    { lat: 21.1938, lon: 81.3509, class: 'industrial', name: 'Bhilai Steel Plant' },
    { lat: 24.1994, lon: 82.6644, class: 'mining', name: 'Singrauli Open-Cast Coal Belt' },
    { lat: 23.6102, lon: 85.2799, class: 'mining', name: 'Ramgarh Coal Smelter Zone' },
    { lat: 31.1048, lon: 77.1734, class: 'wildfire', name: 'Shimla Pine Forest Corridor' },
    { lat: 30.3165, lon: 78.0322, class: 'wildfire', name: 'Dehradun Valley Ridge' },
    { lat: 30.9010, lon: 75.8573, class: 'agricultural_burn', name: 'Ludhiana Agricultural Belt' },
    { lat: 29.9457, lon: 76.8173, class: 'agricultural_burn', name: 'Kurukshetra Stubble Zone' },
    { lat: 18.5204, lon: 73.8567, class: 'unclassified', name: 'Pune Peri-Urban Hotspot' }
  ];

  const reviewThresholds = {
    wildfire: 0.70,
    industrial: 0.70,
    mining: 0.85,
    agricultural_burn: 1.01
  };

  const predictions = [];

  centers.forEach((center, cIdx) => {
    // Check if center is roughly within bbox (with generous margin)
    if (
      center.lat < bbox.min_lat - 2 || center.lat > bbox.max_lat + 2 ||
      center.lon < bbox.min_lon - 2 || center.lon > bbox.max_lon + 2
    ) {
      return;
    }

    let baseCell = '88209a2011fffff';
    try {
      if (typeof h3.latLngToCell === 'function') {
        baseCell = h3.latLngToCell(center.lat, center.lon, 8);
      }
    } catch {
      baseCell = `88209a201${cIdx}fffff`;
    }

    let disk = [baseCell];
    try {
      if (typeof h3.gridDisk === 'function') {
        disk = h3.gridDisk(baseCell, 1);
      }
    } catch {}

    disk.forEach((cell, cellIdx) => {
      let coords = [center.lat + (cellIdx * 0.015), center.lon + (cellIdx * 0.015)];
      try {
        if (typeof h3.cellToLatLng === 'function') {
          coords = h3.cellToLatLng(cell);
        }
      } catch {}

      // Center cell is the target class; adjacent cells include variation
      let pClass = center.class;
      if (cellIdx > 0) {
        if (center.class === 'unclassified') {
          pClass = 'unclassified';
        } else if (cellIdx % 3 === 0) {
          pClass = 'unclassified';
        }
      }

      // Confidence computation
      let confidence = 0.88;
      if (pClass === 'agricultural_burn') {
        confidence = 0.62; // agricultural_burn threshold is 1.01, so needs_review is ALWAYS true
      } else if (pClass === 'mining') {
        confidence = cellIdx === 0 ? 0.88 : 0.74; // might be below 0.85
      } else if (pClass === 'unclassified') {
        confidence = 0.42;
      } else {
        confidence = 0.82 + (cellIdx * 0.03);
      }

      confidence = parseFloat(Math.min(0.99, Math.max(0.1, confidence)).toFixed(2));

      // Compute needs_review strictly
      const threshold = reviewThresholds[pClass] ?? 0.70;
      const needsReview = pClass === 'unclassified' || confidence < threshold || pClass === 'agricultural_burn';

      // Caveats
      const caveatList = [];
      if (pClass === 'mining') {
        caveatList.push(KNOWN_CAVEATS.mining);
      }
      if (needsReview && pClass !== 'mining') {
        caveatList.push(KNOWN_CAVEATS.needs_review);
      }
      const caveatFlag = caveatList.length > 0 ? caveatList.join(' | ') : null;

      // Probabilities distribution
      const otherClasses = ['industrial', 'mining', 'agricultural_burn', 'wildfire'].filter(c => c !== pClass);
      const remainingProb = Math.max(0.01, 1 - confidence);
      const splitProb = parseFloat((remainingProb / otherClasses.length).toFixed(3));

      const probabilities = [
        { class_name: pClass === 'unclassified' ? 'industrial' : pClass, probability: confidence }
      ];
      otherClasses.forEach(c => {
        probabilities.push({ class_name: c, probability: splitProb });
      });

      // Sort descending
      probabilities.sort((a, b) => b.probability - a.probability);

      predictions.push({
        cell_id: cell,
        latitude: coords[0],
        longitude: coords[1],
        h3_index: cell,
        predicted_class: pClass,
        probabilities,
        confidence,
        calibrated: true,
        needs_review: needsReview,
        caveat_flag: caveatFlag,
        latency_ms: 2.1,
        is_synthetic: true
      });
    });
  });

  return predictions;
}
