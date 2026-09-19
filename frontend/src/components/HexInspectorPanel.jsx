import React, { useEffect, useState } from 'react';
import {
  CLASS_COLORS,
  CLASS_LABELS,
  REGIME_LABELS,
  REGIME_COLORS,
  parseCaveatFlag,
  confidenceLabel,
  deriveClassificationAssessment,
  humanizeAttribution,
  fetchCellTimeline
} from '../services/api';
import { StatusBadge } from './FireAlertsPage';

/**
 * HexInspectorPanel component
 * Detailed inspection panel for a selected H3 hexagon cell.
 * 
 * Props:
 * - cell: PredictionResponse | null
 * - onRequestExplanation: () => void
 * - explanation: ExplanationResponse | null
 * - loadingExplanation: boolean
 */
export default function HexInspectorPanel({
  cell,
  onRequestExplanation = () => {},
  explanation = null,
  loadingExplanation = false
}) {
  const [isExplainOpen, setIsExplainOpen] = useState(false);
  const [timeline, setTimeline] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState(null);
  const [timelineGranularity, setTimelineGranularity] = useState('month');

  useEffect(() => {
    const h3 = cell?.cell_id || cell?.h3_index;
    if (!h3 || cell?.notFound) {
      // eslint-disable-next-line react/set-state-in-effect
      setTimeline(null);
      return undefined;
    }
    let active = true;
    setTimelineLoading(true);
    setTimelineError(null);
    const limits = { day: 60, month: 24, year: 10 };
    fetchCellTimeline(h3, { granularity: timelineGranularity, limit: limits[timelineGranularity] })
      .then((value) => { if (active) setTimeline(value); })
      .catch((error) => { if (active) setTimelineError(error.message || 'Timeline unavailable'); })
      .finally(() => { if (active) setTimelineLoading(false); });
    return () => { active = false; };
  }, [cell?.cell_id, cell?.h3_index, cell?.notFound, timelineGranularity]);

  if (!cell) {
    return (
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: 'var(--panel-surface, #1e222a)',
          border: '1px solid var(--hairline-border, #2e3440)',
          borderRadius: '8px',
          color: 'var(--text-muted, #8b949e)',
          fontSize: '0.85rem',
          textAlign: 'center'
        }}
      >
        <p style={{ margin: 0 }}>Select a hexagon hotspot on the map to inspect predictions & model explanations.</p>
      </div>
    );
  }

  if (cell.notFound) {
    return (
      <div
        style={{
          padding: '1.25rem',
          backgroundColor: 'var(--panel-surface, #1e222a)',
          border: '1px solid var(--hairline-border, #2e3440)',
          borderRadius: '8px',
          color: 'var(--text-muted, #8b949e)',
          fontSize: '0.85rem',
          textAlign: 'left'
        }}
      >
        <h4 style={{ color: 'var(--text-primary)', margin: '0 0 6px 0', fontSize: '1rem', fontFamily: 'var(--font-heading)' }}>
          {cell.name || 'Location Inspected'}
        </h4>
        {cell.latitude != null && cell.longitude != null && (
          <p style={{ margin: '0 0 10px 0', fontSize: '0.78rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>
            [{cell.latitude.toFixed(4)}, {cell.longitude.toFixed(4)}]
          </p>
        )}
        <div
          style={{
            backgroundColor: 'rgba(231, 76, 60, 0.12)',
            border: '1px solid rgba(231, 76, 60, 0.35)',
            borderRadius: '6px',
            padding: '10px 12px',
            color: '#e74c3c',
            fontSize: '0.85rem',
            fontWeight: 600,
            lineHeight: 1.4
          }}
        >
          No model prediction available for this location today.
        </div>
        <p style={{ margin: '8px 0 0 0', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          No active thermal anomaly was detected during the latest VIIRS/MODIS satellite passes over this coordinate.
        </p>
      </div>
    );
  }

  const predictedClass = cell.predicted_class || 'unclassified';
  const classColor = CLASS_COLORS[predictedClass] || '#787878';
  const classLabel = CLASS_LABELS[predictedClass] || predictedClass;
  const labelQuality = confidenceLabel(cell);
  const caveats = parseCaveatFlag(cell.caveat_flag);
  const assessment = deriveClassificationAssessment(cell, explanation || {});
  const persistence = explanation?.persistence;
  const persistenceBadge = {
    persistent_source: { label: 'Persistent source', color: '#2ecc71' },
    new_event: { label: 'New activity', color: '#f1c40f' },
    unknown_provenance: { label: 'Unknown', color: '#a0a0a0' }
  }[persistence?.event_type];
  const miningSubtype = explanation?.mining_subtype;

  // Sort probabilities descending
  const sortedProbabilities = Array.isArray(cell.probabilities)
    ? cell.probabilities.slice().sort((a, b) => b.probability - a.probability)
    : [];

  const handleToggleExplain = () => {
    const nextState = !isExplainOpen;
    setIsExplainOpen(nextState);
    if (nextState && !explanation && !loadingExplanation) {
      onRequestExplanation();
    }
  };

  // Badge styling based on qualitative confidence label
  const getBadgeStyle = (label) => {
    switch (label) {
      case 'High confidence':
        return {
          backgroundColor: 'rgba(46, 204, 113, 0.15)',
          color: '#2ecc71',
          border: '1px solid rgba(46, 204, 113, 0.4)'
        };
      case 'Needs review':
        return {
          backgroundColor: 'rgba(231, 76, 60, 0.15)',
          color: '#e74c3c',
          border: '1px solid rgba(231, 76, 60, 0.4)'
        };
      case 'Uncertain':
      default:
        return {
          backgroundColor: 'rgba(120, 120, 120, 0.15)',
          color: '#a0a0a0',
          border: '1px solid rgba(120, 120, 120, 0.4)'
        };
    }
  };

  const badgeStyle = getBadgeStyle(labelQuality);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1.25rem',
        backgroundColor: 'var(--panel-surface, #1e222a)',
        border: '1px solid var(--hairline-border, #2e3440)',
        borderRadius: '8px',
        textAlign: 'left',
        color: 'var(--text-primary)'
      }}
    >
      {/* Header with Class Swatch & Primary Qualitative Badge */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              width: '14px',
              height: '14px',
              borderRadius: '3px',
              backgroundColor: classColor,
              flexShrink: 0
            }}
          />
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              {classLabel}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', fontFamily: 'monospace' }}>
              {cell.cell_id || cell.h3_index}
            </div>
          </div>
        </div>

        <span
          style={{
            padding: '3px 8px',
            borderRadius: '12px',
            fontSize: '0.72rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            ...badgeStyle
          }}
        >
          {labelQuality}
        </span>
      </div>

      {/* Simulated / Demo Badge */}
      {cell.is_synthetic && (
        <div
          style={{
            backgroundColor: 'rgba(241, 196, 15, 0.15)',
            color: '#F1C40F',
            border: '1px solid rgba(241, 196, 15, 0.5)',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <span>⚠️</span>
          <span>SIMULATED DATA — Offline Demonstration Hotspot</span>
        </div>
      )}

      {/* Thermal Regime (mechanical trailing-activity read, not a model output) */}
      {cell.thermal_regime && REGIME_LABELS[cell.thermal_regime] && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #8b949e)' }}>
            Thermal Regime
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                backgroundColor: `${REGIME_COLORS[cell.thermal_regime] || '#787878'}22`,
                color: REGIME_COLORS[cell.thermal_regime] || '#787878',
                border: `1px solid ${REGIME_COLORS[cell.thermal_regime] || '#787878'}66`
              }}
            >
              {REGIME_LABELS[cell.thermal_regime]}
            </span>
            {cell.thermal_regime_basis && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)' }}>
                {cell.thermal_regime_basis}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Caveat Chips (if any) */}
      {caveats.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #8b949e)' }}>
            Model Caveats
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {caveats.map((caveat, idx) => (
              <div
                key={idx}
                style={{
                  backgroundColor: 'rgba(241, 196, 15, 0.12)',
                  color: '#f39c12',
                  border: '1px solid rgba(241, 196, 15, 0.3)',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '0.75rem',
                  lineHeight: 1.3
                }}
              >
                ⚠️ {caveat}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--hairline-border, #2e3440)', paddingTop: '0.75rem' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #8b949e)', marginBottom: '6px' }}>
          {timeline?.materialization_status === 'materialized' && timeline.materialized_start_date && timeline.materialized_end_date &&
            (new Date(timeline.materialized_end_date) - new Date(timeline.materialized_start_date)) >= (5 * 365.25 * 24 * 60 * 60 * 1000)
            ? 'Five-Year Thermal History'
            : 'Recent Thermal History'}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }} aria-label="Timeline granularity">
          {['day', 'month', 'year'].map((granularity) => (
            <button
              key={granularity}
              type="button"
              aria-pressed={timelineGranularity === granularity}
              onClick={() => setTimelineGranularity(granularity)}
              style={{
                border: '1px solid var(--hairline-border, #2e3440)',
                borderRadius: '4px',
                padding: '3px 8px',
                background: timelineGranularity === granularity ? 'rgba(61, 157, 232, 0.2)' : 'transparent',
                color: timelineGranularity === granularity ? 'var(--text-primary)' : 'var(--text-muted, #8b949e)',
                fontSize: '0.68rem',
                textTransform: 'uppercase',
                cursor: 'pointer'
              }}
            >
              {granularity}
            </button>
          ))}
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.4, marginBottom: '8px' }}>
          Thermal evidence only. Current OSM/WRI context is not historical land-use evidence.
        </div>
        {!timelineLoading && !timelineError && timeline && (timeline.fallback_used || timeline.materialization_status !== 'materialized') && (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: 'rgba(26, 18, 8, 0.96)',
              color: '#F1C40F',
              border: '1.5px solid #F1C40F',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '0.72rem',
              fontWeight: 700,
              letterSpacing: '0.03em',
              lineHeight: 1.35,
              marginBottom: '8px'
            }}
          >
            <span
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                backgroundColor: '#F1C40F',
                boxShadow: '0 0 8px #F1C40F',
                display: 'inline-block',
                flexShrink: 0,
                animation: 'offlinePulse 1.6s ease-in-out infinite'
              }}
            />
            <span>
              DEGRADED — UNVALIDATED FALLBACK. This history is served from the raw h3_daily store
              ({timeline.materialization_status}), not validated materialized layers. Do not read as confirmed history.
            </span>
          </div>
        )}
        {timelineLoading && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Loading history…</div>}
        {!timelineLoading && timelineError && <div role="status" style={{ fontSize: '0.75rem', color: '#f1c40f' }}>{timelineError}</div>}
        {!timelineLoading && !timelineError && timeline?.rows?.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {timeline.rows.slice().reverse().map((row) => (
              <div key={`${row.period_type}-${row.period}`} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '0.72rem', fontFamily: 'monospace' }}>
                  <span style={{ color: 'var(--text-primary)' }}>{row.period}{row.partial ? ' *' : ''}</span>
                  <span style={{ color: 'var(--text-muted)' }}>
                    {row.observation_basis === 'detections' ? `${row.fire_days} active days · ${row.n_detections} detections` : 'No detections in ingested archive'}
                  </span>
                </div>
                <div style={{ height: '5px', borderRadius: '3px', backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(4, Number(row.n_detections || 0) * 4))}%`, height: '100%', backgroundColor: row.transition_type === 'seasonal_to_persistent' ? '#E67E22' : '#3d9de8', borderRadius: '3px' }} />
                </div>
                {row.transition_type && row.transition_type !== 'stable' && row.transition_type !== 'insufficient_history' && (
                  <span style={{ alignSelf: 'flex-start', padding: '2px 6px', borderRadius: '10px', backgroundColor: 'rgba(230, 126, 34, 0.15)', color: '#E67E22', fontSize: '0.65rem' }}>
                    {row.transition_type.replaceAll('_', ' ')} · {row.transition_confidence || 'low'}
                  </span>
                )}
              </div>
            ))}
            {timeline.archive_range_limited && <div style={{ color: '#f1c40f', fontSize: '0.7rem' }}>Archive range is limited; this is not five-year coverage.</div>}
          </div>
        )}
        {!timelineLoading && !timelineError && timeline && timeline.rows.length === 0 && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No FIRMS history is available for this cell.</div>
        )}

        <div style={{ borderTop: '1px solid var(--hairline-border, #2e3440)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #8b949e)', marginBottom: '6px' }}>
            Current OSM/WRI Context
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)' }}>present-day snapshot</span>
            <StatusBadge status="LIVE" labelPrefix="Context vintage" />
          </div>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.4 }}>
            Thermal evidence only. Current OSM/WRI context is not historical land-use evidence.
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--hairline-border, #2e3440)', marginTop: '0.75rem', paddingTop: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #8b949e)', marginBottom: '6px' }}>
            Historical Land-Use Context
          </div>
          {timeline?.context?.historical_context_available === true ? (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>Historical land-use evidence is available for this cell.</div>
          ) : (
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.4 }}>
              Historical OSM/WRI land-use evidence unavailable; showing present-day context only.
            </div>
          )}
        </div>
      </div>

      {/* Probabilities Distribution Horizontal Bars */}
      {sortedProbabilities.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted, #8b949e)' }}>
            Predicted Class Distribution
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {sortedProbabilities.map((prob) => {
              const pColor = CLASS_COLORS[prob.class_name] || '#787878';
              const pLabel = CLASS_LABELS[prob.class_name] || prob.class_name;
              const pct = (prob.probability * 100).toFixed(1);

              return (
                <div key={prob.class_name} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: prob.class_name === predictedClass ? 'var(--text-primary)' : 'var(--text-muted, #8b949e)' }}>
                      {pLabel}
                    </span>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{pct}%</span>
                  </div>
                  <div
                    style={{
                      height: '5px',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        backgroundColor: pColor,
                        borderRadius: '3px'
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expandable Explanation Section ("Why this label?") */}
      <div
        style={{
          borderTop: '1px solid var(--hairline-border, #2e3440)',
          paddingTop: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}
      >
        <button
          type="button"
          onClick={handleToggleExplain}
          style={{
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--accent-primary, #61afef)',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            textAlign: 'left'
          }}
        >
          <span>{isExplainOpen ? '▼ Hide Feature Explanation' : '► Why this label? (SHAP Analysis)'}</span>
          {loadingExplanation && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted, #8b949e)' }}>Computing...</span>}
        </button>

        {isExplainOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            {loadingExplanation && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', fontStyle: 'italic' }}>
                Fetching defense-grade SHAP attribution vectors...
              </div>
            )}

            {!loadingExplanation && explanation && explanation.feature_attributions && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div className="classification-assessment">
                  <div className="classification-assessment-title">Classification assessment</div>
                  <div><strong>Primary class:</strong> {assessment.primaryClass}</div>
                  <div><strong>Likely gas flare:</strong> <span className={`assessment-${assessment.gasFlare.toLowerCase().replace(/\s+/g, '-')}`}>{assessment.gasFlare}</span></div>
                  <div><strong>Likely wildfire:</strong> <span className={`assessment-${assessment.wildfire.toLowerCase().replace(/\s+/g, '-')}`}>{assessment.wildfire}</span></div>
                  <div className="classification-assessment-note">{assessment.note}</div>
                </div>
                {persistenceBadge && persistence && (
                  <div
                    style={{
                      border: `1px solid ${persistenceBadge.color}66`,
                      backgroundColor: `${persistenceBadge.color}14`,
                      borderRadius: '6px',
                      padding: '7px 9px',
                      fontSize: '0.75rem'
                    }}
                  >
                    <div style={{ color: persistenceBadge.color, fontWeight: 700 }}>
                      {persistenceBadge.label}
                    </div>
                    {persistence.description && (
                      <div style={{ color: 'var(--text-muted)', marginTop: '3px', lineHeight: 1.3 }}>
                        {persistence.description}
                      </div>
                    )}
                  </div>
                )}
                {miningSubtype && (
                  <div
                    style={{
                      alignSelf: 'flex-start',
                      border: '1px solid rgba(97, 175, 239, 0.35)',
                      backgroundColor: 'rgba(97, 175, 239, 0.1)',
                      borderRadius: '999px',
                      padding: '4px 8px',
                      color: '#61afef',
                      fontSize: '0.72rem',
                      fontWeight: 700
                    }}
                  >
                    {miningSubtype.subtype === 'underground' ? 'Underground mining' : 'Surface mining'}
                    {' · '}
                    {Number(miningSubtype.nearest_km).toFixed(1)} km
                  </div>
                )}
                {explanation.summary_statement && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: '2px' }}>
                    {explanation.summary_statement}
                  </div>
                )}
                {explanation.feature_attributions.slice(0, 3).map((attr, idx) => (
                  <div
                    key={idx}
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.03)',
                      borderLeft: `2px solid ${parseFloat(attr.shap_value ?? attr.contribution) > 0 ? '#98c379' : '#e06c75'}`,
                      padding: '4px 8px',
                      borderRadius: '0 4px 4px 0',
                      fontSize: '0.75rem'
                    }}
                  >
                    <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.72rem' }}>
                      {humanizeAttribution(attr).name} — {humanizeAttribution(attr).direction} ({attr.contribution})
                    </div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px', lineHeight: 1.3 }}>
                      {humanizeAttribution(attr).detail} <span className="feature-audit">Raw: {attr.feature_name} = {attr.feature_value}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!loadingExplanation && (!explanation || !explanation.feature_attributions) && (
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>
                No feature attribution data returned for this cell.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Supporting Metadata (Coordinates, Latency, Calibration) */}
      <div
        style={{
          borderTop: '1px solid var(--hairline-border, #2e3440)',
          paddingTop: '0.5rem',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          fontSize: '0.7rem',
          color: 'var(--text-muted, #8b949e)',
          fontFamily: 'monospace'
        }}
      >
        {cell.latitude != null && cell.longitude != null && (
          <span>Lat: {Number(cell.latitude).toFixed(4)}, Lon: {Number(cell.longitude).toFixed(4)}</span>
        )}
        {cell.latency_ms !== undefined && (
          <span>Inference: {cell.latency_ms}ms</span>
        )}
        {cell.calibrated && <span>Calibrated: Yes</span>}
      </div>
    </div>
  );
}
