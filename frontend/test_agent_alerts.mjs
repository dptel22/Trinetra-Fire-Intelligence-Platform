// Focused tests for Agent 2 (Alerts & Archive frontend).
// Run: node test_agent_alerts.mjs
// Covers: status derivation, ingestion staleness, strict live fetch (no silent
// mock fallback), archive API helpers, CSV export metadata, ArchivePage SSR.
import assert from 'node:assert/strict';
import {
  deriveAlertsStatus,
  assessIngestionFreshness,
  ingestionStatusWarning,
  fetchPredictions,
  fetchPredictionsStrict,
  fetchArchiveDates,
  fetchArchivePredictions,
  fetchArchiveSummary,
  exportPredictionsToCsv,
  getApiMode,
  forceMockMode
} from './src/services/api.js';

let totalGroups = 0;
let passedGroups = 0;

function runGroup(name, fn) {
  totalGroups++;
  try {
    const maybePromise = fn();
    if (maybePromise && typeof maybePromise.then === 'function') {
      return maybePromise.then(() => {
        passedGroups++;
        console.log(`[PASS] Group ${totalGroups}: ${name}`);
      }, (err) => {
        console.error(`[FAIL] Group ${totalGroups}: ${name}`);
        console.error(err);
        process.exit(1);
      });
    }
    passedGroups++;
    console.log(`[PASS] Group ${totalGroups}: ${name}`);
  } catch (err) {
    console.error(`[FAIL] Group ${totalGroups}: ${name}`);
    console.error(err);
    process.exit(1);
  }
  return undefined;
}

function withFetch(stub, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  return Promise.resolve()
    .then(fn)
    .finally(() => { globalThis.fetch = original; });
}

// ---------------------------------------------------------------------------
// deriveAlertsStatus
// ---------------------------------------------------------------------------

await runGroup('deriveAlertsStatus: live mode with no error and newest date is LIVE', () => {
  assert.equal(deriveAlertsStatus({ apiMode: 'live', hasError: false, isHistorical: false }), 'LIVE');
});

await runGroup('deriveAlertsStatus: older selected date is HISTORICAL even with live mode', () => {
  assert.equal(deriveAlertsStatus({ apiMode: 'live', hasError: false, isHistorical: true }), 'HISTORICAL');
});

await runGroup('deriveAlertsStatus: failed live request is OFFLINE, never LIVE', () => {
  assert.equal(deriveAlertsStatus({ apiMode: 'live', hasError: true, isHistorical: false }), 'OFFLINE');
  assert.equal(deriveAlertsStatus({ apiMode: 'live', hasError: true, isHistorical: true }), 'OFFLINE');
});

await runGroup('deriveAlertsStatus: mock mode is DEMO and wins over everything', () => {
  assert.equal(deriveAlertsStatus({ apiMode: 'mock', hasError: false, isHistorical: false }), 'DEMO');
  assert.equal(deriveAlertsStatus({ apiMode: 'mock', hasError: true, isHistorical: true }), 'DEMO');
});

await runGroup('deriveAlertsStatus: newest date reported historical by backend is HISTORICAL', () => {
  assert.equal(deriveAlertsStatus({ apiMode: 'live', hasError: false, isHistorical: false, backendDataMode: 'historical' }), 'HISTORICAL');
  assert.equal(deriveAlertsStatus({ apiMode: 'live', hasError: false, isHistorical: false, backendDataMode: 'offline' }), 'OFFLINE');
  assert.equal(deriveAlertsStatus({ apiMode: 'live', hasError: false, isHistorical: false, backendDataMode: 'demo' }), 'DEMO');
});

// ---------------------------------------------------------------------------
// assessIngestionFreshness
// ---------------------------------------------------------------------------

await runGroup('assessIngestionFreshness: fresh clean run yields no warnings', () => {
  const result = assessIngestionFreshness({
    ingestion: { available: true, last_run_ok: true, final_daily_rows: 3200, fetch_mode: 'live_firms' },
    latestAcqDate: '2026-09-09',
    today: '2026-09-10'
  });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.stale, false);
});

await runGroup('assessIngestionFreshness: newest date 3+ days old is stale', () => {
  const result = assessIngestionFreshness({
    ingestion: { available: true, last_run_ok: true, final_daily_rows: 3200 },
    latestAcqDate: '2026-09-01',
    today: '2026-09-10'
  });
  assert.equal(result.stale, true);
  assert.ok(result.warnings.some((w) => /9 days behind/.test(w)), `expected stale warning, got: ${result.warnings}`);
});

await runGroup('assessIngestionFreshness: implausibly low nationwide row count warns', () => {
  const result = assessIngestionFreshness({
    ingestion: { available: true, last_run_ok: true, final_daily_rows: 12 },
    latestAcqDate: '2026-09-09',
    today: '2026-09-10'
  });
  assert.equal(result.lowVolume, true);
  assert.ok(result.warnings.some((w) => /implausibly low/i.test(w)));
});

await runGroup('assessIngestionFreshness: failed last run warns', () => {
  const result = assessIngestionFreshness({
    ingestion: { available: true, last_run_ok: false },
    latestAcqDate: '2026-09-09',
    today: '2026-09-10'
  });
  assert.ok(result.warnings.some((w) => /failed/i.test(w)));
});

