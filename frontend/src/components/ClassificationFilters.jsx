import React from 'react';
import { CLASS_COLORS, CLASS_LABELS, PRIMARY_CLASSES } from '../services/api';

/**
 * ClassificationFilters component
 * Renders toggle buttons for classes present in the current dataset.
 * 
 * Props:
 * - availableClasses: string[] (List of distinct classes in the current view/dataset)
 * - activeClasses: Set<string> | string[] (Currently active filter classes)
 * - onToggle: (className: string) => void
 */
export default function ClassificationFilters({
  availableClasses = [],
  activeClasses = new Set(),
  onToggle = () => {}
}) {
  const isClassActive = (cls) => {
    if (activeClasses instanceof Set) {
      return activeClasses.has(cls);
    }
    if (Array.isArray(activeClasses)) {
      return activeClasses.includes(cls);
    }
    return true;
  };

  const present = new Set(availableClasses || []);
  const classes = [...PRIMARY_CLASSES];
  if (present.has('unclassified')) classes.push('unclassified');

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '0.75rem',
        backgroundColor: 'var(--panel-surface, #1e222a)',
        border: '1px solid var(--hairline-border, #2e3440)',
        borderRadius: '8px'
      }}
    >
      <div
        style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--text-muted, #8b949e)',
          marginBottom: '0.25rem'
        }}
      >
        Classification Filters
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {classes.map((cls) => {
          const active = isClassActive(cls);
          const color = CLASS_COLORS[cls] || '#787878';
          const label = CLASS_LABELS[cls] || cls;

          return (
            <button
              key={cls}
              type="button"
              onClick={() => onToggle(cls)}
              aria-pressed={active}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: active ? 600 : 400,
                border: `1px solid ${active ? color : 'var(--hairline-border, #3b4252)'}`,
                backgroundColor: active ? `${color}22` : 'transparent',
                color: active ? 'var(--text-primary, #eceff4)' : 'var(--text-muted, #8b949e)',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              title={`${active ? 'Hide' : 'Show'} ${label}`}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: color,
                  opacity: active ? 1 : 0.4
                }}
              />
              <span>{active ? '✓ ' : ''}{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
