import React from 'react';
import { CLASS_COLORS, CLASS_LABELS, PRIMARY_CLASSES } from '../services/api';

/**
 * Legend component
 * Visual map legend displaying locked taxonomy colors and optional review thresholds.
 * 
 * Props:
 * - reviewThresholds: Record<string, number> | null
 * - availableClasses: string[] | null
 */
export default function Legend({ reviewThresholds = null, availableClasses = null }) {
  const baseClasses = PRIMARY_CLASSES;
  const showUnclassified = availableClasses
    ? availableClasses.includes('unclassified')
    : false;
  const classes = showUnclassified ? [...baseClasses, 'unclassified'] : baseClasses;

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

          return (
            <div
              key={cls}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-start',
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
                <span style={{ color: 'var(--text-primary, #eceff4)', fontWeight: 500 }}>{label}</span>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
