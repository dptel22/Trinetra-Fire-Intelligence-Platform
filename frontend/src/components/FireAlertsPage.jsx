import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from './Header';
import OfflineBanner from './OfflineBanner';
import {
  fetchPredictionsStrict,
  fetchArchiveDates,
  fetchArchivePredictions,
  fetchRawEvidence,
  fetchAlertStates,
  fetchAlertHistory,
  submitAlertAction,
  fetchHealth,
  INDIA_BOUNDS,
  CLASS_COLORS,
  CLASS_LABELS,
  KNOWN_CAVEATS,
  parseCaveatFlag,
  confidenceLabel,
  getAvailableClasses,
  exportPredictionsToCsv,
  deriveAlertsStatus,
  assessIngestionFreshness,
  ingestionStatusWarning,
  getApiMode,
  onApiModeChange
} from '../services/api';

const PAGE_SIZE = 25;

const STATUS_STYLES = {
  LIVE: { bg: 'rgba(46, 204, 113, 0.15)', fg: '#1e9e5a', border: 'rgba(46, 204, 113, 0.45)', dot: '#2ecc71' },
  HISTORICAL: { bg: 'rgba(61, 157, 232, 0.15)', fg: '#2478bd', border: 'rgba(61, 157, 232, 0.45)', dot: '#3d9de8' },
  DEMO: { bg: 'rgba(241, 196, 15, 0.15)', fg: '#a07d00', border: 'rgba(241, 196, 15, 0.5)', dot: '#F1C40F' },
  OFFLINE: { bg: 'rgba(231, 76, 60, 0.15)', fg: '#d64228', border: 'rgba(231, 76, 60, 0.45)', dot: '#e74c3c' }
};

/**
 * Operational status pill for one acquisition date. The four states are
 * mutually exclusive: LIVE (newest date, live backend mode), HISTORICAL
 * (older archived date or backend-reported historical), DEMO (simulated
 * rows), OFFLINE (backend unreachable / fetch failed).
 */
export function StatusBadge({ status, labelPrefix = 'Feed status' }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.OFFLINE;
  return (
    <span
      role="status"
      aria-label={`${labelPrefix}: ${status}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '3px 10px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 800,
        letterSpacing: '0.06em',
        backgroundColor: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`
      }}
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: s.dot }} />
      {status}
    </span>
  );
}

/**
 * Lifecycle state chip, visually distinct from the model's needs-review
 * badge: analyst decisions (acknowledged/confirmed/dismissed) vs model flags.
 */
const LIFECYCLE_STYLES = {
  new: { bg: 'rgba(120, 120, 120, 0.15)', fg: '#9aa2ab', border: 'rgba(120, 120, 120, 0.4)', label: 'New' },
  acknowledged: { bg: 'rgba(61, 157, 232, 0.15)', fg: '#3d9de8', border: 'rgba(61, 157, 232, 0.45)', label: 'Acknowledged' },
  confirmed: { bg: 'rgba(46, 204, 113, 0.15)', fg: '#1e9e5a', border: 'rgba(46, 204, 113, 0.45)', label: 'Confirmed' },
  dismissed: { bg: 'rgba(231, 76, 60, 0.15)', fg: '#d64228', border: 'rgba(231, 76, 60, 0.45)', label: 'Dismissed' }
};

export function LifecycleBadge({ state }) {
  const s = LIFECYCLE_STYLES[state] || LIFECYCLE_STYLES.new;
  return (
    <span
      aria-label={`Lifecycle state: ${s.label}`}
      style={{
        padding: '3px 8px',
        borderRadius: '12px',
        fontSize: '0.72rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
        backgroundColor: s.bg,
        color: s.fg,
        border: `1px solid ${s.border}`
      }}
    >
      {s.label}
    </span>
  );
}

const ANALYST_ID_STORAGE_KEY = 'trinetra_analyst_id';

function loadAnalystId() {
  try {
    return window.localStorage.getItem(ANALYST_ID_STORAGE_KEY) || 'DEMO_ANALYST';
  } catch {
    return 'DEMO_ANALYST';
  }
}

function saveAnalystId(id) {
  try {
    window.localStorage.setItem(ANALYST_ID_STORAGE_KEY, id);
  } catch { /* private mode: keep in-memory only */ }
}

/**
 * Raw FIRMS evidence for the hotspot's date: the untouched satellite rows the
 * immutable raw archive preserved for the decisive ingestion run. A 404 for
 * dates that predate the archive renders as an honest note, never an error.
 */
