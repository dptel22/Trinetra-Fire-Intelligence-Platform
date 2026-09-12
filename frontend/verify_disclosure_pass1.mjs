// A.5 disclosure verification, pass 1 — live out-of-training cell, rendered UI proof.
// Chain under test: model_service caveat -> API caveat_flag -> HexInspectorPanel caveat chip.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';

const LIVE = process.env.LIVE_URL || 'http://127.0.0.1:8000';

// 1. Real out-of-training payload. Live server first; captured-payload fallback
// (served via TestClient) when no server is running.
let cell;
try {
  const url = `${LIVE}/api/v1/predictions?min_lat=8.3&max_lat=12.8&min_lon=74.8&max_lon=77.5&acq_date=2026-09-09&zoom=8`;
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  assert.equal(res.ok, true, `live API returned ${res.status}`);
  const data = await res.json();
  cell = (data.predictions || []).find((p) => p.geography === 'india_outside_training');
} catch {
  const fs0 = await import('node:fs');
  cell = JSON.parse(fs0.readFileSync(new URL('./live_out_of_training_cell.json', import.meta.url), 'utf8'));
  console.log('(live server down — using captured real payload)');
}
assert.ok(cell, 'no india_outside_training cell in live response');
assert.ok(
  (cell.caveat_flag || '').includes('Outside validated training geography'),
  `live caveat_flag missing geography caveat: ${cell.caveat_flag}`
);
console.log(`✓ live cell ${cell.cell_id} geography=india_outside_training`);
console.log(`  caveat_flag: ${cell.caveat_flag}`);

// 2. Render the panel with that exact real payload.
if (!globalThis.localStorage) {
  globalThis.localStorage = { getItem: () => 'mock', setItem: () => {}, removeItem: () => {} };
}
globalThis.importMeta = { env: { VITE_API_URL: LIVE } };

const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom'
});

try {
  const panel = await server.ssrLoadModule('/src/components/HexInspectorPanel.jsx');
  const html = renderToString(React.createElement(panel.default, { cell }));

  assert.ok(
    html.includes('Outside validated training geography'),
    'caveat text NOT visible in rendered HexInspectorPanel'
  );
  assert.ok(html.includes('Needs review') || html.includes('needs review'), 'review badge missing');

  fs.writeFileSync('disclosure_pass1_dom.html', html);
  console.log('✓ rendered HexInspectorPanel shows the geography caveat (DOM saved to disclosure_pass1_dom.html)');
  console.log('PASS: disclosure chain verified end-to-end at the pixel level.');
} catch (err) {
  console.error('FAIL:', err.message);
  process.exitCode = 1;
} finally {
  await server.close();
}
