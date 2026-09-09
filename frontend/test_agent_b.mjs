import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CLASS_COLORS,
  CLASS_LABELS,
  FIRE_COLORS,
  FIRE_LABELS,
  FIRE_CAVEATS,
  KNOWN_CAVEATS,
  INDIA_BOUNDS,
  INDIA_CENTER,
  isOutsideIndia,
  parseCaveatFlag,
  confidenceLabel,
  getApiMode,
  setApiMode,
  forceMockMode,
  onApiModeChange,
  fetchPredictions,
  fetchHealth,
  fetchExplanation,
  fetchCellDetail,
  getAvailableClasses,
  exportPredictionsToCsv
} from './src/services/api.js';

let totalGroups = 0;
let passedGroups = 0;
const fireMapSource = readFileSync(new URL('./src/components/FireMapPage.jsx', import.meta.url), 'utf8');

function runGroup(name, fn) {
  totalGroups++;
  try {
    fn();
    passedGroups++;
    console.log(`[PASS] Group ${totalGroups}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Group ${totalGroups}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function runGroupAsync(name, fn) {
  totalGroups++;
  try {
    await fn();
    passedGroups++;
    console.log(`[PASS] Group ${totalGroups}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Group ${totalGroups}: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

console.log('=== Running Agent B Test Suite (test_agent_b.mjs) ===\n');

// 1. CLASS_COLORS / CLASS_LABELS exact values for all 5 taxonomy entries
runGroup('Taxonomy and Color/Label Constants', () => {
  const expectedColors = {
    industrial: '#E67E22',
    mining: '#95A5A6',
    agricultural_burn: '#F1C40F',
    wildfire: '#E74C3C',
    unclassified: '#787878'
  };

  const expectedLabels = {
    industrial: 'Industrial Facility',
    mining: 'Mining / Smelter',
    agricultural_burn: 'Agricultural Burn',
    wildfire: 'Wildfire',
    unclassified: 'Unclassified Thermal Source'
  };

  assert.deepStrictEqual(CLASS_COLORS, expectedColors);
  assert.deepStrictEqual(CLASS_LABELS, expectedLabels);
  assert.deepStrictEqual(FIRE_COLORS, expectedColors);
  assert.deepStrictEqual(FIRE_LABELS, expectedLabels);
  assert.ok(FIRE_CAVEATS);
  assert.ok(INDIA_CENTER.lat && INDIA_CENTER.lon);
  assert.ok(INDIA_BOUNDS.min_lat && INDIA_BOUNDS.max_lat);
  assert.ok(INDIA_CENTER.zoom <= 4.5, 'National map framing must start at a usable zoom');
});

runGroup('Map empty-state wording', () => {
  assert.match(fireMapSource, />No detections in view</);
});

// 2. parseCaveatFlag: single; multiple with " | "; null; empty; whitespace
runGroup('parseCaveatFlag behavior', () => {
  assert.deepStrictEqual(parseCaveatFlag(null), []);
  assert.deepStrictEqual(parseCaveatFlag(undefined), []);
  assert.deepStrictEqual(parseCaveatFlag(''), []);
  assert.deepStrictEqual(parseCaveatFlag('   '), []);
  
  const single = 'Mining has lower labeled support and should be read cautiously.';
  assert.deepStrictEqual(parseCaveatFlag(single), [single]);

  const multi = 'Mining has lower labeled support and should be read cautiously. | Calibrated confidence is below the per-class review threshold; treat as provisional.';
  const multiChips = parseCaveatFlag(multi);
  assert.strictEqual(multiChips.length, 2);
  assert.strictEqual(multiChips[0], 'Mining has lower labeled support and should be read cautiously.');
  assert.strictEqual(multiChips[1], 'Calibrated confidence is below the per-class review threshold; treat as provisional.');

  const padded = '  First caveat  |   Second caveat   |  ';
  assert.deepStrictEqual(parseCaveatFlag(padded), ['First caveat', 'Second caveat']);
});

// 3. confidenceLabel: unclassified -> Uncertain; needs_review -> Needs review; else -> High confidence
runGroup('confidenceLabel mapping', () => {
  assert.strictEqual(confidenceLabel(null), 'Uncertain');
  assert.strictEqual(confidenceLabel(undefined), 'Uncertain');
  assert.strictEqual(confidenceLabel({ predicted_class: 'unclassified', confidence: 0.99 }), 'Uncertain');
  assert.strictEqual(confidenceLabel({ predicted_class: 'unclassified', needs_review: false }), 'Uncertain');
  
  assert.strictEqual(confidenceLabel({ predicted_class: 'agricultural_burn', needs_review: true, confidence: 0.95 }), 'Needs review');
  assert.strictEqual(confidenceLabel({ predicted_class: 'mining', needs_review: true, confidence: 0.80 }), 'Needs review');
  assert.strictEqual(confidenceLabel({ predicted_class: 'industrial', needs_review: true, confidence: 0.65 }), 'Needs review');
  assert.strictEqual(confidenceLabel({ predicted_class: 'wildfire', needs_review: true, confidence: 0.50 }), 'Needs review');

  assert.strictEqual(confidenceLabel({ predicted_class: 'industrial', needs_review: false, confidence: 0.92 }), 'High confidence');
  assert.strictEqual(confidenceLabel({ predicted_class: 'wildfire', needs_review: false, confidence: 0.88 }), 'High confidence');
  assert.strictEqual(confidenceLabel({ predicted_class: 'mining', needs_review: false, confidence: 0.90 }), 'High confidence');
});

// 4. Mode state machine: toggles, onApiModeChange notifications, unsubscribe
runGroup('Mode state machine and subscription listener', () => {
  let latestMode = null;
  const unsubscribe = onApiModeChange((mode) => {
    latestMode = mode;
  });

  setApiMode('mock');
  assert.strictEqual(getApiMode(), 'mock');
  assert.strictEqual(latestMode, 'mock');

  setApiMode('live');
  assert.strictEqual(getApiMode(), 'live');
  assert.strictEqual(latestMode, 'live');

  forceMockMode(true);
  assert.strictEqual(getApiMode(), 'mock');
  assert.strictEqual(latestMode, 'mock');

  forceMockMode(false);
  assert.strictEqual(getApiMode(), 'live');
  assert.strictEqual(latestMode, 'live');

  unsubscribe();
  forceMockMode(true);
  assert.strictEqual(getApiMode(), 'mock');
  assert.strictEqual(latestMode, 'live', 'Unsubscribed listener must not receive updates');
});

// 5. forceMockMode(true) + fetchPredictions: mock data with all classes & strict agricultural_burn check
await runGroupAsync('Mock predictions generation & strict agricultural_burn assertions', async () => {
  forceMockMode(true);
  const preds = await fetchPredictions(INDIA_BOUNDS, '2025-01-26', 8);
  assert.ok(Array.isArray(preds), 'fetchPredictions must return an array');
  assert.ok(preds.length > 0, 'Predictions list must not be empty');

  const classesFound = new Set(preds.map((p) => p.predicted_class));
  assert.ok(classesFound.has('industrial'), 'Must include industrial');
  assert.ok(classesFound.has('mining'), 'Must include mining');
  assert.ok(classesFound.has('agricultural_burn'), 'Must include agricultural_burn');
  assert.ok(classesFound.has('wildfire'), 'Must include wildfire');
  assert.ok(classesFound.has('unclassified'), 'Must include unclassified');

  const agCells = preds.filter((p) => p.predicted_class === 'agricultural_burn');
  assert.ok(agCells.length > 0, 'Must have agricultural_burn cells');
  for (const cell of agCells) {
    assert.strictEqual(cell.needs_review, true, 'Every agricultural_burn cell MUST have needs_review === true');
    assert.strictEqual(confidenceLabel(cell), 'Needs review', 'confidenceLabel must return "Needs review" for agricultural_burn');
  }
});

// 6. Mining mock cells carry verbatim caveat and split into chips
await runGroupAsync('Mining mock cells verbatim caveat', async () => {
  forceMockMode(true);
  const preds = await fetchPredictions(INDIA_BOUNDS, '2025-01-26', 8);
  const miningCells = preds.filter((p) => p.predicted_class === 'mining');
  assert.ok(miningCells.length > 0, 'Must have mining cells');

  for (const cell of miningCells) {
    assert.ok(cell.caveat_flag, 'Mining cell must carry caveat_flag');
    assert.ok(
      cell.caveat_flag.includes('Mining has lower labeled support and should be read cautiously.'),
      'Caveat flag must contain verbatim mining caveat text'
    );
    const chips = parseCaveatFlag(cell.caveat_flag);
    assert.ok(chips.includes(KNOWN_CAVEATS.mining));
  }
});

// 7. fetchHealth in mock mode returns review_thresholds & target_classes; fetchExplanation returns descriptions; fetchCellDetail throws
await runGroupAsync('Mock endpoints contract (fetchHealth, fetchExplanation, fetchCellDetail)', async () => {
  forceMockMode(true);
  
  // Health
  const health = await fetchHealth();
  assert.deepStrictEqual(health.target_classes, ['industrial', 'mining', 'agricultural_burn', 'wildfire']);
  assert.deepStrictEqual(health.review_thresholds, {
    wildfire: 0.70,
    industrial: 0.70,
    mining: 0.85,
    agricultural_burn: 1.01
  });

  // Explanation
  const explanation = await fetchExplanation('88209a2011fffff', '2025-01-26');
  assert.ok(explanation.feature_attributions);
  assert.ok(explanation.feature_attributions.length <= 3);
  for (const attr of explanation.feature_attributions) {
    assert.ok(attr.description && typeof attr.description === 'string');
  }

  // Detail query must throw
  let threw = false;
  try {
    await fetchCellDetail('88209a2011fffff', '2025-01-26');
  } catch (e) {
    threw = true;
    assert.ok(e.message.includes('mock mode'));
  }
  assert.strictEqual(threw, true, 'fetchCellDetail in mock mode must throw an error');
});

// 8. getAvailableClasses empirical filtering & locked taxonomy ordering
runGroup('getAvailableClasses empirical filtering & taxonomy ordering', () => {
  assert.deepStrictEqual(getAvailableClasses([]), []);
  assert.deepStrictEqual(getAvailableClasses(null), []);
  assert.deepStrictEqual(getAvailableClasses(undefined), []);

  const sample1 = [
    { predicted_class: 'wildfire' },
    { predicted_class: 'industrial' }
  ];
  // Must be ordered according to canonical taxonomy: ['industrial', 'mining', 'agricultural_burn', 'wildfire', 'unclassified']
  assert.deepStrictEqual(getAvailableClasses(sample1), ['industrial', 'wildfire']);

  // unclassified only present when empirically in batch
  const sample2 = [
    { predicted_class: 'agricultural_burn' },
    { predicted_class: 'mining' },
    { predicted_class: 'unclassified' }
  ];
  assert.deepStrictEqual(getAvailableClasses(sample2), ['mining', 'agricultural_burn', 'unclassified']);

  const sampleNoUnclass = [
    { predicted_class: 'mining' },
    { predicted_class: 'industrial' }
  ];
  assert.strictEqual(getAvailableClasses(sampleNoUnclass).includes('unclassified'), false);
});

// 9. exportPredictionsToCsv format validation & mock is_synthetic
await runGroupAsync('exportPredictionsToCsv format & is_synthetic check', async () => {
  forceMockMode(true);
  const preds = await fetchPredictions(INDIA_BOUNDS, '2025-01-26', 8);

  // Every mock cell must have is_synthetic === true
  assert.ok(preds.every(p => p.is_synthetic === true), 'All mock predictions must have is_synthetic: true');

  const csv = exportPredictionsToCsv(preds, 'test_export.csv');
  assert.ok(typeof csv === 'string');
  assert.ok(csv.startsWith('\uFEFFcell_id,latitude,longitude,h3_index,predicted_class,confidence,calibrated,needs_review,caveat_flag,latency_ms,is_synthetic'));

  const lines = csv.trim().split(/\r?\n/);
  // Header + prediction count
  assert.strictEqual(lines.length, preds.length + 1);

  // Error case on empty list
  assert.throws(() => exportPredictionsToCsv([]), /No predictions/);
});

// Reset mode to live
setApiMode('live');
assert.strictEqual(getApiMode(), 'live');

// 10. Shared India geography contract + client-side provenance filtering
runGroup('India bounds contract & outside-India client filter', () => {
  // Single shared geography contract — must equal the ingestion INDIA_BBOX
  // (west 68.03, south 6.75, east 97.42, north 37.10) used by backend fetches.
  assert.deepStrictEqual(INDIA_BOUNDS, {
    min_lat: 6.75,
    max_lat: 37.10,
    min_lon: 68.03,
    max_lon: 97.42
  });

  // isOutsideIndia: server provenance is authoritative when present...
  assert.strictEqual(isOutsideIndia({ geography: 'outside_india', latitude: 11, longitude: 76 }), true);
  assert.strictEqual(isOutsideIndia({ geography: 'training_geography', latitude: 19, longitude: 72.8 }), false);
  assert.strictEqual(isOutsideIndia({ geography: 'india_outside_training', latitude: 20.3, longitude: 85.8 }), false);
  assert.strictEqual(isOutsideIndia({ geography: 'unexpected_value', latitude: 2, longitude: 2 }), true, 'Unknown provenance must fall back to conservative geometry');

  // ...and legacy/malformed responses WITHOUT provenance fall back to
  // conservative geometry: Sri Lanka box, out-of-bbox, and coordinate-less
  // cells must all be rejected even when geography is missing.
  assert.strictEqual(isOutsideIndia({ latitude: 7.61, longitude: 81.03 }), true, 'Sri Lanka, no geography');
  assert.strictEqual(isOutsideIndia({ latitude: 15.0, longitude: 88.0 }), false, 'Bay of Bengal inside bbox, no geography — kept by geometry fallback');
  assert.strictEqual(isOutsideIndia({ latitude: 2.0, longitude: 81.0 }), true, 'outside bbox south');
  assert.strictEqual(isOutsideIndia({ latitude: 45.0, longitude: 76.0 }), true, 'outside bbox north');
  assert.strictEqual(isOutsideIndia({}), true, 'no coordinates at all');
  assert.strictEqual(isOutsideIndia(null), true);
  assert.strictEqual(isOutsideIndia({ latitude: 11.0, longitude: 76.9 }), false, 'plain valid India coordinate');

  // FireMapPage filter composition: outside-India provenance and Sri Lanka
  // coordinate (missing geography) never render or count.
  const predictions = [
    { latitude: 11.0, longitude: 76.9, predicted_class: 'wildfire', geography: 'training_geography', confidence: 0.9 },
    { latitude: 20.3, longitude: 85.8, predicted_class: 'industrial', geography: 'india_outside_training', confidence: 0.8 },
    { latitude: 7.61, longitude: 81.03, predicted_class: 'wildfire', geography: 'outside_india', confidence: 0.95 }, // Sri Lanka, provenance
    { latitude: 7.61, longitude: 81.03, predicted_class: 'mining', confidence: 0.9 } // Sri Lanka, MISSING geography
  ];
  const INDIA_FILTER = {
    minLon: INDIA_BOUNDS.min_lon, maxLon: INDIA_BOUNDS.max_lon,
    minLat: INDIA_BOUNDS.min_lat, maxLat: INDIA_BOUNDS.max_lat
  };
  const indiaFiltered = predictions.filter(p =>
    !isOutsideIndia(p) &&
    p.latitude >= INDIA_FILTER.minLat && p.latitude <= INDIA_FILTER.maxLat &&
    p.longitude >= INDIA_FILTER.minLon && p.longitude <= INDIA_FILTER.maxLon
  );
  assert.strictEqual(indiaFiltered.length, 2);
  assert.strictEqual(
    indiaFiltered.filter(p => p.geography === 'india_outside_training').length, 1
  );
});

console.log(`\n========================================`);
console.log(`Summary: ${passedGroups} / ${totalGroups} test groups PASSED.`);
console.log(`========================================`);
