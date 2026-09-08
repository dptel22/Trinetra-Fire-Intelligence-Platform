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

// Default Geographic Viewport & Bounds for India
export const INDIA_CENTER = { lat: 20.5937, lon: 78.9629, zoom: 5 };
export const INDIA_BOUNDS = {
  min_lat: 8.0,
  max_lat: 37.0,
  min_lon: 68.0,
  max_lon: 97.0
};

// Canonical Caveat Text (Verbatim from Backend Specifications)
export const KNOWN_CAVEATS = {
  mining: 'Mining has lower labeled support and should be read cautiously.',
  agricultural_burn: 'Calibrated confidence is below the per-class review threshold; treat as provisional.',
  needs_review: 'Calibrated confidence is below the per-class review threshold; treat as provisional.'
};
export const FIRE_CAVEATS = KNOWN_CAVEATS;

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

// --- Backend API Endpoints ---

/**
 * Normalizes various bounding box parameter formats.
 */
function normalizeBbox(bbox) {
  if (!bbox) return INDIA_BOUNDS;
  if (Array.isArray(bbox)) {
    if (bbox.length === 4) {
      // [min_lon, min_lat, max_lon, max_lat] or [min_lat, max_lat, min_lon, max_lon]
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
    const min_lat = bbox.min_lat ?? bbox.south ?? bbox._sw?.lat ?? 8.0;
    const max_lat = bbox.max_lat ?? bbox.north ?? bbox._ne?.lat ?? 37.0;
    const min_lon = bbox.min_lon ?? bbox.west ?? bbox._sw?.lng ?? 68.0;
    const max_lon = bbox.max_lon ?? bbox.east ?? bbox._ne?.lng ?? 97.0;
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
        latency_ms: 2.1
      });
    });
  });

  return predictions;
}