function RawEvidencePanel({ acqDate, runId }) {
  const [evidence, setEvidence] = useState(null);
  const [state, setState] = useState('loading'); // loading | ready | notCaptured | error
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react/set-state-in-effect -- fetch state reset before the async call
    setState('loading');
    fetchRawEvidence({ acqDate, runId, limit: 25 })
      .then((res) => {
        if (!cancelled) {
          setEvidence(res);
          setState('ready');
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.notAvailable) {
          setState('notCaptured');
          setMessage(err.reason || 'No raw observations were captured for this date.');
        } else {
          setState('error');
          setMessage(err.message || 'Failed to load raw evidence.');
        }
      });
    return () => { cancelled = true; };
  }, [acqDate, runId]);

  if (state === 'loading') {
    return <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #8b949e)' }}>Loading raw FIRMS evidence…</div>;
  }
  if (state === 'notCaptured') {
    return (
      <div style={{ fontSize: '0.8rem', color: '#7a5c00' }}>
        ℹ️ Raw evidence not captured for this date — it predates the immutable raw archive. {message}
      </div>
    );
  }
  if (state === 'error') {
    return <div style={{ fontSize: '0.8rem', color: '#d64228' }}>Raw evidence unavailable: {message}</div>;
  }
  const previewCols = ['latitude', 'longitude', 'acq_date', 'acq_time', 'satellite', 'confidence', 'frp', 'daynight']
    .filter((c) => evidence.columns.includes(c));
  return (
    <div style={{ fontSize: '0.75rem' }}>
      <div style={{ color: 'var(--text-muted, #8b949e)', marginBottom: '6px' }}>
        Run <code>{evidence.runId}</code> · {evidence.total} raw rows from the satellite (first {evidence.rows.length} shown)
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontFamily: 'monospace', fontSize: '0.72rem', color: 'var(--text-primary, #eceff4)' }}>
          <thead>
            <tr>
              {previewCols.map((c) => (
                <th key={c} style={{ textAlign: 'left', padding: '2px 8px', borderBottom: '1px solid var(--hairline-border, #2e3440)' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {evidence.rows.map((row, i) => (
              <tr key={i}>
                {previewCols.map((c) => (
                  <td key={c} style={{ padding: '2px 8px' }}>{String(row[c] ?? '')}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Analyst action bar: acknowledge / confirm / dismiss with an optional note.
 * Append-only by contract — actions create events, they never edit history.
 * Reviewer identity persists in localStorage (default DEMO_ANALYST, visibly
 * tagged as demo review). Disabled in frontend mock mode (no backend exists
 * to persist to) and hidden entirely when no handler is provided (OFFLINE).
 */
function AlertActionBar({ hotspotId, onActionCompleted, disabled, disabledReason }) {
  const [note, setNote] = useState('');
  const [analystId, setAnalystId] = useState(loadAnalystId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isDemoAnalyst = !analystId || analystId === 'DEMO_ANALYST';

  const submit = async (action) => {
    setBusy(true);
    setError(null);
    saveAnalystId(analystId);
    try {
      const event = await submitAlertAction(hotspotId, { action, note: note.trim() || null, analystId });
      setNote('');
      onActionCompleted?.(event);
    } catch (err) {
      setError(err.detail || err.message || 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    backgroundColor: 'var(--bg-dark, #0a0e12)',
    color: 'var(--text-primary, #eceff4)',
    border: '1px solid var(--hairline-border, #2e3440)',
    borderRadius: '4px',
    padding: '4px 8px',
    fontSize: '0.78rem',
    fontFamily: 'monospace'
  };

  if (disabled) {
    return (
      <div title={disabledReason} style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8b949e)' }}>
        {disabledReason}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid var(--hairline-border, #2e3440)', paddingTop: '10px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          aria-label="Reviewer identity"
          value={analystId}
          onChange={(e) => setAnalystId(e.target.value)}
          placeholder="DEMO_ANALYST"
          style={{ ...inputStyle, width: '150px' }}
        />
        <input
          aria-label="Analyst note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional note (required for dismissals)"
          style={{ ...inputStyle, flex: 1, minWidth: '200px' }}
        />
        <button type="button" onClick={() => submit('acknowledged')} disabled={busy} style={{ ...smallButtonStyle, cursor: busy ? 'wait' : 'pointer' }}>Acknowledge</button>
        <button type="button" onClick={() => submit('confirmed')} disabled={busy} style={{ ...smallButtonStyle, cursor: busy ? 'wait' : 'pointer' }}>Confirm</button>
        <button
          type="button"
          onClick={() => submit('dismissed')}
          disabled={busy}
          title="Dismissals require a note (min 10 characters)"
          style={{ ...smallButtonStyle, cursor: busy ? 'wait' : 'pointer' }}
        >
          Dismiss
        </button>
      </div>
      {isDemoAnalyst && (
        <div style={{ fontSize: '0.7rem', color: '#a07d00' }}>
          DEMO review — actions are tagged analyst_id=DEMO_ANALYST and remain fully auditable.
        </div>
      )}
      {error && <div role="alert" style={{ fontSize: '0.75rem', color: '#d64228' }}>{error}</div>}
    </div>
  );
}

/**
 * One prediction row, shared by the current alerts feed and the archive page
 * so the markup is never duplicated. `mapDate` (when present) is appended to
 * the map deep link so the Fire Map opens the same acquisition date.
 *
 * Optional lifecycle props (wired by the pages): `alertState` (replayed
 * lifecycle state), `onActionCompleted(event)` enables the action bar,
 * `actionsDisabled`/`actionsDisabledReason` gate it (e.g. mock mode), and
 * `evidenceRunId` enables the raw-evidence panel for the date.
 */
/**
 * Mini horizontal bar chart for a single metric value (0–max_val range).
 */
function MetricBar({ label, value, unit = '', max, color = '#3d9de8', note = null }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
        <span style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--text-primary, #eceff4)', fontWeight: 700 }}>
          {typeof value === 'number' ? value.toFixed(value < 10 ? 2 : 1) : value}{unit}
        </span>
      </div>
      <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            borderRadius: '3px',
            background: color,
            transition: 'width 0.5s ease'
          }}
        />
      </div>
      {note && <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #55595E)' }}>{note}</span>}
    </div>
  );
}

export function AlertCard({ alert, index, mapDate = null, alertState = null, onActionCompleted = null, actionsDisabled = false, actionsDisabledReason = null, evidenceRunId = null }) {
  const [analysisExpanded, setAnalysisExpanded] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [history, setHistory] = useState(null);
  const [evidenceExpanded, setEvidenceExpanded] = useState(false);
  const [localState, setLocalState] = useState(null);
  const pClass = alert.predicted_class || 'unclassified';
  const color = CLASS_COLORS[pClass] || CLASS_COLORS.unclassified;
  const labelQuality = confidenceLabel(alert);
  const caveats = parseCaveatFlag(alert.caveat_flag);
  const canonicalCaveat = KNOWN_CAVEATS[pClass];
  const probabilities = Array.isArray(alert.probabilities) ? alert.probabilities : [];
  const cellKey = alert.cell_id || alert.h3_index || index;
  const h3Key = alert.h3_index || alert.cell_id;
  const hotspotId = h3Key && mapDate ? `${h3Key}_${mapDate}` : null;
  const effectiveState = localState || alertState;
  const confPct = alert.confidence != null ? Math.round(alert.confidence * 100) : null;

  // Context fields from live backend (may be present on real predictions)
  const ctx = alert.context || {};
  const frpMax = ctx.frp_max ?? alert.frp_max ?? null;
  const frpMean = ctx.frp_mean ?? alert.frp_mean ?? null;
  const nDetections = ctx.n_detections ?? ctx.n_detections_night ?? alert.n_detections ?? null;
  const latencyMs = alert.latency_ms ?? null;
  const hasContextData = frpMax != null || frpMean != null || nDetections != null;

  // Confidence gradient color
  const confColor = confPct == null
    ? '#787878'
    : confPct >= 80 ? '#2ecc71'
    : confPct >= 60 ? '#F1C40F'
    : '#e74c3c';

  const loadHistory = async () => {
    if (history || !hotspotId) return;
    try {
      const res = await fetchAlertHistory(hotspotId);
      setHistory(res.events);
    } catch {
      setHistory([]);
    }
  };

  const handleActionCompleted = (event) => {
    const nextState = event.action === 'reopened'
      ? 'new'
      : (event.action === 'note' ? (effectiveState?.state || 'new') : event.action);
    setLocalState({
      hotspot_id: event.hotspot_id,
      h3_08: event.h3_08,
      acq_date: event.acq_date,
      state: nextState,
      last_action: event.action,
      last_note: event.note,
      analyst_id: event.analyst_id,
      last_event_at: event.timestamp,
      last_event_id: event.event_id
    });
    setHistory(null);
    onActionCompleted?.(event);
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--panel-surface, #1e222a)',
        border: `1px solid ${alert.needs_review ? 'rgba(231, 76, 60, 0.35)' : 'var(--hairline-border, #2a303c)'}`,
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: alert.needs_review
          ? '0 2px 16px rgba(231, 76, 60, 0.1)'
          : '0 2px 10px rgba(0,0,0,0.25)',
        transition: 'box-shadow 0.2s ease'
      }}
    >
      {/* Left accent bar + main content */}
      <div style={{ display: 'flex' }}>
        {/* Color accent bar */}
        <div style={{ width: '4px', backgroundColor: color, flexShrink: 0 }} />

        <div style={{ flex: 1, padding: '1.1rem 1.4rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>

          {/* Row 1: Class label + badges + confidence meter */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  fontSize: '1rem',
                  color: color,
                  letterSpacing: '-0.01em'
                }}
              >
                {CLASS_LABELS[pClass] || pClass}
              </span>
              {alert.is_synthetic && (
                <span style={{ fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(241, 196, 15, 0.15)', color: '#a07d00', border: '1px solid rgba(241, 196, 15, 0.4)' }}>
                  SIMULATED
                </span>
              )}
              {hotspotId && <LifecycleBadge state={effectiveState?.state || 'new'} />}
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '10px',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  backgroundColor: labelQuality === 'High confidence'
                    ? 'rgba(46, 204, 113, 0.15)'
                    : (labelQuality === 'Needs review' ? 'rgba(231, 76, 60, 0.15)' : 'rgba(120, 120, 120, 0.15)'),
                  color: labelQuality === 'High confidence'
                    ? '#1e9e5a'
                    : (labelQuality === 'Needs review' ? '#d64228' : '#6e747b'),
                  border: `1px solid ${labelQuality === 'High confidence'
                    ? 'rgba(46, 204, 113, 0.4)'
                    : (labelQuality === 'Needs review' ? 'rgba(231, 76, 60, 0.4)' : 'rgba(120, 120, 120, 0.4)')}`
                }}
              >
                {alert.needs_review ? '⚠ Review' : labelQuality}
              </span>
            </div>

            {/* Confidence radial display */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {confPct != null && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: '1.25rem', fontWeight: 800, color: confColor, lineHeight: 1 }}>
                    {confPct}%
                  </span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted, #8b949e)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Confidence</span>
                  {/* Mini confidence bar */}
                  <div style={{ width: '52px', height: '4px', borderRadius: '2px', backgroundColor: 'rgba(255,255,255,0.07)' }}>
                    <div style={{ width: `${confPct}%`, height: '100%', borderRadius: '2px', backgroundColor: confColor, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              )}
              {alert.latitude != null && alert.longitude != null && (
                <Link
                  to={`/fire-map?lat=${alert.latitude}&lon=${alert.longitude}&h3=${alert.h3_index || alert.cell_id}${mapDate ? `&date=${mapDate}` : ''}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    color: 'var(--accent-blue, #3d9de8)', textDecoration: 'none',
                    fontSize: '0.75rem', fontWeight: 600,
                    padding: '5px 10px', borderRadius: '6px',
                    backgroundColor: 'rgba(61, 157, 232, 0.08)',
                    border: '1px solid rgba(61, 157, 232, 0.25)',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
                  </svg>
                  View on Map
                </Link>
              )}
            </div>
          </div>

          {/* Row 2: Metadata grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: '8px 20px',
              padding: '10px 12px',
              backgroundColor: 'rgba(0,0,0,0.2)',
              borderRadius: '6px',
              fontSize: '0.78rem'
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Latitude</span>
              <span style={{ color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace', fontWeight: 600 }}>
                {alert.latitude != null ? `${alert.latitude.toFixed(4)}°` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Longitude</span>
              <span style={{ color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace', fontWeight: 600 }}>
                {alert.longitude != null ? `${alert.longitude.toFixed(4)}°` : '—'}
              </span>
            </div>
            {mapDate && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Acquired</span>
                <span style={{ color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace', fontWeight: 600 }}>{mapDate}</span>
              </div>
            )}
            {alert.calibrated !== undefined && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Calibrated</span>
                <span style={{ color: alert.calibrated ? '#2ecc71' : 'var(--text-muted, #8b949e)', fontWeight: 700 }}>
                  {alert.calibrated ? '✓ Yes' : 'No'}
                </span>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>H3 Cell</span>
              <span style={{ color: 'var(--text-muted, #8b949e)', fontFamily: 'monospace', fontSize: '0.7rem', wordBreak: 'break-all' }}>{cellKey}</span>
            </div>
            {latencyMs != null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Inference</span>
                <span style={{ color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace', fontWeight: 600 }}>{latencyMs.toFixed(1)} ms</span>
              </div>
            )}
          </div>

          {/* Row 3: Caveats */}
          {(caveats.length > 0 || (canonicalCaveat && !caveats.includes(canonicalCaveat))) && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '5px',
                padding: '8px 12px',
                backgroundColor: 'rgba(241, 196, 15, 0.06)',
                border: '1px solid rgba(241, 196, 15, 0.2)',
                borderRadius: '6px'
              }}
            >
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#a06a00', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ⚠ Model Caveats
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {[...caveats, ...(canonicalCaveat && !caveats.includes(canonicalCaveat) ? [canonicalCaveat] : [])].map((c, i) => (
                  <span key={i} style={{ fontSize: '0.75rem', color: '#8c6e00', lineHeight: 1.5 }}>
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Row 4: Feature Analysis — class probabilities + optional context metrics */}
          {probabilities.length > 0 && (
            <div style={{ borderTop: '1px solid var(--hairline-border, #2a303c)', paddingTop: '8px' }}>
              <button
                type="button"
                aria-expanded={analysisExpanded}
                onClick={() => setAnalysisExpanded((v) => !v)}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--text-muted, #8b949e)',
                  fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: 0, textTransform: 'uppercase', letterSpacing: '0.05em'
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {analysisExpanded
                    ? <><polyline points="18 15 12 9 6 15" /></>
                    : <><polyline points="6 9 12 15 18 9" /></>}
                </svg>
                {analysisExpanded ? 'Hide' : 'Show'} Feature Analysis ({probabilities.length} classes{hasContextData ? ' · sensor metrics' : ''})
              </button>

              {analysisExpanded && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

                  {/* Class Probability Distribution */}
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                      Classification Distribution
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {probabilities.map((item, pIdx) => {
                        const pItemClass = item.class_name;
                        const pColor = CLASS_COLORS[pItemClass] || '#787878';
                        const pPct = (item.probability * 100).toFixed(1);
                        const isTop = item.class_name === (probabilities[0]?.class_name);
                        return (
                          <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: '3px', height: '32px', borderRadius: '2px', backgroundColor: isTop ? pColor : 'transparent', flexShrink: 0 }} />
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                <span style={{ fontSize: '0.73rem', color: isTop ? 'var(--text-primary, #eceff4)' : 'var(--text-muted, #8b949e)', fontWeight: isTop ? 700 : 500 }}>
                                  {CLASS_LABELS[pItemClass] || pItemClass}
                                  {isTop && <span style={{ marginLeft: '6px', fontSize: '0.62rem', color: pColor, fontWeight: 700 }}>▲ TOP</span>}
                                </span>
                                <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: isTop ? pColor : 'var(--text-muted, #8b949e)', fontWeight: 700 }}>
                                  {pPct}%
                                </span>
                              </div>
                              <div style={{ height: '7px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
                                <div
                                  style={{
                                    width: `${pPct}%`,
                                    height: '100%',
                                    borderRadius: '4px',
                                    background: isTop
                                      ? `linear-gradient(90deg, ${pColor}cc, ${pColor})`
                                      : `${pColor}66`,
                                    transition: 'width 0.6s ease'
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sensor / Context Metrics — only when real data is present */}
                  {hasContextData && (
                    <div
                      style={{
                        borderTop: '1px solid var(--hairline-border, #2a303c)',
                        paddingTop: '12px'
                      }}
                    >
                      <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                        Sensor Metrics (VIIRS / FIRMS)
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
                        {frpMax != null && (
                          <MetricBar label="FRP Max" value={frpMax} unit=" MW" max={500} color="#E67E22" note="Peak Fire Radiative Power" />
                        )}
                        {frpMean != null && (
                          <MetricBar label="FRP Mean" value={frpMean} unit=" MW" max={500} color="#E67E22" note="Average Fire Radiative Power" />
                        )}
                        {nDetections != null && (
                          <MetricBar label="Detections" value={nDetections} unit="" max={Math.max(20, nDetections)} color="#3d9de8" note="Night-time thermal detections" />
                        )}
                        {latencyMs != null && (
                          <MetricBar label="Inference" value={latencyMs} unit=" ms" max={100} color="#2ecc71" note="Model inference latency" />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Confidence deep-dive */}
                  <div style={{ borderTop: '1px solid var(--hairline-border, #2a303c)', paddingTop: '12px' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                      Confidence Analysis
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px' }}>
                      <MetricBar
                        label="Model Confidence"
                        value={alert.confidence != null ? alert.confidence * 100 : 0}
                        unit="%"
                        max={100}
                        color={confColor}
                        note={`${labelQuality} · ${alert.calibrated ? 'Calibrated' : 'Uncalibrated'}`}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Review Flag</span>
                        <span
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            fontSize: '0.78rem', fontWeight: 700,
                            color: alert.needs_review ? '#d64228' : '#1e9e5a'
                          }}
                        >
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: alert.needs_review ? '#e74c3c' : '#2ecc71' }} />
                          {alert.needs_review ? 'Needs Analyst Review' : 'Passes Threshold'}
                        </span>
                        <span style={{ fontSize: '0.68rem', color: 'var(--text-muted, #55595E)' }}>
                          {pClass === 'agricultural_burn' ? 'Threshold: 1.01 (always flagged)'
                            : pClass === 'mining' ? 'Threshold: 0.85'
                            : 'Threshold: 0.70'}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}

          {/* Row 5: Lifecycle controls */}
          {hotspotId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--hairline-border, #2a303c)', paddingTop: '8px' }}>
              {effectiveState?.last_action && (
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700 }}>Last review:</span>
                  <span>{effectiveState.last_action}</span>
                  <span>by <code style={{ color: 'var(--text-primary, #eceff4)' }}>{effectiveState.analyst_id || 'unknown'}</code></span>
                  {effectiveState.last_event_at && <span style={{ color: 'var(--text-muted, #55595E)' }}>at {effectiveState.last_event_at}</span>}
                  {effectiveState.last_note && <span>— "{effectiveState.last_note}"</span>}
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  aria-expanded={historyExpanded}
                  onClick={() => { setHistoryExpanded((v) => !v); if (!historyExpanded) loadHistory(); }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue, #3d9de8)', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                >
                  {historyExpanded ? '▲ Hide review history' : '▼ Review history'}
                </button>
                {mapDate && (
                  <button
                    type="button"
                    aria-expanded={evidenceExpanded}
                    onClick={() => setEvidenceExpanded((v) => !v)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue, #3d9de8)', fontSize: '0.73rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                  >
                    {evidenceExpanded ? '▲ Hide raw FIRMS evidence' : '▼ View raw FIRMS evidence'}
                  </button>
                )}
              </div>

              {historyExpanded && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', padding: '8px 12px', backgroundColor: 'rgba(0,0,0,0.15)', borderRadius: '6px' }}>
                  {history === null && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>Loading history…</div>}
                  {Array.isArray(history) && history.length === 0 && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>
                      No review events yet. Actions are appended here and never overwritten.
                    </div>
                  )}
                  {Array.isArray(history) && history.map((ev) => (
                    <div key={ev.event_id} style={{ fontSize: '0.73rem', color: 'var(--text-primary, #eceff4)', padding: '3px 0', borderBottom: '1px solid var(--hairline-border, #2a303c)' }}>
                      <code style={{ color: 'var(--text-muted, #8b949e)', fontSize: '0.7rem' }}>{ev.timestamp}</code>
                      {' · '}<span style={{ fontWeight: 700 }}>{ev.action}</span>
                      {' by '}<code>{ev.analyst_id}</code>
                      {ev.note ? ` — "${ev.note}"` : ''}
                    </div>
                  ))}
                </div>
              )}

              {evidenceExpanded && mapDate && (
                <RawEvidencePanel acqDate={mapDate} runId={evidenceRunId} />
              )}

              {onActionCompleted && (
                <AlertActionBar
                  hotspotId={hotspotId}
                  onActionCompleted={handleActionCompleted}
                  disabled={actionsDisabled}
                  disabledReason={actionsDisabledReason}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const pillButtonStyle = (selected) => ({
  background: selected ? 'rgba(61, 157, 232, 0.2)' : 'rgba(255, 255, 255, 0.03)',
  color: selected ? '#ffffff' : 'var(--text-muted, #94a3b8)',
  border: selected ? '1px solid rgba(61, 157, 232, 0.6)' : '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '20px',
  padding: '3px 11px',
  fontSize: '0.73rem',
  fontFamily: 'var(--font-heading)',
  fontWeight: selected ? 700 : 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px'
});

const smallButtonStyle = {
  padding: '5px 12px',
  backgroundColor: 'var(--control-subtle)',
  color: 'var(--text-primary, #ffffff)',
  border: '1px solid var(--hairline-border, #2e3440)',
  borderRadius: '4px',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer'
};

export default function FireAlertsPage() {
  const [acqDate, setAcqDate] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [newestDate, setNewestDate] = useState(null);
  const [backendDataMode, setBackendDataMode] = useState(null);
  const [perDateIngestionStatus, setPerDateIngestionStatus] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('');
  const [healthIngestion, setHealthIngestion] = useState(null);
  const [datesError, setDatesError] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [alertStates, setAlertStates] = useState(null); // {statesByHotspot, counts} | null
  const [statesError, setStatesError] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedClass = searchParams.get('class') || 'all';

  const [stateFilter, setStateFilter] = useState('all'); // all|new|needs_review|acknowledged|confirmed|dismissed
  const [dateRunId, setDateRunId] = useState(null); // decisive ingestion run for the selected date
  const [truncatedTotal, setTruncatedTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorKind, setErrorKind] = useState('error'); // 'error' | 'dateUnavailable'
  const [sortBy, setSortBy] = useState('review'); // 'review' | 'conf_desc' | 'conf_asc'
  const [currentPage, setCurrentPage] = useState(1);
  const [apiMode, setApiModeState] = useState(() => getApiMode());

  useEffect(() => onApiModeChange((mode) => setApiModeState(mode)), []);

  // ── Load predictions for the selected date ────────────────────────────────
  const loadAlertsRef = useRef(null);
  const datesDataModeRef = useRef(null);
  const loadStates = useCallback(async (date) => {
    // Lifecycle states are complementary evidence, not the alert feed itself:
    // a states failure must not blank the list, but it is surfaced, never silent.
    try {
      const res = await fetchAlertStates(date);
      setAlertStates({ statesByHotspot: res.statesByHotspot, counts: res.counts });
      setStatesError(null);
    } catch (err) {
      setAlertStates(null);
      setStatesError(err.notAvailable ? null : (err.message || 'Lifecycle states unavailable'));
    }
  }, []);
  const loadAlerts = useCallback(async (dateArg) => {
    const date = dateArg || acqDate;
    if (!date) return;
    setLoading(true);
    setError(null);
    setErrorKind('error');
    loadStates(date);
    try {
      const newest = newestDate;
      if (newest && date < newest) {
        // Historical day: read it from the archive store (never re-fetched
        // live from FIRMS), which also reports data_mode + ingestion_status.
        const res = await fetchArchivePredictions({ acqDate: date, limit: 1000 });
        setAlerts(res.predictions);
        setBackendDataMode(res.dataMode);
        setPerDateIngestionStatus(res.ingestionStatus);
        setDateRunId(res.ingestionRunId);
        setTruncatedTotal(res.total > res.predictions.length ? res.total : null);
      } else {
        const data = await fetchPredictionsStrict(INDIA_BOUNDS, date, 5);
        const arr = Array.isArray(data) ? data : (data?.predictions ?? []);
        setAlerts(arr);
        // Newest day goes through the live feed again: restore the mode the
        // dates endpoint reported, so a previously viewed archive day's
        // 'historical' does not bleed into the newest day's status.
        setBackendDataMode(datesDataModeRef.current);
        setPerDateIngestionStatus(null);
        setDateRunId(null); // evidence panel falls back to the decisive run
        setTruncatedTotal(null);
      }
    } catch (err) {
      console.error('[FireAlertsPage] Failed to fetch alerts:', err);
      setErrorKind(err.notAvailable ? 'dateUnavailable' : 'error');
      setError(err.notAvailable
        ? `The archive has no data for ${err.acqDate || date}.`
        : (err.message || 'Failed to retrieve thermal alert predictions'));
    } finally {
      setLoading(false);
    }
  }, [acqDate, newestDate, loadStates]);
  useEffect(() => { loadAlertsRef.current = loadAlerts; }, [loadAlerts]);

  // ── Bootstrap: discover available dates + health provenance, then load ────
  const bootstrap = useCallback(async () => {
    setLoading(true);
    setError(null);
    setErrorKind('error');
    try {
      if (getApiMode() === 'mock') {
        // Demo mode explicitly active: load simulated rows, labeled DEMO.
        setNewestDate(null);
        setAvailableDates([]);
        const today = new Date().toLocaleDateString('en-CA');
        setAcqDate(today);
        setLoading(false);
        await loadAlertsRef.current(today);
        return;
      }
      const [datesRes, healthRes] = await Promise.allSettled([fetchArchiveDates(), fetchHealth()]);
      const health = healthRes.status === 'fulfilled' ? healthRes.value : null;
      setHealthIngestion(health?.ingestion ?? null);

      let dates = [];
      let newest = null;
      let mode = null;
      if (datesRes.status === 'fulfilled') {
        dates = datesRes.value.availableDates;
        newest = datesRes.value.newestDate;
        mode = datesRes.value.dataMode;
        setSourceLabel(datesRes.value.source);
      } else {
        setDatesError(datesRes.reason?.message || 'Archive dates endpoint unreachable');
        // Fallback: single date from /health, when it is reachable.
        newest = health?.latest_acq_date ?? null;
        if (newest) dates = [newest];
        setSourceLabel(health ? 'backend /health (archive dates endpoint unavailable)' : '');
      }
      setAvailableDates(dates);
      setNewestDate(newest);
      datesDataModeRef.current = mode;
      setBackendDataMode(mode);

      if (!newest) {
        setAcqDate(null);
        setErrorKind('error');
        setError('Backend is unreachable: no available acquisition dates and no health fallback. Start the backend and retry.');
        setAlerts([]);
        setLoading(false);
        return;
      }
      setAcqDate(newest);
      setCurrentPage(1);
      setLoading(false);
      await loadAlertsRef.current(newest);
    } catch (err) {
      console.error('[FireAlertsPage] Bootstrap failed:', err);
      setErrorKind('error');
      setError(err.message || 'Failed to reach the backend');
      setLoading(false);
    }
  }, []);

  // Single mount trigger — replaces the earlier double-request race.
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { bootstrap(); }, [bootstrap]);

  // ── Date navigation (backend-reported dates only) ─────────────────────────
  const datesDesc = useMemo(() => availableDates.slice().reverse(), [availableDates]);
  const dateIndex = availableDates.indexOf(acqDate);

  const handleDateChange = (nextDate) => {
    if (!nextDate || nextDate === acqDate || !availableDates.includes(nextDate)) return;
    setAcqDate(nextDate);
    setCurrentPage(1);
    loadAlertsRef.current(nextDate);
  };
  const handlePrevDate = () => { // older
    if (dateIndex > 0) handleDateChange(availableDates[dateIndex - 1]);
  };
  const handleNextDate = () => { // newer
    if (dateIndex >= 0 && dateIndex < availableDates.length - 1) handleDateChange(availableDates[dateIndex + 1]);
  };

  // ── Operational status (never inferred from row presence alone) ───────────
  const isHistorical = Boolean(newestDate && acqDate && acqDate < newestDate);
  const status = deriveAlertsStatus({
    apiMode,
    hasError: Boolean(error),
    isHistorical,
    backendDataMode: apiMode === 'mock' ? 'demo' : backendDataMode
  });

  // ── Ingestion freshness warnings ──────────────────────────────────────────
  const freshness = useMemo(() => assessIngestionFreshness({
    ingestion: healthIngestion,
    latestAcqDate: newestDate
  }), [healthIngestion, newestDate]);
  const perDateWarning = ingestionStatusWarning(perDateIngestionStatus);
  const allWarnings = [
    ...freshness.warnings,
    ...(perDateWarning ? [perDateWarning] : [])
  ];

  // ── Dynamic available classes (empirical presence in batch + active query) ─
  const availableClasses = useMemo(() => getAvailableClasses(alerts), [alerts]);

  const displayedClasses = useMemo(() => {
    const order = ['industrial', 'mining', 'agricultural_burn', 'wildfire', 'unclassified'];
    const present = new Set(availableClasses);
    if (selectedClass && selectedClass !== 'all') {
      present.add(selectedClass);
    }
    return order.filter(cls => present.has(cls));
  }, [availableClasses, selectedClass]);

  const effectiveSelectedClass = selectedClass;

  const handleSelectClass = (cls) => {
    setSelectedClass(cls);
    setCurrentPage(1);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (cls === 'all') {
        next.delete('class');
      } else {
        next.set('class', cls);
      }
      return next;
    }, { replace: true });
  };

  const handleSortChange = (sortVal) => {
    setSortBy(sortVal);
    setCurrentPage(1);
  };

  // ── Filtered and sorted alerts ─────────────────────────────────────────────
  const lifecycleStateFor = useCallback((alert) => {
    const h3Key = alert.h3_index || alert.cell_id;
    const hotspotId = h3Key && acqDate ? `${h3Key}_${acqDate}` : null;
    return alertStates?.statesByHotspot?.[hotspotId]?.state || 'new';
  }, [alertStates, acqDate]);

  const filteredAlerts = useMemo(() => {
    let list = effectiveSelectedClass === 'all'
      ? alerts
      : alerts.filter(a => a.predicted_class === effectiveSelectedClass);

    if (stateFilter === 'needs_review') {
      list = list.filter(a => a.needs_review);
    } else if (stateFilter !== 'all') {
      list = list.filter(a => lifecycleStateFor(a) === stateFilter);
    }

    return list.slice().sort((a, b) => {
      if (sortBy === 'review') {
        const aRev = a.needs_review ? 1 : 0;
        const bRev = b.needs_review ? 1 : 0;
        if (aRev !== bRev) return bRev - aRev;
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      }
      if (sortBy === 'conf_desc') {
        return (b.confidence ?? 0) - (a.confidence ?? 0);
      }
      if (sortBy === 'conf_asc') {
        return (a.confidence ?? 0) - (b.confidence ?? 0);
      }
      return 0;
    });
  }, [alerts, effectiveSelectedClass, sortBy, stateFilter, lifecycleStateFor]);

  // Lifecycle counts over the full (class-filtered) day, not the pagination.
  const lifecycleCounts = useMemo(() => {
    const base = effectiveSelectedClass === 'all'
      ? alerts
      : alerts.filter(a => a.predicted_class === effectiveSelectedClass);
    const counts = { new: 0, acknowledged: 0, confirmed: 0, dismissed: 0 };
    for (const a of base) counts[lifecycleStateFor(a)] += 1;
    return counts;
  }, [alerts, effectiveSelectedClass, lifecycleStateFor]);
  const reviewedCount = lifecycleCounts.acknowledged + lifecycleCounts.confirmed + lifecycleCounts.dismissed;

  const handleActionCompleted = useCallback(() => {
    // Append-only store: refresh the replay-derived view for this date.
    if (acqDate) loadStates(acqDate);
  }, [acqDate, loadStates]);

  // ── Pagination slice ───────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE));
  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAlerts.slice(start, start + PAGE_SIZE);
  }, [filteredAlerts, currentPage]);

  // ── CSV Export (carries the selected date + data mode) ────────────────────
  const handleExportCsv = () => {
    if (filteredAlerts.length === 0) return;
    try {
      const rowsWithLifecycle = filteredAlerts.map((a) => ({
        ...a,
        alert_state: lifecycleStateFor(a),
        analyst_note: alertStates?.statesByHotspot?.[`${a.h3_index || a.cell_id}_${acqDate}`]?.last_note ?? ''
      }));
      exportPredictionsToCsv(
        rowsWithLifecycle,
        `trinetra_alerts_${acqDate || 'unknown-date'}.csv`,
        { acqDate: acqDate || undefined, dataMode: status.toLowerCase() }
      );
    } catch (err) {
      console.error('[FireAlertsPage] CSV export failed:', err);
    }
  };

  const dateLabel = acqDate || 'discovering...';
  const ingestionDetail = healthIngestion?.available
    ? `Last successful ingestion: ${healthIngestion.target_date || 'unknown date'} · ${healthIngestion.fetch_mode || 'unknown source'} · finished ${healthIngestion.finished_at || 'unknown time'}`
    : null;

  return (
    <div style={{ backgroundColor: 'var(--bg-dark, #0a0e12)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OfflineBanner />
      <Header />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem 1.5rem 2rem', width: '100%', textAlign: 'left' }}>

        {/* ═══ PAGE HEADER ═══ */}
        <div style={{ marginBottom: '1.25rem', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {/* Top Bar: Eyebrow + Status + Ingestion metadata pill + Actions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.68rem',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: 'var(--accent-blue, #3d9de8)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: '#3d9de8', boxShadow: '0 0 8px #3d9de8' }} />
                Satellite Thermal Hotspot Feed
              </span>
              <StatusBadge status={status} />
              {(sourceLabel || ingestionDetail) && (
                <span
                  title={ingestionDetail || sourceLabel}
                  style={{
                    fontSize: '0.68rem',
                    color: 'var(--text-muted, #718096)',
                    fontFamily: 'monospace',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    maxWidth: '340px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    cursor: 'help'
                  }}
                >
                  {sourceLabel ? `📦 ${sourceLabel.replace(/^duckdb:/, '')}` : '📦 Stored Features'}
                </span>
              )}
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Link
                to="/archive"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600,
                  color: 'var(--text-primary, #eceff4)', textDecoration: 'none',
                  border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" />
                </svg>
                Historical Archive
              </Link>
              <button
                type="button" onClick={bootstrap} disabled={loading}
                title="Refresh alerts from backend"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px', fontSize: '0.78rem', fontWeight: 600,
                  color: 'var(--text-primary, #eceff4)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: '6px',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
              <button
                type="button" onClick={handleExportCsv}
                disabled={filteredAlerts.length === 0}
                title="Export current alerts as CSV"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '6px 14px', fontSize: '0.78rem', fontWeight: 700,
                  color: '#fff', border: 'none', borderRadius: '6px',
                  backgroundColor: filteredAlerts.length > 0 ? 'var(--accent-blue, #3d9de8)' : 'rgba(61,157,232,0.2)',
                  cursor: filteredAlerts.length > 0 ? 'pointer' : 'not-allowed',
                  boxShadow: filteredAlerts.length > 0 ? '0 2px 8px rgba(61,157,232,0.35)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Export CSV
              </button>
            </div>
          </div>

          {/* Title & Subtitle */}
          <div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary, #eceff4)', margin: '0 0 4px 0', letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              Infrastructure Fire Alerts
            </h1>
            <p style={{ color: 'var(--text-muted, #94a3b8)', fontSize: '0.82rem', margin: 0, lineHeight: 1.45 }}>
              TRINETRA inference engine predictions fused from NASA VIIRS & MODIS passes across India. Calibrated model classifications with physical feature attribution.
            </p>
          </div>
        </div>

        {/* ═══ DATA QUALITY WARNING ═══ */}
        {!loading && allWarnings.length > 0 && (
          <div
            role="alert"
            style={{
              marginBottom: '1rem',
              padding: '8px 14px',
              backgroundColor: 'rgba(241, 196, 15, 0.08)',
              border: '1px solid rgba(241, 196, 15, 0.3)',
              borderLeft: '4px solid #f1c40f',
              borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap'
            }}
          >
            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#f1c40f', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              ⚠ Quality Notice:
            </span>
            {allWarnings.map((w, i) => (
              <span key={i} style={{ fontSize: '0.78rem', color: '#e2d59a', lineHeight: 1.4 }}>{w}</span>
            ))}
          </div>
        )}

        {/* ═══ STATS BAR (Executive KPI cards) ═══ */}
        {!loading && !error && alerts.length > 0 && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '10px',
              marginBottom: '1.15rem'
            }}
          >
            {[
              { label: 'Total Detections', value: alerts.length, color: '#3d9de8', icon: '📡' },
              { label: 'Needs Review', value: alerts.filter(a => a.needs_review).length, color: '#e74c3c', icon: '⚠️' },
              { label: 'High Confidence', value: alerts.filter(a => a.confidence >= 0.8).length, color: '#2ecc71', icon: '🎯' },
              { label: 'Unreviewed', value: lifecycleCounts.new, color: '#94a3b8', icon: '📥' },
              { label: 'Reviewed', value: reviewedCount, color: '#F1C40F', icon: '✅' }
            ].map(({ label, value, color: c, icon }) => (
              <div
                key={label}
                style={{
                  padding: '12px 14px',
                  backgroundColor: 'rgba(26, 32, 44, 0.75)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  borderTop: `2px solid ${c}`,
                  borderRadius: '8px',
                  display: 'flex', flexDirection: 'column', gap: '3px',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.2)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.64rem', color: 'var(--text-muted, #8b949e)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>{label}</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>{icon}</span>
                </div>
                <span style={{ fontFamily: 'monospace', fontSize: '1.5rem', fontWeight: 800, color: c, lineHeight: 1.1 }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ═══ UNIFIED CONTROL PANEL: Date nav + Class filter + State filter ═══ */}
        <div
          style={{
            marginBottom: '1.25rem',
            borderRadius: '10px',
            overflow: 'hidden',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            backgroundColor: 'rgba(20, 24, 32, 0.85)',
            boxShadow: '0 4px 16px rgba(0, 0, 0, 0.25)'
          }}
        >
          {/* ── Date Navigation & Sort Header ── */}
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '12px', flexWrap: 'wrap',
              padding: '10px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.07)'
            }}
          >
            {/* Left: Date Stepper with aligned 64px label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ width: '64px', fontSize: '0.66rem', color: 'var(--text-muted, #718096)', fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                DATE
              </span>
              <div style={{ display: 'inline-flex', alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.3)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.09)', padding: '2px' }}>
                <button
                  type="button" onClick={handlePrevDate}
                  disabled={loading || dateIndex <= 0}
                  aria-label="Previous observation date (older)"
                  title="Previous observation date"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--text-primary, #eceff4)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: loading || dateIndex <= 0 ? 'not-allowed' : 'pointer',
                    opacity: loading || dateIndex <= 0 ? 0.35 : 0.85
                  }}
                >
                  ‹ Older
                </button>
                <label htmlFor="acq-date-select" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
                  Select observation date
                </label>
                <select
                  id="acq-date-select"
                  value={acqDate || ''}
                  onChange={(e) => handleDateChange(e.target.value)}
                  disabled={datesDesc.length === 0 || loading}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    color: '#3d9de8',
                    border: '1px solid rgba(61, 157, 232, 0.25)',
                    borderRadius: '4px',
                    padding: '3px 8px',
                    fontSize: '0.76rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    cursor: datesDesc.length === 0 ? 'not-allowed' : 'pointer',
                    outline: 'none'
                  }}
                >
                  {datesDesc.length === 0 && <option value="">no dates available</option>}
                  {datesDesc.map((d) => (
                    <option key={d} value={d} style={{ backgroundColor: '#141820', color: '#eceff4' }}>
                      {d}{d === newestDate ? ' (latest)' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button" onClick={handleNextDate}
                  disabled={loading || dateIndex < 0 || dateIndex >= availableDates.length - 1}
                  aria-label="Next observation date (newer)"
                  title="Next observation date"
                  style={{
                    backgroundColor: 'transparent',
                    color: 'var(--text-primary, #eceff4)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: loading || dateIndex < 0 || dateIndex >= availableDates.length - 1 ? 'not-allowed' : 'pointer',
                    opacity: loading || dateIndex < 0 || dateIndex >= availableDates.length - 1 ? 0.35 : 0.85
                  }}
                >
                  Newer ›
                </button>
              </div>
              {datesError && (
                <span style={{ fontSize: '0.7rem', color: '#e74c3c' }}>({datesError})</span>
              )}
            </div>

            {/* Right: Sort Dropdown & Reviewed Status Summary */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <label htmlFor="alert-sort" style={{ fontSize: '0.66rem', color: 'var(--text-muted, #718096)', fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  SORT
                </label>
                <select
                  id="alert-sort"
                  value={sortBy}
                  onChange={(e) => handleSortChange(e.target.value)}
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.35)',
                    color: 'var(--text-primary, #eceff4)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '5px',
                    padding: '4px 10px', fontSize: '0.74rem',
                    fontFamily: 'var(--font-heading)', fontWeight: 600, cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  <option value="review" style={{ backgroundColor: '#141820' }}>⚠️ Unidentified First</option>
                  <option value="conf_desc" style={{ backgroundColor: '#141820' }}>Highest Confidence</option>
                  <option value="conf_asc" style={{ backgroundColor: '#141820' }}>Lowest Confidence</option>
                </select>
              </div>

              <div style={{
                fontSize: '0.7rem',
                color: 'var(--text-muted, #8b949e)',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '3px 8px',
                borderRadius: '5px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
              }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: reviewedCount > 0 ? '#2ecc71' : '#f1c40f' }} />
                <span>{reviewedCount} of {alerts.length} reviewed</span>
              </div>
            </div>
          </div>

          {/* ── Filter Rows (Both strictly aligned to label width 64px!) ── */}
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {/* Class Filter Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ width: '64px', fontSize: '0.66rem', color: 'var(--text-muted, #718096)', fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                CLASS
              </span>
              <button
                type="button"
                onClick={() => handleSelectClass('all')}
                aria-pressed={effectiveSelectedClass === 'all'}
                style={pillButtonStyle(effectiveSelectedClass === 'all')}
              >
                All ({alerts.length})
              </button>
              {displayedClasses.map(cls => {
                const count = alerts.filter(a => a.predicted_class === cls).length;
                const clsColor = CLASS_COLORS[cls] || '#787878';
                const label = CLASS_LABELS[cls] || cls;
                const isSelected = effectiveSelectedClass === cls;
                return (
                  <button
                    key={cls} type="button"
                    onClick={() => handleSelectClass(cls)}
                    aria-pressed={isSelected}
                    style={{
                      background: isSelected ? clsColor : 'rgba(255, 255, 255, 0.03)',
                      color: isSelected ? '#0A0E12' : 'var(--text-primary, #eceff4)',
                      border: `1px solid ${isSelected ? clsColor : 'rgba(255, 255, 255, 0.09)'}`,
                      borderRadius: '20px', padding: '3px 11px',
                      fontSize: '0.73rem', fontFamily: 'var(--font-heading)', fontWeight: isSelected ? 700 : 600,
                      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '6px',
                      boxShadow: isSelected ? `0 2px 8px ${clsColor}55` : 'none',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: isSelected ? '#0A0E12' : clsColor }} />
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            {/* State Filter Row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style={{ width: '64px', fontSize: '0.66rem', color: 'var(--text-muted, #718096)', fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', flexShrink: 0 }}>
                STATE
              </span>
              {[
                ['all', `All (${alerts.length})`],
                ['needs_review', `⚠️ Unidentified (${alerts.filter(a => a.needs_review).length})`]
              ].map(([value, label]) => (
                <button
                  key={value} type="button"
                  aria-pressed={stateFilter === value}
                  onClick={() => { setStateFilter(value); setCurrentPage(1); }}
                  style={pillButtonStyle(stateFilter === value)}
                >
                  {label}
                </button>
              ))}
              {statesError && (
                <span role="alert" style={{ fontSize: '0.68rem', color: '#e74c3c', marginLeft: 'auto' }}>
                  ({statesError})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-muted, #55595E)' }} role="status">
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #eceff4)', marginBottom: '8px' }}>
              Loading thermal anomaly detections for {dateLabel}...
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              Querying stored NASA VIIRS / MODIS passes across India coordinates.
            </div>
          </div>
        )}

        {/* Error State (backend unreachable / request failed) */}
        {!loading && error && errorKind === 'error' && (
          <div
            role="alert"
            style={{
              padding: '2rem',
              backgroundColor: 'rgba(231, 76, 60, 0.12)',
              border: '1px solid rgba(231, 76, 60, 0.4)',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#d64228'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '6px' }}>
              Unable to load thermal alerts — feed is OFFLINE
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-primary, #eceff4)' }}>
              {error}
            </div>
            <div style={{ fontSize: '0.8rem', marginBottom: '1rem', color: 'var(--text-muted, #55595E)' }}>
              Simulated demo data is deliberately NOT substituted for failed live requests.
            </div>
            <button
              type="button"
              onClick={bootstrap}
              style={{
                padding: '8px 18px',
                backgroundColor: '#e74c3c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer'
              }}
            >
              Retry Load
            </button>
          </div>
        )}

        {/* Date-unavailable State (distinct from zero detections) */}
        {!loading && error && errorKind === 'dateUnavailable' && (
          <div
            role="alert"
            style={{
              padding: '3rem 2rem',
              backgroundColor: 'rgba(61, 157, 232, 0.1)',
              border: '1px solid rgba(61, 157, 232, 0.35)',
              borderRadius: '8px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '6px', color: 'var(--text-primary, #eceff4)' }}>
              Data unavailable for this date
            </div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-muted, #55595E)' }}>
              The backend has no archived predictions for {acqDate}.
              {newestDate ? ` Available range: ${availableDates[0] || newestDate} → ${newestDate}.` : ''}
            </div>
          </div>
        )}

        {/* Zero-detections State (valid stored date, genuinely empty) */}
        {!loading && !error && alerts.length === 0 && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '5rem 2rem',
              textAlign: 'center',
              backgroundColor: 'var(--panel-surface, #1e222a)',
              border: '1px solid var(--hairline-border, #2e3440)',
              borderRadius: '8px'
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary, #eceff4)', marginBottom: '8px' }}>
              No detections for this date ({acqDate})
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted, #55595E)', fontSize: '0.9rem', maxWidth: '580px', marginInline: 'auto', lineHeight: 1.5 }}>
              The backend has stored data for {acqDate} but registered zero high-temperature surface anomalies.
              This is not evidence that "no fires occurred" — it means the stored passes for this date contained no detections
              (or ingestion for this date is incomplete). States/UTs with no satellite detections remain
              empty rather than being represented by synthetic alerts.
            </p>
          </div>
        )}

        {!loading && !error && alerts.length > 0 && filteredAlerts.length === 0 && (
          <div
            role="status"
            aria-live="polite"
            style={{
              padding: '4rem 2rem',
              textAlign: 'center',
              backgroundColor: 'var(--panel-surface, #1e222a)',
              border: '1px solid var(--hairline-border, #2e3440)',
              borderRadius: '8px',
              color: 'var(--text-muted, #55595E)'
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #eceff4)', marginBottom: '6px' }}>
              No thermal alerts match the selected classification filter "{CLASS_LABELS[selectedClass] || selectedClass}".
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>
              Try selecting "All Alerts" to view the {alerts.length} detections recorded on {acqDate}.
            </p>
          </div>
        )}

        {/* Truncation notice for large historical days */}
        {!loading && !error && truncatedTotal != null && truncatedTotal > alerts.length && (
          <div style={{ marginTop: '1rem', padding: '10px 14px', backgroundColor: 'var(--control-subtle)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-primary, #eceff4)' }}>
            Showing the first {alerts.length} of {truncatedTotal} archived predictions for {acqDate}. Use the <Link to="/archive" style={{ color: 'var(--accent-blue, #3d9de8)' }}>Historical Archive</Link> for filterable browsing.
          </div>
        )}

        {/* Alerts List */}
        {!loading && !error && paginatedAlerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {paginatedAlerts.map((alert, idx) => (
              <AlertCard
                key={alert.cell_id || alert.h3_index || idx}
                alert={alert}
                index={idx}
                mapDate={acqDate}
                alertState={alertStates?.statesByHotspot?.[`${alert.h3_index || alert.cell_id}_${acqDate}`] || null}
                onActionCompleted={handleActionCompleted}
                actionsDisabled={apiMode === 'mock'}
                actionsDisabledReason={apiMode === 'mock' ? 'Demo preview has no backend — lifecycle actions require a live backend connection.' : null}
                evidenceRunId={dateRunId}
              />
            ))}
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && !error && filteredAlerts.length > PAGE_SIZE && (
          <nav
            aria-label="Alert list pagination"
            style={{
              marginTop: '2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              backgroundColor: 'var(--panel-surface, #1e222a)',
              border: '1px solid var(--hairline-border, #2e3440)',
              borderRadius: '8px'
            }}
          >
            <span aria-live="polite" style={{ fontSize: '0.82rem', color: 'var(--text-muted, #55595E)' }}>
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredAlerts.length)} of {filteredAlerts.length} alerts
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  ...smallButtonStyle,
                  backgroundColor: currentPage === 1 ? 'transparent' : 'var(--control-subtle)',
                  color: currentPage === 1 ? 'var(--text-muted, #55595E)' : 'var(--text-primary, #ffffff)',
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>

              <span style={{ fontSize: '0.8rem', color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace', padding: '0 4px' }}>
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  ...smallButtonStyle,
                  backgroundColor: currentPage === totalPages ? 'transparent' : 'var(--control-subtle)',
                  color: currentPage === totalPages ? 'var(--text-muted, #55595E)' : 'var(--text-primary, #ffffff)',
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </main>
    </div>
  );
}
