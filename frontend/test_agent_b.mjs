import assert from 'node:assert/strict';
import {
  CLASS_COLORS,
  CLASS_LABELS,
  FIRE_COLORS,
  FIRE_LABELS,
  FIRE_CAVEATS,
  KNOWN_CAVEATS,
  INDIA_BOUNDS,
  INDIA_CENTER,
  parseCaveatFlag,
  confidenceLabel,
  getApiMode,
  setApiMode,
  forceMockMode,
  onApiModeChange,
  fetchPredictions,
  fetchHealth,
  fetchExplanation,
  fetchCellDetail
} from './src/services/api.js';

let totalGroups = 0;
let passedGroups = 0;

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

// Reset mode to live
setApiMode('live');
assert.strictEqual(getApiMode(), 'live');

console.log(`\n========================================`);
console.log(`Summary: ${passedGroups} / ${totalGroups} test groups PASSED.`);
console.log(`========================================`);
