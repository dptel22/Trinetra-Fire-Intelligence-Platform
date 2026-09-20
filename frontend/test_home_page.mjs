import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'vite';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

const source = readFileSync(new URL('./src/components/HomePage.jsx', import.meta.url), 'utf8');
const server = await createServer({
  root: process.cwd(),
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom'
});

try {
  if (!globalThis.localStorage) {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }

  const home = await server.ssrLoadModule('/src/components/HomePage.jsx');
  assert.equal(typeof home.deriveLandingStatus, 'function', 'deriveLandingStatus must be exported');

  assert.deepEqual(
    home.deriveLandingStatus(
      {
        status: 'healthy',
        latest_acq_date: '2026-09-09',
        ingestion: { available: true, last_run_ok: true, final_daily_rows: 500 }
      },
      'live',
      '2026-09-10'
    ),
    { tone: 'live', label: 'Latest verified acquisition: 2026-09-09', detail: '' }
  );

  assert.equal(home.deriveLandingStatus({}, 'mock', '2026-09-10').tone, 'demo');
  assert.equal(home.deriveLandingStatus({ status: 'offline' }, 'live', '2026-09-10').tone, 'offline');
  assert.equal(
    home.deriveLandingStatus(
      { status: 'healthy', latest_acq_date: '2026-09-09', ingestion: { available: true, last_run_ok: false } },
      'live',
      '2026-09-10'
    ).tone,
    'caution'
  );
  assert.equal(
    home.deriveLandingStatus(
      { status: 'healthy', latest_acq_date: '2026-09-01', ingestion: { available: true, last_run_ok: true, final_daily_rows: 500 } },
      'live',
      '2026-09-10'
    ).tone,
    'caution'
  );
  assert.equal(
    home.deriveLandingStatus({ status: 'healthy', latest_acq_date: '2026-09-09', ingestion: null }, 'live', '2026-09-10').tone,
    'caution'
  );

  const html = renderToString(
    React.createElement(MemoryRouter, { initialEntries: ['/home'] }, React.createElement(home.default))
  );
  for (const text of [
    'Not all hotspots are the same. We tell you which kind you&#x27;re looking at.',
    'Data status',
    'How TRINETRA supports assessment',
    'Detect',
    'Contextualize',
    'Investigate',
    'Industrial Facility',
    'Mining / Smelter',
    'Agricultural Burn',
    'Wildfire',
    'reviewed against available evidence before escalation'
  ]) {
    assert.ok(html.includes(text), `missing landing-page text: ${text}`);
  }
  assert.ok(html.includes('href="/fire-map"'), 'fire map route missing');
  assert.ok(html.includes('href="/fire-alerts"'), 'fire alerts route missing');

  for (const forbidden of ['1,482', '94.2% F1', 'All Feeds Operational', '&lt;180ms']) {
    assert.equal(source.includes(forbidden), false, `forbidden static claim found: ${forbidden}`);
  }

  console.log('Home page status and briefing checks passed.');
} finally {
  await server.close();
}
