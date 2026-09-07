import React from 'react';
import { FIRE_COLORS } from '../services/api';

export default function DataReliabilityBlock() {
  return (
    <div 
      style={{
        backgroundColor: 'var(--panel-surface)',
        border: '1px solid var(--hairline-border)',
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
            fontFamily: 'var(--font-heading)',
            fontSize: '0.75rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)'
          }}
        >
          About This Data · Model Reliability
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: FIRE_COLORS.industrial, marginTop: 5, flexShrink: 0 }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Industrial & Wildfire:</strong> Highly reliable (Macro F1 &gt; 0.90). Grounded in spatial land-cover and facility boundary overlays.
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: FIRE_COLORS.mining, marginTop: 5, flexShrink: 0 }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Mining & Smelter:</strong> Based on a limited ground-truth sample size. Accuracy is expressed as a confidence interval (e.g. 74% ± 8%).
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: FIRE_COLORS.agricultural_burn, marginTop: 5, flexShrink: 0 }} />
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Agricultural Burn:</strong> Unreliable / Under active development. Relies on an unvalidated single distance-threshold labeling rule.
          </div>
        </div>
      </div>
    </div>
  );
}
