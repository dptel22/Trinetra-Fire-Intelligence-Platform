import React from 'react';
import { CLASS_COLORS, CLASS_LABELS } from '../services/api';

/**
 * Legend component
 * Visual map legend displaying locked taxonomy colors and optional review thresholds.
 * 
 * Props:
 * - reviewThresholds: Record<string, number> | null
 */
export default function Legend({ reviewThresholds = null }) {
  const classes = ['industrial', 'mining', 'agricultural_burn', 'wildfire', 'unclassified'];

  const getThresholdText = (cls) => {
    if (cls === 'unclassified') {
      return 'Abstention fallback';
    }
    if (cls === 'agricultural_burn') {
      return 'Threshold 1.01 (Always reviewed)';
    }
    if (reviewThresholds && reviewThresholds[cls] !== undefined) {
      return `Reviewed below ${(reviewThresholds[cls] * 100).toFixed(0)}% conf`;
    }
    if (cls === 'mining') {
      return 'Reviewed below 85% conf';
    }
    if (cls === 'industrial' || cls === 'wildfire') {
      return 'Reviewed below 70% conf';
    }
    return null;
  };

  return (
    <div
      style={{
        padding: '0.85rem',
        backgroundColor: 'var(--panel-surface, #1e222a)',
        border: '1px solid var(--hairline-border, #2e3440)',
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        textAlign: 'left'
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted, #8b949e)'
        }}
      >
        Classification Legend
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
        {classes.map((cls) => {
          const color = CLASS_COLORS[cls] || '#787878';
          const label = CLASS_LABELS[cls] || cls;
          const thresholdHint = getThresholdText(cls);

          return (
            <div
              key={cls}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '0.78rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: color,
                    flexShrink: 0
                  }}
                />
                <span style={{ color: '#eceff4', fontWeight: 500 }}>{label}</span>
              </div>

              {thresholdHint && (
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: cls === 'agricultural_burn' ? '#f39c12' : 'var(--text-muted, #8b949e)',
                    fontFamily: 'monospace'
                  }}
                >
                  {thresholdHint}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
