import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
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
export function AlertCard({ alert, index, mapDate = null, alertState = null, onActionCompleted = null, actionsDisabled = false, actionsDisabledReason = null, evidenceRunId = null }) {
  const [probExpanded, setProbExpanded] = useState(false);
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
  // hotspot ids are '{h3_08}_{acq_date}' (the backend's alert-lifecycle key).
  // In prediction payloads cell_id carries only the h3 index, so the id must
  // always be composed with the acquisition date.
  const h3Key = alert.h3_index || alert.cell_id;
  const hotspotId = h3Key && mapDate ? `${h3Key}_${mapDate}` : null;
  const effectiveState = localState || alertState;

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
    // Mirror the backend replay semantics: `note` never moves state,
    // `reopened` returns to new, everything else becomes the state.
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
    setHistory(null); // refetch next time the panel opens
    onActionCompleted?.(event);
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--panel-surface, #1e222a)',
        border: `1px solid ${alert.needs_review ? 'rgba(231, 76, 60, 0.4)' : 'var(--hairline-border, #2e3440)'}`,
        borderRadius: '8px',
        padding: '1.25rem 1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)'
      }}
    >
      {/* Top Bar: Color Indicator + Class Label + H3 Res 8 + Confidence & Review Badges */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span style={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: color, flexShrink: 0 }} />
          <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary, #f8f9fa)' }}>
            {CLASS_LABELS[pClass] || pClass}
          </span>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8b949e)', fontFamily: 'monospace' }}>
            [{cellKey}]
          </span>
          {alert.state && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>
              {alert.state}
            </span>
          )}
          {alert.is_synthetic && (
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(241, 196, 15, 0.15)',
                color: '#a07d00',
                border: '1px solid rgba(241, 196, 15, 0.4)'
              }}
            >
              SIMULATED
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          {hotspotId && <LifecycleBadge state={effectiveState?.state || 'new'} />}
          <span
            style={{
              padding: '3px 8px',
              borderRadius: '12px',
              fontSize: '0.72rem',
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
            {labelQuality}
          </span>

          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8b949e)' }}>
            Confidence:{' '}
            <strong style={{ color: 'var(--text-primary, #ffffff)', fontFamily: 'monospace' }}>
              {alert.confidence != null ? `${(alert.confidence * 100).toFixed(0)}%` : 'N/A'}
            </strong>
          </span>
        </div>
      </div>

      {/* Middle Row: Coordinates + Map Deep Link */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)' }}>
          <span>
            Latitude:{' '}
            <strong style={{ color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace' }}>
              {alert.latitude != null ? alert.latitude.toFixed(4) : 'N/A'}°
            </strong>
          </span>
          <span>
            Longitude:{' '}
            <strong style={{ color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace' }}>
              {alert.longitude != null ? alert.longitude.toFixed(4) : 'N/A'}°
            </strong>
          </span>
          {alert.calibrated !== undefined && (
            <span>
              Calibrated:{' '}
              <span style={{ color: alert.calibrated ? '#1e9e5a' : 'var(--text-muted, #8b949e)' }}>
                {alert.calibrated ? '✓' : 'No'}
              </span>
            </span>
          )}
          {mapDate && (
            <span>
              Acquired:{' '}
              <strong style={{ color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace' }}>{mapDate}</strong>
            </span>
          )}
        </div>

        {alert.latitude != null && alert.longitude != null && (
          <Link
            to={`/fire-map?lat=${alert.latitude}&lon=${alert.longitude}&h3=${alert.h3_index || alert.cell_id}${mapDate ? `&date=${mapDate}` : ''}`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--accent-blue, #3d9de8)',
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '4px',
              backgroundColor: 'rgba(61, 157, 232, 0.1)',
              border: '1px solid rgba(61, 157, 232, 0.3)',
              transition: 'background 0.2s ease'
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span>View on Map</span>
          </Link>
        )}
      </div>

      {/* Caveats Section */}
      {(caveats.length > 0 || (canonicalCaveat && !caveats.includes(canonicalCaveat))) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--hairline-border, #2e3440)', paddingTop: '8px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#a06a00', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Disclosed Model Caveats:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {[...caveats, ...(canonicalCaveat && !caveats.includes(canonicalCaveat) ? [canonicalCaveat] : [])].map((c, i) => (
              <span
                key={i}
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: 'rgba(241, 196, 15, 0.1)',
                  color: '#7a5c00',
                  border: '1px solid rgba(241, 196, 15, 0.35)',
                  borderRadius: '4px',
                  padding: '3px 8px'
                }}
              >
                ℹ️ {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Probabilities Toggle & Visual Breakdown */}
      {probabilities.length > 0 && (
        <div style={{ borderTop: '1px solid var(--hairline-border, #2e3440)', paddingTop: '6px' }}>
          <button
            type="button"
            aria-expanded={probExpanded}
            onClick={() => setProbExpanded((v) => !v)}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-primary, #eceff4)',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: 0
            }}
          >
            <span>{probExpanded ? '▲ Hide' : '▼ Inspect'} class distribution ({probabilities.length} classes)</span>
          </button>

          {probExpanded && (
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {probabilities.map((item, pIdx) => {
                const pItemClass = item.class_name;
                const pColor = CLASS_COLORS[pItemClass] || '#787878';
                const pPercent = (item.probability * 100).toFixed(1);
                return (
                  <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem' }}>
                    <span style={{ width: '110px', color: 'var(--text-primary, #eceff4)', fontWeight: 500 }}>
                      {CLASS_LABELS[pItemClass] || pItemClass}
                    </span>
                    <div style={{ flex: 1, backgroundColor: 'var(--control-subtle)', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
                      <div style={{ width: `${pPercent}%`, backgroundColor: pColor, height: '100%', borderRadius: '3px' }} />
                    </div>
                    <span style={{ width: '45px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--text-muted, #8b949e)' }}>
                      {pPercent}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lifecycle: last analyst decision + append-only history + raw evidence */}
      {hotspotId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', borderTop: '1px solid var(--hairline-border, #2e3440)', paddingTop: '8px' }}>
          {effectiveState?.last_action && (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>
              Last review: {effectiveState.last_action} by <code>{effectiveState.analyst_id || 'unknown'}</code>
              {effectiveState.last_event_at ? ` at ${effectiveState.last_event_at}` : ''}
              {effectiveState.last_note ? ` — "${effectiveState.last_note}"` : ''}
            </div>
          )}

          <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
            <button
              type="button"
              aria-expanded={historyExpanded}
              onClick={() => {
                setHistoryExpanded((v) => !v);
                if (!historyExpanded) loadHistory();
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue, #3d9de8)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              {historyExpanded ? '▲ Hide review history' : '▼ Review history'}
            </button>
            {mapDate && (
              <button
                type="button"
                aria-expanded={evidenceExpanded}
                onClick={() => setEvidenceExpanded((v) => !v)}
                style={{ background: 'transparent', border: 'none', color: 'var(--accent-blue, #3d9de8)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', padding: 0 }}
              >
                {evidenceExpanded ? '▲ Hide raw FIRMS evidence' : '▼ View raw FIRMS evidence'}
              </button>
            )}
          </div>

          {historyExpanded && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {history === null && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>Loading history…</div>}
              {Array.isArray(history) && history.length === 0 && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>
                  No review events yet — this hotspot is in the "new" state. Actions are appended below and never overwritten.
                </div>
              )}
              {Array.isArray(history) && history.map((ev) => (
                <div key={ev.event_id} style={{ fontSize: '0.75rem', color: 'var(--text-primary, #eceff4)' }}>
                  <code>{ev.timestamp}</code> — {ev.action} by <code>{ev.analyst_id}</code>
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
  );
}

const pillButtonStyle = (selected) => ({
  background: selected ? 'var(--control-subtle)' : 'transparent',
  color: selected ? 'var(--text-primary, #ffffff)' : 'var(--text-muted, #8b949e)',
  border: '1px solid var(--hairline-border, #2e3440)',
  borderRadius: '20px',
  padding: '4px 12px',
  fontSize: '0.78rem',
  fontFamily: 'var(--font-heading)',
  fontWeight: 600,
  cursor: 'pointer'
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
  const [stateFilter, setStateFilter] = useState('all'); // all|new|needs_review|acknowledged|confirmed|dismissed
  const [dateRunId, setDateRunId] = useState(null); // decisive ingestion run for the selected date
  const [truncatedTotal, setTruncatedTotal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorKind, setErrorKind] = useState('error'); // 'error' | 'dateUnavailable'
  const [selectedClass, setSelectedClass] = useState('all');
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

  // ── Dynamic available classes (empirical presence in batch) ───────────────
  const availableClasses = useMemo(() => getAvailableClasses(alerts), [alerts]);

  const effectiveSelectedClass = useMemo(() => {
    if (selectedClass !== 'all' && !availableClasses.includes(selectedClass)) {
      return 'all';
    }
    return selectedClass;
  }, [selectedClass, availableClasses]);

  const handleSelectClass = (cls) => {
    setSelectedClass(cls);
    setCurrentPage(1);
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

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%', textAlign: 'left' }}>
        {/* Page Title & Operational Framing */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent-blue, #3d9de8)' }}>
                Thermal Hotspot Feed
              </span>
              <StatusBadge status={status} />
              <span aria-live="polite" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', fontFamily: 'monospace' }}>
                Observation date: {dateLabel}
                {newestDate ? ` · Newest available: ${newestDate}` : ''}
                {availableDates.length > 0 ? ` · ${availableDates.length} date${availableDates.length === 1 ? '' : 's'} archived` : ''}
                {filteredAlerts.length > 0 ? ` · ${filteredAlerts.length} shown` : ''}
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', color: 'var(--text-primary, #eceff4)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              Infrastructure Fire Alerts
            </h1>
            <p style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.92rem', margin: 0, maxWidth: '780px', lineHeight: 1.5 }}>
              Satellite thermal anomalies detected via VIIRS &amp; MODIS passes and classified by the TRINETRA inference engine.
              Classifications disclose calibrated confidence and uncertainty caveats; a classification is a model output, not proof of fire type.
            </p>
            {(sourceLabel || ingestionDetail) && (
              <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted, #55595E)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                {sourceLabel ? `Source: ${sourceLabel}` : ''}
                {sourceLabel && ingestionDetail ? ' · ' : ''}
                {ingestionDetail || ''}
              </p>
            )}
          </div>

          {/* Action Bar: Refresh + CSV Export + Archive link */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link
              to="/archive"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: 'transparent',
                color: 'var(--accent-blue, #3d9de8)',
                border: '1px solid var(--accent-blue, #3d9de8)',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none'
              }}
            >
              <span>Historical Archive</span>
            </Link>
            <button
              type="button"
              onClick={bootstrap}
              disabled={loading}
              title="Refresh alerts from backend"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                backgroundColor: 'var(--panel-surface, #1e222a)',
                color: 'var(--text-primary, #eceff4)',
                border: '1px solid var(--hairline-border, #2e3440)',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredAlerts.length === 0}
              title="Export current alerts as CSV (includes acquisition date and data mode)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: filteredAlerts.length > 0 ? 'var(--accent-blue, #3d9de8)' : 'rgba(61, 157, 232, 0.2)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: filteredAlerts.length > 0 ? 'pointer' : 'not-allowed',
                boxShadow: filteredAlerts.length > 0 ? '0 2px 8px rgba(61, 157, 232, 0.4)' : 'none'
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Ingestion staleness / plausibility warnings (role=alert, never silent) */}
        {!loading && allWarnings.length > 0 && (
          <div
            role="alert"
            style={{
              marginBottom: '1.5rem',
              padding: '12px 16px',
              backgroundColor: 'rgba(241, 196, 15, 0.12)',
              border: '1px solid rgba(241, 196, 15, 0.5)',
              borderRadius: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}
          >
            <div style={{ fontSize: '0.8rem', fontWeight: 800, color: '#7a5c00', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              ⚠ Data quality warnings
            </div>
            {allWarnings.map((w, i) => (
              <div key={i} style={{ fontSize: '0.85rem', color: '#6b5200', lineHeight: 1.45 }}>{w}</div>
            ))}
          </div>
        )}

        {/* Date navigation toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
            padding: '12px 16px',
            backgroundColor: 'var(--panel-surface, #1e222a)',
            border: '1px solid var(--hairline-border, #2e3440)',
            borderRadius: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.05em' }}>
              OBSERVATION DATE:
            </span>
            <button
              type="button"
              onClick={handlePrevDate}
              disabled={loading || dateIndex <= 0}
              aria-label="Previous observation date (older)"
              style={{ ...smallButtonStyle, opacity: loading || dateIndex <= 0 ? 0.5 : 1, cursor: loading || dateIndex <= 0 ? 'not-allowed' : 'pointer' }}
            >
              ← Older
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
                backgroundColor: 'var(--bg-dark, #0a0e12)',
                color: 'var(--text-primary, #eceff4)',
                border: '1px solid var(--hairline-border, #2e3440)',
                borderRadius: '6px',
                padding: '5px 10px',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
                fontWeight: 600,
                cursor: datesDesc.length === 0 ? 'not-allowed' : 'pointer'
              }}
            >
              {datesDesc.length === 0 && <option value="">no dates available</option>}
              {datesDesc.map((d) => (
                <option key={d} value={d}>
                  {d}{d === newestDate ? ' (newest)' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleNextDate}
              disabled={loading || dateIndex < 0 || dateIndex >= availableDates.length - 1}
              aria-label="Next observation date (newer)"
              style={{ ...smallButtonStyle, opacity: loading || dateIndex < 0 || dateIndex >= availableDates.length - 1 ? 0.5 : 1, cursor: loading || dateIndex < 0 || dateIndex >= availableDates.length - 1 ? 'not-allowed' : 'pointer' }}
            >
              Newer →
            </button>
            {datesError && (
              <span style={{ fontSize: '0.75rem', color: '#d64228' }}>
                Date list unavailable ({datesError}) — using /health fallback.
              </span>
            )}
          </div>

          {/* Sort By Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label htmlFor="alert-sort" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.05em' }}>
              SORT:
            </label>
            <select
              id="alert-sort"
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-dark, #0a0e12)',
                color: 'var(--text-primary, #eceff4)',
                border: '1px solid var(--hairline-border, #2e3440)',
                borderRadius: '6px',
                padding: '4px 10px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <option value="review">⚠️ Needs Review First</option>
              <option value="conf_desc">Highest Confidence</option>
              <option value="conf_asc">Lowest Confidence</option>
            </select>
          </div>
        </div>

        {/* Filter chips row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.05em' }}>
            FILTER:
          </span>
          <button
            type="button"
            onClick={() => handleSelectClass('all')}
            aria-pressed={effectiveSelectedClass === 'all'}
            style={pillButtonStyle(effectiveSelectedClass === 'all')}
          >
            All Alerts ({alerts.length})
          </button>

          {availableClasses.map(cls => {
            const count = alerts.filter(a => a.predicted_class === cls).length;
            const color = CLASS_COLORS[cls] || '#787878';
            const label = CLASS_LABELS[cls] || cls;
            const isSelected = effectiveSelectedClass === cls;

            return (
              <button
                key={cls}
                type="button"
                onClick={() => handleSelectClass(cls)}
                aria-pressed={isSelected}
                style={{
                  background: isSelected ? color : 'transparent',
                  color: isSelected ? '#0A0E12' : 'var(--text-primary, #eceff4)',
                  border: `1px solid ${isSelected ? color : 'var(--hairline-border, #2e3440)'}`,
                  borderRadius: '20px',
                  padding: '4px 12px',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
                {label} ({count})
              </button>
            );
          })}
        </div>

        {/* Lifecycle state filter chips (replay-derived analyst decisions) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.05em' }}>
            REVIEW STATE:
          </span>
          {[
            ['all', `All (${alerts.length})`],
            ['needs_review', `Needs review (${alerts.filter(a => a.needs_review).length})`],
            ['new', `New (${lifecycleCounts.new})`],
            ['acknowledged', `Acknowledged (${lifecycleCounts.acknowledged})`],
            ['confirmed', `Confirmed (${lifecycleCounts.confirmed})`],
            ['dismissed', `Dismissed (${lifecycleCounts.dismissed})`]
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={stateFilter === value}
              onClick={() => { setStateFilter(value); setCurrentPage(1); }}
              style={pillButtonStyle(stateFilter === value)}
            >
              {label}
            </button>
          ))}
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #55595E)' }}>
            {reviewedCount} reviewed · {lifecycleCounts.new} unreviewed (lifecycle)
          </span>
          {statesError && (
            <span role="alert" style={{ fontSize: '0.72rem', color: '#d64228' }}>
              Lifecycle states unavailable ({statesError})
            </span>
          )}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
