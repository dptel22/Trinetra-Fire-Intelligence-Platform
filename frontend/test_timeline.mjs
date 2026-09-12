import assert from 'node:assert/strict';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom'
});

try {
  // Mock environment for API
  if (!globalThis.localStorage) {
    globalThis.localStorage = { getItem: () => 'mock', setItem: () => {}, removeItem: () => {} };
  }
  globalThis.importMeta = { env: { VITE_API_URL: 'http://localhost:8000' } };

  const api = await server.ssrLoadModule('/src/services/api.js');
  
  // Test 1: mock timeline variants match the frozen backend envelope.
  api.setApiMode('mock');
  console.log('Testing fetchCellTimeline in mock mode...');
  const stableTimeline = await api.fetchCellTimeline('8826a1d48dfffff');
  const transitionTimeline = await api.fetchCellTimeline('8826b2c48dfffff');
  const degradedTimeline = await api.fetchCellTimeline('8826c3d48dfffff');
  const contextUnavailableTimeline = await api.fetchCellTimeline('8826d4e48dfffff');
  const yearlyTimeline = await api.fetchCellTimeline('8826a1d48dfffff', { granularity: 'year', limit: 10 });
  for (const timeline of [stableTimeline, transitionTimeline, degradedTimeline, contextUnavailableTimeline]) {
    assert.ok(timeline, 'Mock timeline should be returned');
    assert.ok(Array.isArray(timeline.rows), 'Mock timeline should have rows');
    assert.equal(timeline.granularity, 'month');
    assert.ok('materialization_status' in timeline);
    assert.ok('materialized_start_date' in timeline);
    assert.ok('materialized_end_date' in timeline);
    assert.ok('fallback_used' in timeline);
    assert.ok('archive_range_limited' in timeline);
    assert.ok('requested_start_date' in timeline);
    assert.ok('requested_end_date' in timeline);
    assert.ok('available_start_date' in timeline);
    assert.ok('available_end_date' in timeline);
    assert.ok('gaps' in timeline);
    assert.ok('partial_periods' in timeline);
    assert.ok('has_more' in timeline);
    assert.ok('next_cursor' in timeline);
    assert.ok('model' in timeline);
    assert.ok('caveats' in timeline);
    assert.equal(timeline.context.historical_context_available, false);
    assert.equal(timeline.context.land_use_claim, false);
  }
  assert.equal(transitionTimeline.rows[0].transition_type, 'seasonal_to_persistent');
  assert.equal(degradedTimeline.materialization_status, 'fallback_h3_daily');
  assert.equal(degradedTimeline.fallback_used, true);
  assert.equal(yearlyTimeline.granularity, 'year');
  console.log('✓ fetchCellTimeline returns stable, transition, degraded, and context-limited mock data');

  // Test 2: HexInspectorPanel renders timeline section
  console.log('Testing HexInspectorPanel rendering...');
  const panel = await server.ssrLoadModule('/src/components/HexInspectorPanel.jsx');
  const dummyCell = {
    cell_id: '8826a1d48dfffff',
    predicted_class: 'industrial',
    confidence: 0.92,
    probabilities: [{ class_name: 'industrial', probability: 0.92 }]
  };
  
  const html = renderToString(
    React.createElement(panel.default, { cell: dummyCell })
  );
  
  assert.ok(html.includes('Recent Thermal History'), 'Timeline header missing');
  assert.ok(html.includes('Current OSM/WRI Context'), 'Current context section missing');
  assert.ok(html.includes('Historical Land-Use Context'), 'Historical context section missing');
  assert.ok(html.includes('Cannot check historical land use in this environment'), 'Unavailable context state missing');
  assert.ok(html.includes('Thermal evidence only'), 'Timeline caveat missing');
  console.log('✓ HexInspectorPanel renders timeline skeleton');

} catch (err) {
  console.error('Test failed:', err);
  process.exit(1);
} finally {
  await server.close();
}
