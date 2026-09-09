import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import OfflineBanner from './OfflineBanner';
import {
  fetchArchiveDates,
  fetchArchivePredictions,
  fetchArchiveSummary,
  CLASS_LABELS,
  PRIMARY_CLASSES,
  exportPredictionsToCsv,
  ingestionStatusWarning,
  getApiMode,
  onApiModeChange
} from '../services/api';
import { AlertCard, StatusBadge } from './FireAlertsPage';

const PAGE_SIZE = 25;

// The backend caps /archive/summary at 31 served days per request (it runs
// model inference per day). Requests are bounded to this window up front so a
// growing archive degrades the wide cards instead of failing the whole call.
const SUMMARY_WINDOW_DAYS = 31;

const selectStyle = {
  backgroundColor: 'var(--bg-dark, #0a0e12)',
  color: 'var(--text-primary, #eceff4)',
  border: '1px solid var(--hairline-border, #2e3440)',
  borderRadius: '6px',
  padding: '5px 10px',
  fontSize: '0.8rem',
  fontFamily: 'var(--font-heading)',
  fontWeight: 600,
  cursor: 'pointer'
};

const summaryCardStyle = {
  flex: '1 1 140px',
  padding: '12px 16px',
  backgroundColor: 'var(--panel-surface, #1e222a)',
  border: '1px solid var(--hairline-border, #2e3440)',
  borderRadius: '8px',
  textAlign: 'center'
};

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

/**
 * Historical H3-day prediction archive. Every row shown here comes from
 * /api/v1/archive/* (the backend's stored DuckDB predictions) and is labeled
 * HISTORICAL — it is never presented as a live alert feed. Rows reuse the
 * shared AlertCard from FireAlertsPage, and map deep links carry the
 * acquisition date.
 */
