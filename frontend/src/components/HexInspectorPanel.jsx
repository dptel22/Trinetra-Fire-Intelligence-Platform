import React, { useState } from 'react';
import {
  CLASS_COLORS,
  CLASS_LABELS,
  parseCaveatFlag,
  confidenceLabel,
  deriveClassificationAssessment,
  humanizeAttribution
} from '../services/api';

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