await runGroup('assessIngestionFreshness: missing provenance warns, missing date warns', () => {
  const noProv = assessIngestionFreshness({ ingestion: { available: false }, latestAcqDate: '2026-09-09', today: '2026-09-10' });
  assert.ok(noProv.warnings.some((w) => /provenance/i.test(w)));
  const noDate = assessIngestionFreshness({ ingestion: { available: true, last_run_ok: true }, latestAcqDate: null, today: '2026-09-10' });
  assert.ok(noDate.warnings.length > 0);
});

await runGroup('ingestionStatusWarning: per-date backend statuses surface, ok is silent', () => {
  assert.equal(ingestionStatusWarning('ok'), null);
  assert.ok(/plausibility/i.test(ingestionStatusWarning('plausibility_warning')));
  assert.ok(/failed/i.test(ingestionStatusWarning('failed')));
  assert.ok(/no ingestion run record/i.test(ingestionStatusWarning('no_run_record')));
});

// ---------------------------------------------------------------------------
// Strict live fetch: no silent mock fallback
// ---------------------------------------------------------------------------

await runGroup('fetchPredictionsStrict: live failure throws and does NOT flip api mode to mock', () => {
  forceMockMode(false);
  return withFetch(() => Promise.reject(new TypeError('NetworkError')), async () => {
    await assert.rejects(() => fetchPredictionsStrict({ min_lat: 6, max_lat: 37, min_lon: 68, max_lon: 97 }, '2026-09-09', 5));
    assert.equal(getApiMode(), 'live');
  });
});

await runGroup('fetchPredictionsStrict: mock mode still returns simulated rows (labeled DEMO by UI)', () => {
  forceMockMode(true);
  return withFetch(() => { throw new Error('network must not be touched in mock mode'); }, async () => {
    const rows = await fetchPredictionsStrict({ min_lat: 6, max_lat: 37, min_lon: 68, max_lon: 97 }, '2026-09-09', 5);
    assert.ok(Array.isArray(rows) && rows.length > 0);
    assert.equal(rows.every((r) => r.is_synthetic === true), true);
  }).finally(() => forceMockMode(false));
});

await runGroup('fetchPredictions (legacy, map): live failure silently returns mock and flips mode', () => {
  forceMockMode(false);
  return withFetch(() => Promise.reject(new TypeError('NetworkError')), async () => {
    const rows = await fetchPredictions({ min_lat: 6, max_lat: 37, min_lon: 68, max_lon: 97 }, '2026-09-09', 5);
    assert.ok(Array.isArray(rows) && rows.length > 0);
    assert.equal(getApiMode(), 'mock');
  }).finally(() => forceMockMode(false));
});

// ---------------------------------------------------------------------------
// Archive API helpers
// ---------------------------------------------------------------------------

await runGroup('fetchArchiveDates: normalizes the backend contract', () => {
  return withFetch(() => Promise.resolve(new Response(JSON.stringify({
    available_dates: ['2026-09-02', '2026-09-09'],
    newest_date: '2026-09-09',
    oldest_date: '2026-09-02',
    source: 'duckdb:test',
    data_mode: 'live'
  }), { status: 200 })), async () => {
    const result = await fetchArchiveDates();
    assert.deepEqual(result.availableDates, ['2026-09-02', '2026-09-09']);
    assert.equal(result.newestDate, '2026-09-09');
    assert.equal(result.oldestDate, '2026-09-02');
    assert.equal(result.dataMode, 'live');
  });
});

await runGroup('fetchArchiveDates: non-OK response throws (no fake dates)', () => {
  return withFetch(() => Promise.resolve(new Response('{"detail":"Not Found"}', { status: 404 })), async () => {
    await assert.rejects(() => fetchArchiveDates());
  });
});

await runGroup('fetchArchivePredictions: sends filters and paginates via query params', () => {
  let capturedUrl = '';
  return withFetch((url) => {
    capturedUrl = String(url);
    return Promise.resolve(new Response(JSON.stringify({
      total: 123,
      acq_date: '2026-09-08',
      predictions: [],
      data_mode: 'historical',
      source: 'duckdb:test',
      model_version: 'v3-h3-day-catboost',
      ingestion_status: 'no_run_record'
    }), { status: 200 }));
  }, async () => {
    const result = await fetchArchivePredictions({
      acqDate: '2026-09-08', className: 'industrial', state: 'Maharashtra',
      needsReview: true, minConfidence: 0.7, limit: 50, offset: 25
    });
    const u = new URL(capturedUrl);
    assert.equal(u.pathname, '/api/v1/archive/predictions');
    assert.equal(u.searchParams.get('acq_date'), '2026-09-08');
    assert.equal(u.searchParams.get('class_name'), 'industrial');
    assert.equal(u.searchParams.get('state'), 'Maharashtra');
    assert.equal(u.searchParams.get('needs_review'), 'true');
    assert.equal(u.searchParams.get('min_confidence'), '0.7');
    assert.equal(u.searchParams.get('limit'), '50');
    assert.equal(u.searchParams.get('offset'), '25');
    assert.equal(result.total, 123);
    assert.equal(result.dataMode, 'historical');
    assert.equal(result.ingestionStatus, 'no_run_record');
  });
});