export default function ArchivePage() {
  const [acqDate, setAcqDate] = useState(null);
  const [availableDates, setAvailableDates] = useState([]);
  const [newestDate, setNewestDate] = useState(null);
  const [oldestDate, setOldestDate] = useState(null);
  const [sourceLabel, setSourceLabel] = useState('');

  const [predictions, setPredictions] = useState([]);
  const [total, setTotal] = useState(0);
  const [dataMode, setDataMode] = useState('historical');
  const [ingestionStatus, setIngestionStatus] = useState(null);

  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState(null);

  const [selectedClass, setSelectedClass] = useState('all');
  const [selectedState, setSelectedState] = useState('all');
  const [needsReviewOnly, setNeedsReviewOnly] = useState(false);
  const [minConfidence, setMinConfidence] = useState('any');

  const [loadingDates, setLoadingDates] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [datesError, setDatesError] = useState(null);
  const [rowsError, setRowsError] = useState(null);
  const [dateUnavailable, setDateUnavailable] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [apiMode, setApiModeState] = useState(() => getApiMode());

  useEffect(() => onApiModeChange((mode) => setApiModeState(mode)), []);

  // ── Bootstrap: discover backend-reported archive dates ────────────────────
  const bootstrap = useCallback(async () => {
    setLoadingDates(true);
    setDatesError(null);
    setSummaryError(null);
    try {
      const { availableDates: dates, newestDate: newest, oldestDate: oldest, source } = await fetchArchiveDates();
      setAvailableDates(dates);
      setNewestDate(newest);
      setOldestDate(oldest);
      setSourceLabel(source);
      if (newest) {
        setAcqDate(newest);
      }
      if (dates.length > 0) {
        try {
          setSummary(await fetchArchiveSummary({
            // Bound the span to the backend's 31-day cap once the archive
            // outgrows it; the summary then covers the most recent days.
            startDate: dates.length > SUMMARY_WINDOW_DAYS ? dates[dates.length - SUMMARY_WINDOW_DAYS] : null
          }));
        } catch (err) {
          console.error('[ArchivePage] Archive summary failed:', err);
          setSummary(null);
          setSummaryError(err.message || 'Archive summary request failed');
        }
      }
    } catch (err) {
      setDatesError(err?.message || 'Archive dates endpoint unreachable');
      setAvailableDates([]);
      setNewestDate(null);
    } finally {
      setLoadingDates(false);
    }
  }, []);

  const loadRowsRef = useRef(null);

  // ── Load one archived day (server-side filters, offset honored) ───────────
  const loadRows = useCallback(async (dateArg) => {
    const date = dateArg || acqDate;
    if (!date) return;
    setLoadingRows(true);
    setRowsError(null);
    setDateUnavailable(null);
    try {
      const res = await fetchArchivePredictions({
        acqDate: date,
        className: selectedClass !== 'all' ? selectedClass : null,
        state: selectedState !== 'all' ? selectedState : null,
        needsReview: needsReviewOnly ? true : null,
        minConfidence: minConfidence === 'any' ? null : Number(minConfidence),
        limit: 1000,
        offset: 0
      });
      setPredictions(res.predictions);
      setTotal(res.total);
      setDataMode(res.dataMode);
      setIngestionStatus(res.ingestionStatus);
    } catch (err) {
      console.error('[ArchivePage] Failed to fetch archive predictions:', err);
      if (err.notAvailable) {
        setDateUnavailable(err.acqDate || date);
        setPredictions([]);
        setTotal(0);
      } else {
        setRowsError(err.message || 'Failed to load the archived day');
      }
    } finally {
      setLoadingRows(false);
    }
  }, [acqDate, selectedClass, selectedState, needsReviewOnly, minConfidence]);
  useEffect(() => { loadRowsRef.current = loadRows; }, [loadRows]);

  // Single mount trigger.
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => { bootstrap(); }, [bootstrap]);

  // Reload rows whenever the date or any filter changes. bootstrap only sets
  // acqDate (never loads rows itself), so this single effect owns row loading.
  useEffect(() => {
    if (acqDate) loadRowsRef.current(acqDate);
  }, [acqDate, selectedClass, selectedState, needsReviewOnly, minConfidence]);

  // ── Date navigation ───────────────────────────────────────────────────────
  const datesDesc = useMemo(() => availableDates.slice().reverse(), [availableDates]);
  const dateIndex = availableDates.indexOf(acqDate);

  const handleDateChange = (nextDate) => {
    if (!nextDate || nextDate === acqDate) return;
    setAcqDate(nextDate);
    setCurrentPage(1);
  };
  const handlePrevDate = () => { // older
    if (dateIndex > 0) handleDateChange(availableDates[dateIndex - 1]);
  };
  const handleNextDate = () => { // newer
    if (dateIndex >= 0 && dateIndex < availableDates.length - 1) handleDateChange(availableDates[dateIndex + 1]);
  };

  // ── Filters available from the loaded batch + summary ─────────────────────
  const stateOptions = useMemo(() => {
    const states = new Set();
    for (const p of predictions) {
      if (p.state) states.add(p.state);
    }
    for (const day of summary?.days ?? []) {
      for (const key of Object.keys(day.byState || {})) {
        if (key !== 'unknown') states.add(key);
      }
    }
    if (selectedState !== 'all') states.add(selectedState);
    return Array.from(states).sort();
  }, [predictions, summary, selectedState]);

  const classOptions = useMemo(() => {
    const present = new Set(predictions.map((p) => p.predicted_class));
    if (selectedClass !== 'all') present.add(selectedClass);
    return PRIMARY_CLASSES.filter((c) => present.has(c)).concat(
      Array.from(present).filter((c) => c === 'unclassified')
    );
  }, [predictions, selectedClass]);

  // ── Client-side pagination over the loaded (≤1000) rows ───────────────────
  // The displayed page is clamped during render so shrinking filters can never
  // point past the last page (avoids a set-state-in-effect render cascade).
  const totalPages = Math.max(1, Math.ceil(predictions.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return predictions.slice(start, start + PAGE_SIZE);
  }, [predictions, safePage]);

  const setPage = useCallback((page) => setCurrentPage(Math.min(Math.max(1, page), totalPages)), [totalPages]);

  // ── Summary totals for the selected day (aria-live) ───────────────────────
  const daySummary = useMemo(() => {
    const counts = {};
    let review = 0;
    for (const p of predictions) {
      counts[p.predicted_class] = (counts[p.predicted_class] || 0) + 1;
      if (p.needs_review) review += 1;
    }
    return { total: predictions.length, needsReview: review, byClass: counts };
  }, [predictions]);

  const archiveTotals = useMemo(() => {
    const days = summary?.days ?? [];
    return {
      days: days.length,
      total: days.reduce((acc, d) => acc + (d.total || 0), 0),
      needsReview: days.reduce((acc, d) => acc + (d.needsReviewTotal || d.needs_review_total || 0), 0)
    };
  }, [summary]);

  // The archive is always a historical surface: even the newest day is shown
  // as HISTORICAL here so archived rows are never mistaken for the live feed.
  // DEMO/OFFLINE still surface when the backend reports them.
  const statusLabel = apiMode === 'mock' ? 'DEMO' : (dataMode === 'offline' ? 'OFFLINE' : 'HISTORICAL');

  const perDateWarning = ingestionStatusWarning(ingestionStatus);

  const handleExportCsv = () => {
    if (predictions.length === 0) return;
    try {
      exportPredictionsToCsv(
        predictions,
        `trinetra_archive_${acqDate || 'unknown-date'}.csv`,
        { acqDate: acqDate || undefined, dataMode: 'historical' }
      );
    } catch (err) {
      console.error('[ArchivePage] CSV export failed:', err);
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-dark, #0a0e12)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OfflineBanner />
      <Header />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%', textAlign: 'left' }}>
        {/* Title */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent-blue, #3d9de8)' }}>
                Historical Record
              </span>
              <StatusBadge status={statusLabel} labelPrefix="Archive status" />
              <span aria-live="polite" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontFamily: 'monospace' }}>
                {acqDate ? `Viewing ${acqDate}` : 'No date selected'}
                {oldestDate && newestDate ? ` · archive spans ${oldestDate} → ${newestDate}` : ''}
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', color: 'var(--text-primary, #eceff4)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              Historical Prediction Archive
            </h1>
            <p style={{ color: 'var(--text-muted, #55595E)', fontSize: '0.92rem', margin: 0, maxWidth: '780px', lineHeight: 1.5 }}>
              Archived H3-cell/day model predictions from the TRINETRA feature store. These are historical
              rows, not a live feed. A classification is a model output over satellite thermal anomalies —
              FIRMS provenance does not prove any observation is an industrial fire, gas flare, or wildfire.
            </p>
            {sourceLabel && (
              <p style={{ margin: '6px 0 0 0', color: 'var(--text-muted, #55595E)', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                Source: {sourceLabel}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link
              to="/fire-alerts"
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
              <span>Current Alerts</span>
            </Link>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={predictions.length === 0}
              title="Export the current filtered archive results as CSV (includes acquisition date and data mode)"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                backgroundColor: predictions.length > 0 ? 'var(--accent-blue, #3d9de8)' : 'rgba(61, 157, 232, 0.2)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: predictions.length > 0 ? 'pointer' : 'not-allowed',
                boxShadow: predictions.length > 0 ? '0 2px 8px rgba(61, 157, 232, 0.4)' : 'none'
              }}
            >
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Ingestion status warning for the selected day (never silent) */}
        {perDateWarning && !loadingRows && (
          <div
            role="alert"
            style={{
              marginBottom: '1.5rem',
              padding: '12px 16px',
              backgroundColor: 'rgba(241, 196, 15, 0.12)',
              border: '1px solid rgba(241, 196, 15, 0.5)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: '#6b5200'
            }}
          >
            ⚠ {perDateWarning}
          </div>
        )}

        {/* Summary totals (or an explicit unavailable state, never silent zeros) */}
        {summaryError ? (
          <div
            role="alert"
            style={{
              marginBottom: '1.5rem',
              padding: '12px 16px',
              backgroundColor: 'rgba(241, 196, 15, 0.12)',
              border: '1px solid rgba(241, 196, 15, 0.5)',
              borderRadius: '8px',
              fontSize: '0.85rem',
              color: '#6b5200'
            }}
          >
            ⚠ Archive-wide summary is unavailable ({summaryError}). Per-day browsing below is unaffected.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <div style={summaryCardStyle}>
              <div aria-live="polite" style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary, #eceff4)' }}>
                {archiveTotals.total}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {availableDates.length > SUMMARY_WINDOW_DAYS
                  ? `Archived predictions (latest ${SUMMARY_WINDOW_DAYS} days)`
                  : `Archived predictions (${archiveTotals.days} day${archiveTotals.days === 1 ? '' : 's'})`}
              </div>
            </div>
          <div style={summaryCardStyle}>
            <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary, #eceff4)' }}>
              {archiveTotals.needsReview}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Need analyst review
            </div>
          </div>
          <div style={summaryCardStyle}>
            <div aria-live="polite" style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary, #eceff4)' }}>
              {daySummary.total}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Rows for {acqDate || '—'} (filtered)
            </div>
          </div>
          <div style={summaryCardStyle}>
            <div style={{ fontFamily: 'monospace', fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary, #eceff4)' }}>
              {daySummary.needsReview}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #55595E)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Review-flagged on this day
            </div>
          </div>
          </div>
        )}

        {/* Date navigation + filters toolbar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
            marginBottom: '1.25rem',
            padding: '12px 16px',
            backgroundColor: 'var(--panel-surface, #1e222a)',
            border: '1px solid var(--hairline-border, #2e3440)',
            borderRadius: '8px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.05em' }}>
              DATE:
            </span>
            <button
              type="button"
              onClick={handlePrevDate}
              disabled={loadingRows || dateIndex <= 0}
              aria-label="Previous archive date (older)"
              style={{ ...smallButtonStyle, opacity: loadingRows || dateIndex <= 0 ? 0.5 : 1, cursor: loadingRows || dateIndex <= 0 ? 'not-allowed' : 'pointer' }}
            >
              ← Older
            </button>
            <label htmlFor="archive-date-select" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
              Select archive date
            </label>
            <select
              id="archive-date-select"
              value={acqDate || ''}
              onChange={(e) => handleDateChange(e.target.value)}
              disabled={datesDesc.length === 0 || loadingDates}
              style={{ ...selectStyle, fontFamily: 'monospace', fontSize: '0.82rem' }}
            >
              {datesDesc.length === 0 && <option value="">no dates available</option>}
              {datesDesc.map((d) => (
                <option key={d} value={d}>{d}{d === newestDate ? ' (newest)' : ''}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleNextDate}
              disabled={loadingRows || dateIndex < 0 || dateIndex >= availableDates.length - 1}
              aria-label="Next archive date (newer)"
              style={{ ...smallButtonStyle, opacity: loadingRows || dateIndex < 0 || dateIndex >= availableDates.length - 1 ? 0.5 : 1, cursor: loadingRows || dateIndex < 0 || dateIndex >= availableDates.length - 1 ? 'not-allowed' : 'pointer' }}
            >
              Newer →
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label htmlFor="archive-class" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontWeight: 700 }}>Class:</label>
            <select id="archive-class" value={selectedClass} onChange={(e) => { setSelectedClass(e.target.value); setCurrentPage(1); }} style={selectStyle}>
              <option value="all">All classes</option>
              {classOptions.map((c) => (
                <option key={c} value={c}>{CLASS_LABELS[c] || c}</option>
              ))}
            </select>

            <label htmlFor="archive-state" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontWeight: 700 }}>State:</label>
            <select id="archive-state" value={selectedState} onChange={(e) => { setSelectedState(e.target.value); setCurrentPage(1); }} style={selectStyle}>
              <option value="all">All states</option>
              {stateOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>

            <label htmlFor="archive-conf" style={{ fontSize: '0.75rem', color: 'var(--text-muted, #55595E)', fontWeight: 700 }}>Min confidence:</label>
            <select id="archive-conf" value={minConfidence} onChange={(e) => { setMinConfidence(e.target.value); setCurrentPage(1); }} style={selectStyle}>
              <option value="any">Any</option>
              <option value="0.5">≥ 50%</option>
              <option value="0.7">≥ 70%</option>
              <option value="0.85">≥ 85%</option>
            </select>

            <label htmlFor="archive-review" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-primary, #eceff4)', fontWeight: 600, cursor: 'pointer' }}>
              <input
                id="archive-review"
                type="checkbox"
                checked={needsReviewOnly}
                onChange={(e) => { setNeedsReviewOnly(e.target.checked); setCurrentPage(1); }}
                style={{ accentColor: 'var(--accent-ember, #FF6B35)', width: 15, height: 15, cursor: 'pointer' }}
              />
              Needs review only
            </label>
          </div>
        </div>

        {/* Loading */}
        {loadingRows && (
          <div role="status" style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted, #55595E)' }}>
            <div style={{ fontWeight: 600, color: 'var(--text-primary, #eceff4)' }}>Loading archived predictions for {acqDate}...</div>
          </div>
        )}

        {/* Dates error / offline */}
        {!loadingDates && datesError && (
          <div
            role="alert"
            style={{
              padding: '2rem',
              backgroundColor: 'rgba(231, 76, 60, 0.12)',
              border: '1px solid rgba(231, 76, 60, 0.4)',
              borderRadius: '8px',
              textAlign: 'center'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '6px', color: '#d64228' }}>
              Archive unavailable — backend error
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '1rem', color: 'var(--text-primary, #eceff4)' }}>{datesError}</div>
            <div style={{ fontSize: '0.8rem', marginBottom: '1rem', color: 'var(--text-muted, #55595E)' }}>
              No simulated data is substituted for the archive; without the backend there is nothing truthful to show.
            </div>
            <button type="button" onClick={bootstrap} style={{ ...smallButtonStyle, backgroundColor: '#e74c3c', color: '#ffffff', border: 'none', padding: '8px 18px' }}>
              Retry
            </button>
          </div>
        )}

        {/* No dates at all (empty store) */}
        {!loadingDates && !datesError && availableDates.length === 0 && (
          <div role="status" style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: 'var(--panel-surface, #1e222a)', border: '1px solid var(--hairline-border, #2e3440)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary, #eceff4)', marginBottom: '6px' }}>The archive is empty</div>
            <p style={{ margin: 0, color: 'var(--text-muted, #55595E)', fontSize: '0.9rem' }}>
              The backend reported no archived dates, so there is nothing historical to browse yet.
            </p>
          </div>
        )}

        {/* Date unavailable (404 archive_date_not_available) */}
        {!loadingRows && !datesError && dateUnavailable && (
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
              The archive has no stored predictions for {dateUnavailable}.
              {newestDate ? ` Available range: ${oldestDate || newestDate} → ${newestDate}.` : ''}
            </div>
          </div>
        )}

        {/* Rows error */}
        {!loadingRows && !datesError && rowsError && (
          <div role="alert" style={{ padding: '2rem', backgroundColor: 'rgba(231, 76, 60, 0.12)', border: '1px solid rgba(231, 76, 60, 0.4)', borderRadius: '8px', textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', marginBottom: '6px', color: '#d64228' }}>Failed to load the archived day</div>
            <div style={{ fontSize: '0.9rem', color: 'var(--text-primary, #eceff4)' }}>{rowsError}</div>
            <button type="button" onClick={() => loadRowsRef.current(acqDate)} style={{ ...smallButtonStyle, marginTop: '1rem', backgroundColor: '#e74c3c', color: '#ffffff', border: 'none', padding: '8px 18px' }}>
              Retry
            </button>
          </div>
        )}

        {/* Zero rows for a valid stored date (distinct from unavailable) */}
        {!loadingRows && !datesError && !rowsError && !dateUnavailable && acqDate && predictions.length === 0 && (
          <div role="status" aria-live="polite" style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: 'var(--panel-surface, #1e222a)', border: '1px solid var(--hairline-border, #2e3440)', borderRadius: '8px' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary, #eceff4)', marginBottom: '6px' }}>
              No predictions for this date{selectedClass !== 'all' || selectedState !== 'all' || needsReviewOnly || minConfidence !== 'any' ? ' with the current filters' : ''}
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted, #55595E)', fontSize: '0.9rem' }}>
              {selectedClass !== 'all' || selectedState !== 'all' || needsReviewOnly || minConfidence !== 'any'
                ? 'Try clearing a filter to see the unfiltered archived rows.'
                : 'The archive has stored rows for this date but zero matched the query.'}
            </p>
          </div>
        )}

        {/* Rows */}
        {!loadingRows && !datesError && !rowsError && paginated.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {total > predictions.length && (
              <div style={{ padding: '10px 14px', backgroundColor: 'var(--control-subtle)', borderRadius: '6px', fontSize: '0.8rem', color: 'var(--text-primary, #eceff4)' }}>
                Showing the first {predictions.length} of {total} archived rows for {acqDate} (server limit reached). Narrow the filters to see more.
              </div>
            )}
            {paginated.map((alert, idx) => (
              <AlertCard key={alert.cell_id || alert.h3_index || idx} alert={alert} index={idx} mapDate={acqDate} />
            ))}
          </div>
        )}

        {/* Pagination */}
        {!loadingRows && !datesError && !rowsError && predictions.length > PAGE_SIZE && (
          <nav
            aria-label="Archive pagination"
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
              Showing {((safePage - 1) * PAGE_SIZE) + 1}–{Math.min(safePage * PAGE_SIZE, predictions.length)} of {predictions.length} archived rows
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setPage(safePage - 1)}
                disabled={safePage === 1}
                style={{ ...smallButtonStyle, backgroundColor: safePage === 1 ? 'transparent' : 'var(--control-subtle)', color: safePage === 1 ? 'var(--text-muted, #55595E)' : 'var(--text-primary, #ffffff)', cursor: safePage === 1 ? 'not-allowed' : 'pointer' }}
              >
                Previous
              </button>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-primary, #eceff4)', fontFamily: 'monospace', padding: '0 4px' }}>
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(safePage + 1)}
                disabled={safePage === totalPages}
                style={{ ...smallButtonStyle, backgroundColor: safePage === totalPages ? 'transparent' : 'var(--control-subtle)', color: safePage === totalPages ? 'var(--text-muted, #55595E)' : 'var(--text-primary, #ffffff)', cursor: safePage === totalPages ? 'not-allowed' : 'pointer' }}
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
