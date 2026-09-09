import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import OfflineBanner from './OfflineBanner';
import {
  fetchPredictions,
  INDIA_BOUNDS,
  CLASS_COLORS,
  CLASS_LABELS,
  KNOWN_CAVEATS,
  parseCaveatFlag,
  confidenceLabel,
  getAvailableClasses,
  exportPredictionsToCsv
} from '../services/api';

const PAGE_SIZE = 25;

export default function FireAlertsPage() {
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedClass, setSelectedClass] = useState('all');
  const [sortBy, setSortBy] = useState('review'); // 'review' | 'conf_desc' | 'conf_asc'
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedProbCellId, setExpandedProbCellId] = useState(null);

  // ── Fetch predictions for wide India bounds for today ───────────────────────
  const loadAlerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPredictions(INDIA_BOUNDS, today, 5);
      const arr = Array.isArray(data) ? data : (data?.predictions ?? []);
      setAlerts(arr);
    } catch (err) {
      console.error('[FireAlertsPage] Failed to fetch alerts:', err);
      setError(err.message || 'Failed to retrieve thermal alert predictions');
    } finally {
      setLoading(false);
    }
  }, [today]);

  // Single mount trigger — calls loadAlerts once. The refresh button also calls
  // loadAlerts directly. This replaces the previous duplicate useEffect that was
  // racing with loadAlerts on mount (double network request bug).
  // eslint-disable-next-line react/set-state-in-effect
  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  // ── Dynamic available classes (empirical presence in batch) ────────────────
  const availableClasses = useMemo(() => {
    return getAvailableClasses(alerts);
  }, [alerts]);

  // Derive effective selected class (resets to 'all' if selected class isn't in current batch)
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
  const filteredAlerts = useMemo(() => {
    let list = effectiveSelectedClass === 'all'
      ? alerts
      : alerts.filter(a => a.predicted_class === effectiveSelectedClass);

    return list.slice().sort((a, b) => {
      if (sortBy === 'review') {
        // Needs review first
        const aRev = a.needs_review ? 1 : 0;
        const bRev = b.needs_review ? 1 : 0;
        if (aRev !== bRev) return bRev - aRev;
        // Then by confidence descending
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
  }, [alerts, effectiveSelectedClass, sortBy]);

  // ── Pagination slice ───────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(filteredAlerts.length / PAGE_SIZE));
  const paginatedAlerts = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredAlerts.slice(start, start + PAGE_SIZE);
  }, [filteredAlerts, currentPage]);

  // ── CSV Export handler ─────────────────────────────────────────────────────
  const handleExportCsv = () => {
    if (filteredAlerts.length === 0) return;
    try {
      exportPredictionsToCsv(filteredAlerts, `trinetra_alerts_${today}.csv`);
    } catch (err) {
      console.error('[FireAlertsPage] CSV export failed:', err);
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-dark, #0a0e12)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <OfflineBanner />
      <Header />

      <main style={{ maxWidth: '1140px', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%', textAlign: 'left' }}>
        {/* Page Title & Operational Framing */}
        <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent-blue, #3d9de8)' }}>
                Thermal Hotspot Feed
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>•</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', fontFamily: 'monospace' }}>
                Observation Date: {today}
              </span>
            </div>
            <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', color: 'var(--text-primary, #eceff4)', margin: '0 0 6px 0', letterSpacing: '-0.02em' }}>
              Infrastructure Fire Alerts
            </h1>
            <p style={{ color: 'var(--text-muted, #8b949e)', fontSize: '0.92rem', margin: 0, maxWidth: '780px', lineHeight: 1.5 }}>
              Satellite thermal anomalies detected via VIIRS & MODIS passes and classified by the TRINETRA inference engine.
              All classifications disclose calibrated confidence and uncertainty caveats.
            </p>
          </div>

          {/* Action Bar: Refresh + CSV Export */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              type="button"
              onClick={loadAlerts}
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={filteredAlerts.length === 0}
              title="Export current alerts as CSV"
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
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Filter and Sorting Toolbar */}
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
          {/* Class Filter Chips */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.05em' }}>
              FILTER:
            </span>

            <button
              type="button"
              onClick={() => handleSelectClass('all')}
              style={{
                background: effectiveSelectedClass === 'all' ? 'rgba(234, 237, 240, 0.15)' : 'transparent',
                color: effectiveSelectedClass === 'all' ? '#ffffff' : 'var(--text-muted, #8b949e)',
                border: '1px solid var(--hairline-border, #2e3440)',
                borderRadius: '20px',
                padding: '4px 12px',
                fontSize: '0.78rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                cursor: 'pointer'
              }}
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
                  style={{
                    background: isSelected ? color : 'transparent',
                    color: isSelected ? '#0A0E12' : '#eceff4',
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
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: color }} />
                  {label} ({count})
                </button>
              );
            })}
          </div>

          {/* Sort By Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', fontFamily: 'var(--font-heading)', fontWeight: 700, letterSpacing: '0.05em' }}>
              SORT:
            </span>
            <select
              value={sortBy}
              onChange={(e) => handleSortChange(e.target.value)}
              style={{
                backgroundColor: 'var(--bg-dark, #0a0e12)',
                color: '#eceff4',
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

        {/* Loading State */}
        {loading && (
          <div style={{ padding: '5rem 2rem', textAlign: 'center', color: 'var(--text-muted, #8b949e)' }}>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary, #eceff4)', marginBottom: '8px' }}>
              Loading thermal anomaly detections for {today}...
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              Querying NASA VIIRS / MODIS satellite passes across India coordinates.
            </div>
          </div>
        )}

        {/* Error State */}
        {!loading && error && (
          <div
            style={{
              padding: '2rem',
              backgroundColor: 'rgba(231, 76, 60, 0.12)',
              border: '1px solid rgba(231, 76, 60, 0.4)',
              borderRadius: '8px',
              textAlign: 'center',
              color: '#e74c3c'
            }}
          >
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '6px' }}>
              Unable to load thermal alerts
            </div>
            <div style={{ fontSize: '0.9rem', marginBottom: '1rem', color: '#eceff4' }}>
              {error}
            </div>
            <button
              type="button"
              onClick={loadAlerts}
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

        {/* Empty States */}
        {!loading && !error && alerts.length === 0 && (
          <div
            style={{
              padding: '5rem 2rem',
              textAlign: 'center',
              backgroundColor: 'var(--panel-surface, #1e222a)',
              border: '1px solid var(--hairline-border, #2e3440)',
              borderRadius: '8px'
            }}
          >
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#eceff4', marginBottom: '8px' }}>
              Zero Thermal Detections Registered Today ({today})
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted, #8b949e)', fontSize: '0.9rem', maxWidth: '580px', marginInline: 'auto', lineHeight: 1.5 }}>
              No high-temperature surface anomalies across monitored Indian infrastructure sectors were detected during recent orbital passes,
              or scheduled FIRMS ingestion for today is pending.
            </p>
          </div>
        )}

        {!loading && !error && alerts.length > 0 && filteredAlerts.length === 0 && (
          <div
            style={{
              padding: '4rem 2rem',
              textAlign: 'center',
              backgroundColor: 'var(--panel-surface, #1e222a)',
              border: '1px solid var(--hairline-border, #2e3440)',
              borderRadius: '8px',
              color: 'var(--text-muted, #8b949e)'
            }}
          >
            <div style={{ fontSize: '1rem', fontWeight: 600, color: '#eceff4', marginBottom: '6px' }}>
              No thermal alerts match the selected classification filter "{CLASS_LABELS[selectedClass] || selectedClass}".
            </div>
            <p style={{ margin: 0, fontSize: '0.85rem' }}>
              Try selecting "All Alerts" to view the {alerts.length} detections recorded today.
            </p>
          </div>
        )}

        {/* Alerts List */}
        {!loading && !error && paginatedAlerts.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {paginatedAlerts.map((alert, idx) => {
              const pClass = alert.predicted_class || 'unclassified';
              const color = CLASS_COLORS[pClass] || CLASS_COLORS.unclassified;
              const labelQuality = confidenceLabel(alert);
              const caveats = parseCaveatFlag(alert.caveat_flag);
              const canonicalCaveat = KNOWN_CAVEATS[pClass];
              const isProbExpanded = expandedProbCellId === (alert.cell_id || alert.h3_index || idx);
              const probabilities = Array.isArray(alert.probabilities) ? alert.probabilities : [];

              return (
                <div
                  key={alert.cell_id || alert.h3_index || idx}
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
                    {/* Left side */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '3px', backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.05rem', color: '#f8f9fa' }}>
                        {CLASS_LABELS[pClass] || pClass}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8b949e)', fontFamily: 'monospace' }}>
                        [{alert.h3_index || alert.cell_id}]
                      </span>
                      {alert.is_synthetic && (
                        <span
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(241, 196, 15, 0.15)',
                            color: '#F1C40F',
                            border: '1px solid rgba(241, 196, 15, 0.4)'
                          }}
                        >
                          SIMULATED
                        </span>
                      )}
                    </div>

                    {/* Right side: Qualitative & Quantitative Confidence */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      {/* Qualitative Badge */}
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
                            ? '#2ecc71'
                            : (labelQuality === 'Needs review' ? '#e74c3c' : '#a0a0a0'),
                          border: `1px solid ${labelQuality === 'High confidence'
                            ? 'rgba(46, 204, 113, 0.4)'
                            : (labelQuality === 'Needs review' ? 'rgba(231, 76, 60, 0.4)' : 'rgba(120, 120, 120, 0.4)')}`
                        }}
                      >
                        {labelQuality}
                      </span>

                      {/* Calibrated Confidence */}
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted, #8b949e)' }}>
                        Confidence:{' '}
                        <strong style={{ color: '#ffffff', fontFamily: 'monospace' }}>
                          {alert.confidence != null ? `${(alert.confidence * 100).toFixed(0)}%` : 'N/A'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Middle Row: Coordinates + Map Deep Link */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)' }}>
                      <span>
                        Latitude:{' '}
                        <strong style={{ color: '#eceff4', fontFamily: 'monospace' }}>
                          {alert.latitude != null ? alert.latitude.toFixed(4) : 'N/A'}°
                        </strong>
                      </span>
                      <span>
                        Longitude:{' '}
                        <strong style={{ color: '#eceff4', fontFamily: 'monospace' }}>
                          {alert.longitude != null ? alert.longitude.toFixed(4) : 'N/A'}°
                        </strong>
                      </span>
                      {alert.calibrated !== undefined && (
                        <span>
                          Calibrated:{' '}
                          <span style={{ color: alert.calibrated ? '#2ecc71' : 'var(--text-muted, #8b949e)' }}>
                            {alert.calibrated ? '✓' : 'No'}
                          </span>
                        </span>
                      )}
                    </div>

                    {/* View on Map Link */}
                    {alert.latitude != null && alert.longitude != null && (
                      <Link
                        to={`/fire-map?lat=${alert.latitude}&lon=${alert.longitude}&h3=${alert.h3_index || alert.cell_id}`}
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
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#f39c12', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Disclosed Model Caveats:
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {caveats.map((c, i) => (
                          <span
                            key={i}
                            style={{
                              fontSize: '0.75rem',
                              backgroundColor: 'rgba(241, 196, 15, 0.1)',
                              color: '#f39c12',
                              border: '1px solid rgba(241, 196, 15, 0.3)',
                              borderRadius: '4px',
                              padding: '3px 8px'
                            }}
                          >
                            ℹ️ {c}
                          </span>
                        ))}
                        {canonicalCaveat && !caveats.includes(canonicalCaveat) && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              backgroundColor: 'rgba(241, 196, 15, 0.1)',
                              color: '#f39c12',
                              border: '1px solid rgba(241, 196, 15, 0.3)',
                              borderRadius: '4px',
                              padding: '3px 8px'
                            }}
                          >
                            ℹ️ {canonicalCaveat}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Probabilities Toggle & Visual Breakdown */}
                  {probabilities.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--hairline-border, #2e3440)', paddingTop: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setExpandedProbCellId(isProbExpanded ? null : (alert.cell_id || alert.h3_index || idx))}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted, #8b949e)',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: 0
                        }}
                      >
                        <span>{isProbExpanded ? '▲ Hide' : '▼ Inspect'} class distribution ({probabilities.length} classes)</span>
                      </button>

                      {isProbExpanded && (
                        <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          {probabilities.map((item, pIdx) => {
                            const pItemClass = item.class_name;
                            const pColor = CLASS_COLORS[pItemClass] || '#787878';
                            const pPercent = (item.probability * 100).toFixed(1);
                            return (
                              <div key={pIdx} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem' }}>
                                <span style={{ width: '110px', color: '#eceff4', fontWeight: 500 }}>
                                  {CLASS_LABELS[pItemClass] || pItemClass}
                                </span>
                                <div style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px', height: '6px', overflow: 'hidden' }}>
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
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {!loading && !error && filteredAlerts.length > PAGE_SIZE && (
          <div
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
            <span style={{ fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)' }}>
              Showing {((currentPage - 1) * PAGE_SIZE) + 1}–{Math.min(currentPage * PAGE_SIZE, filteredAlerts.length)} of {filteredAlerts.length} alerts
            </span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{
                  padding: '5px 12px',
                  backgroundColor: currentPage === 1 ? 'transparent' : 'rgba(255,255,255,0.08)',
                  color: currentPage === 1 ? 'var(--text-muted, #8b949e)' : '#ffffff',
                  border: '1px solid var(--hairline-border, #2e3440)',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: currentPage === 1 ? 'not-allowed' : 'pointer'
                }}
              >
                Previous
              </button>

              <span style={{ fontSize: '0.8rem', color: '#eceff4', fontFamily: 'monospace', padding: '0 4px' }}>
                {currentPage} / {totalPages}
              </span>

              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{
                  padding: '5px 12px',
                  backgroundColor: currentPage === totalPages ? 'transparent' : 'rgba(255,255,255,0.08)',
                  color: currentPage === totalPages ? 'var(--text-muted, #8b949e)' : '#ffffff',
                  border: '1px solid var(--hairline-border, #2e3440)',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: currentPage === totalPages ? 'not-allowed' : 'pointer'
                }}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
