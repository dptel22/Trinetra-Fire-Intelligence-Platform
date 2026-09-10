import React from 'react';
import { CLASS_COLORS, KNOWN_CAVEATS } from '../services/api';

/**
 * DataReliabilityBlock component
 * Transparent and honest model reliability breakdown.
 * Uses real backend review thresholds and canonical caveats without synthetic accuracy figures.
 * 
 * Props:
 * - reviewThresholds: Record<string, number> | null
 */
export default function DataReliabilityBlock({ reviewThresholds = null }) {
  const getThresholdDisplay = (cls, defaultVal) => {
    const val = reviewThresholds?.[cls] ?? defaultVal;
    return `${(val * 100).toFixed(0)}%`;
  };

  return (
    <div
      style={{
        backgroundColor: 'var(--panel-surface, #1e222a)',
        border: '1px solid var(--hairline-border, #2e3440)',
        borderRadius: '8px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        textAlign: 'left'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            fontFamily: 'var(--font-heading, system-ui, sans-serif)',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted, #8b949e)'
          }}
        >
          Model Reliability &amp; Review Thresholds
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.82rem', color: 'var(--text-muted, #abb2bf)', lineHeight: 1.5 }}>
        {/* Industrial */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: CLASS_COLORS.industrial,
              marginTop: 5,
              flexShrink: 0
            }}
          />
          <div>
            <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Industrial Facility:</strong> High labeled ground truth support from mapped facility overlays. Predictions are sent for analyst review below {getThresholdDisplay('industrial', 0.70)} confidence.
          </div>
        </div>

        {/* Wildfire */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: CLASS_COLORS.wildfire,
              marginTop: 5,
              flexShrink: 0
            }}
          />
          <div>
            <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Wildfire:</strong> Forest and open-land fire signature class with strong FRP-based evidence. Predictions are sent for analyst review below {getThresholdDisplay('wildfire', 0.70)} confidence.
          </div>
        </div>

        {/* Mining */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: CLASS_COLORS.mining,
              marginTop: 5,
              flexShrink: 0
            }}
          />
          <div>
            <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Mining / Smelter:</strong> {KNOWN_CAVEATS.mining} Calibrated analyst-review threshold is {getThresholdDisplay('mining', 0.85)} confidence.
          </div>
        </div>

        {/* Agricultural Burn */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: CLASS_COLORS.agricultural_burn,
              marginTop: 5,
              flexShrink: 0
            }}
          />
          <div>
            <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Agricultural Burn:</strong> All predictions require human analyst review while the distance-based rule is under active refinement.
          </div>
        </div>

        {/* Fallback Unclassified */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: CLASS_COLORS.unclassified,
              marginTop: 5,
              flexShrink: 0
            }}
          />
          <div>
            <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Unclassified Fallback:</strong> Low-confidence fallback class for thermal hotspots that do not meet classification confidence criteria, preventing false-alarm operational actions.
          </div>
        </div>
      </div>
    </div>
  );
}