await runGroup('fetchArchivePredictions: 404 archive_date_not_available is flagged, not generic', () => {
  return withFetch(() => Promise.resolve(new Response(JSON.stringify({
    detail: { error: 'archive_date_not_available', acq_date: '2026-09-05', newest_date: '2026-09-09', oldest_date: '2026-09-02' }
  }), { status: 404 })), async () => {
    try {
      await fetchArchivePredictions({ acqDate: '2026-09-05' });
      assert.fail('expected rejection');
    } catch (err) {
      assert.equal(err.notAvailable, true);
      assert.equal(err.acqDate, '2026-09-05');
    }
  });
});

await runGroup('fetchArchiveSummary: normalizes days and unavailable dates', () => {
  return withFetch(() => Promise.resolve(new Response(JSON.stringify({
    start_date: '2026-09-02',
    end_date: '2026-09-09',
    days: [{ date: '2026-09-09', total: 100, needs_review_total: 20, by_class: { industrial: 40 }, by_state: { Maharashtra: 30, unknown: 5 } }],
    unavailable_dates: ['2026-09-04'],
    data_mode: 'historical',
    source: 'duckdb:test'
  }), { status: 200 })), async () => {
    const result = await fetchArchiveSummary({});
    assert.equal(result.days.length, 1);
    assert.deepEqual(result.days[0].byState, { Maharashtra: 30, unknown: 5 });
    assert.deepEqual(result.unavailableDates, ['2026-09-04']);
  });
});

// ---------------------------------------------------------------------------
// CSV export metadata
// ---------------------------------------------------------------------------

await runGroup('exportPredictionsToCsv: includes acq_date and data_mode columns and selected date', () => {
  const rows = [{
    cell_id: '88209a2011fffff', latitude: 22.47, longitude: 70.05, h3_index: '88209a2011fffff',
    predicted_class: 'industrial', confidence: 0.9, calibrated: true, needs_review: false,
    caveat_flag: null, latency_ms: 2.0, is_synthetic: false
  }];
  const csv = exportPredictionsToCsv(rows, 'trinetra_archive_2026-09-08.csv', {
    acqDate: '2026-09-08', dataMode: 'historical'
  });
  const lines = csv.replace(/^\uFEFF/, '').split('\r\n');
  const headers = lines[0].split(',');
  assert.ok(headers.includes('acq_date'), `headers missing acq_date: ${headers}`);
  assert.ok(headers.includes('data_mode'), `headers missing data_mode: ${headers}`);
  const dataRow = lines[1].split(',');
  assert.equal(dataRow[headers.indexOf('acq_date')], '2026-09-08');
  assert.equal(dataRow[headers.indexOf('data_mode')], 'historical');
});

await runGroup('exportPredictionsToCsv: legacy two-arg calls still work (blank metadata)', () => {
  const rows = [{
    cell_id: 'x', latitude: 1, longitude: 2, h3_index: 'x', predicted_class: 'wildfire',
    confidence: 0.9, calibrated: true, needs_review: false, caveat_flag: null, latency_ms: 1
  }];
  const csv = exportPredictionsToCsv(rows, 'legacy.csv');
  assert.ok(csv.includes('wildfire'));
});

// ---------------------------------------------------------------------------
// SSR smoke: Archive + Alerts pages render via Vite ssrLoadModule (real JSX)
// ---------------------------------------------------------------------------

await runGroup('SSR smoke: ArchivePage and FireAlertsPage render expected chrome', async () => {
  const { createServer } = await import('vite');
  const React = (await import('react')).default;
  const { renderToString } = await import('react-dom/server');
  const { MemoryRouter } = await import('react-router-dom');

  // Header reads localStorage during render; stub it for SSR.
  if (!globalThis.localStorage) {
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  }

  const server = await createServer({
    root: process.cwd(),
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom'
  });
  try {
    const archiveMod = await server.ssrLoadModule('/src/components/ArchivePage.jsx');
    const alertsMod = await server.ssrLoadModule('/src/components/FireAlertsPage.jsx');

    const archiveHtml = renderToString(
      React.createElement(MemoryRouter, { initialEntries: ['/archive'] }, React.createElement(archiveMod.default))
    );
    assert.ok(archiveHtml.includes('Historical'), 'archive title missing');
    assert.ok(/HISTORICAL/i.test(archiveHtml), 'historical status label missing');
    assert.ok(archiveHtml.includes('Class'), 'class filter missing');

    const alertsHtml = renderToString(
      React.createElement(MemoryRouter, { initialEntries: ['/fire-alerts'] }, React.createElement(alertsMod.default))
    );
    assert.ok(/Infrastructure Fire Alerts/.test(alertsHtml), 'alerts title missing');
  } finally {
    await server.close();
  }
});

console.log(`\n${passedGroups}/${totalGroups} groups passed`);
if (passedGroups !== totalGroups) process.exit(1);
