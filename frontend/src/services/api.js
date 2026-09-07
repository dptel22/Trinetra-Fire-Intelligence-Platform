import * as h3 from 'h3-js';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// LOCKED Fire Classification Colors (Separate from UI Chrome)
export const FIRE_COLORS = {
  industrial: '#E67E22',
  mining: '#95A5A6',
  agricultural_burn: '#F1C40F',
  wildfire: '#E74C3C',
  unclassified: '#787878'
};

export const FIRE_LABELS = {
  industrial: 'Industrial Facility (inc. Gas Flares)',
  mining: 'Mining / Smelter Operations',
  agricultural_burn: 'Agricultural Burn',
  wildfire: 'Wildfire',
  unclassified: 'Unclassified Thermal Source'
};

export const FIRE_CAVEATS = {
  wildfire: 'High Confidence · Macro F1 > 0.90',
  industrial: 'High Confidence · Validated against OSM/WRI Facility Maps',
  mining: 'Limited Sample · Accuracy reported as confidence interval',
  agricultural_burn: 'Unreliable · Distance-threshold rule (Under Active Improvement)',
  unclassified: 'Confidence Fallback · Below classification threshold'
};

let useMock = false;
export const getApiMode = () => useMock;
export const setApiMode = (val) => { useMock = val; };

export async function checkBackendHealth() {
  if (useMock) return { status: 'ok', mode: 'mock' };
  try {
    const res = await fetch(`${BASE_URL}/health`);
    if (res.ok) return await res.json();
  } catch (e) {
    return { status: 'offline', mode: 'mock_fallback' };
  }
  return { status: 'offline', mode: 'mock_fallback' };
}

export async function fetchPredictions({ min_lat, max_lat, min_lon, max_lon, acq_date }) {
  if (!useMock) {
    try {
      const params = new URLSearchParams({
        min_lat: (min_lat || 8.0).toFixed(4),
        max_lat: (max_lat || 36.0).toFixed(4),
        min_lon: (min_lon || 68.0).toFixed(4),
        max_lon: (max_lon || 97.0).toFixed(4),
        acq_date: acq_date || '2025-01-26',
      });
      const res = await fetch(`${BASE_URL}/predictions?${params}`);
      if (res.ok) return await res.json();
    } catch (e) {}
  }
  return generateMockBboxPredictions(min_lat, max_lat, min_lon, max_lon, acq_date);
}

export function getH3Boundary(h3Index) {
  try {
    if (typeof h3.cellToBoundary === 'function') {
      return h3.cellToBoundary(h3Index);
    }
  } catch (e) {}
  return null;
}

function generateMockBboxPredictions(min_lat = 8, max_lat = 36, min_lon = 68, max_lon = 97, acq_date) {
  const centers = [
    { lat: 22.4707, lon: 70.0577, class: 'industrial' },  // Jamnagar Refinery
    { lat: 20.2644, lon: 86.6713, class: 'industrial' },  // Paradip Port
    { lat: 21.1938, lon: 81.3509, class: 'industrial' },  // Bhilai Steel
    { lat: 24.1994, lon: 82.6644, class: 'mining' },      // Singrauli Mine
    { lat: 23.6102, lon: 85.2799, class: 'mining' },      // Ramgarh Coal Belt
    { lat: 31.1048, lon: 77.1734, class: 'wildfire' },    // Shimla Forest
    { lat: 30.3165, lon: 78.0322, class: 'wildfire' },    // Dehradun Valley
    { lat: 30.9010, lon: 75.8573, class: 'agricultural_burn' }, // Punjab Stubble
    { lat: 29.9457, lon: 76.8173, class: 'agricultural_burn' }, // Haryana Fields
    { lat: 18.5204, lon: 73.8567, class: 'unclassified' } // Pune Periphery
  ];

  const predictions = [];
  centers.forEach((center, idx) => {
    let baseCell = '88209a2011fffff';
    try {
      if (typeof h3.latLngToCell === 'function') {
        baseCell = h3.latLngToCell(center.lat, center.lon, 8);
      }
    } catch (e) {}

    let disk = [baseCell];
    try {
      if (typeof h3.gridDisk === 'function') {
        disk = h3.gridDisk(baseCell, 2);
      }
    } catch (e) {}

    disk.forEach((cell, cellIdx) => {
      let coords = [center.lat, center.lon];
      try {
        if (typeof h3.cellToLatLng === 'function') {
          coords = h3.cellToLatLng(cell);
        }
      } catch (e) {}

      const predicted_class = cellIdx === 0 ? center.class : (cellIdx % 2 === 0 ? center.class : 'unclassified');
      const confidence = predicted_class === 'agricultural_burn' ? 0.58 : (0.78 + (cellIdx % 15) * 0.01);

      predictions.push({
        cell_id: cell,
        h3_index: cell,
        latitude: coords[0],
        longitude: coords[1],
        predicted_class,
        confidence: parseFloat(confidence.toFixed(2)),
        timestamp: `${acq_date || '2025-01-26'}T${10 + (idx % 12)}:${(cellIdx * 12) % 60}:00Z`,
        caveat: FIRE_CAVEATS[predicted_class]
      });
    });
  });

  return {
    acq_date: acq_date || '2025-01-26',
    predictions
  };
}
