import React, { useState } from 'react';
import Header from './Header';
import { FIRE_COLORS, FIRE_LABELS, FIRE_CAVEATS } from '../services/api';

const ALERTS_FEED = [
  {
    id: 'ALT-IND-9910',
    h3_index: '88209a2011fffff',
    predicted_class: 'industrial',
    location: 'Jamnagar Petrochemical Complex, Gujarat',
    confidence: 0.96,
    timestamp: '2025-01-26 14:22 UTC',
    status: 'Persistent high-temperature thermal anomaly near critical refinery unit',
    asset_distance: '420m from storage tank boundary'
  },
  {
    id: 'ALT-IND-9912',
    h3_index: '88209b1045fffff',
    predicted_class: 'industrial',
    location: 'Paradip Port Bulk Storage Terminal, Odisha',
    confidence: 0.92,
    timestamp: '2025-01-26 13:45 UTC',
    status: 'Thermal flare signature detected adjacent to chemical logistics zone',
    asset_distance: '850m from port perimeter'
  },
  {
    id: 'ALT-WILD-4410',
    h3_index: '88209c8829fffff',
    predicted_class: 'wildfire',
    location: 'Shimla Ridge Forest Division, Himachal Pradesh',
    confidence: 0.94,
    timestamp: '2025-01-26 12:10 UTC',
    status: 'Rapidly spreading canopy thermal anomaly in dry pine forest sector',
    asset_distance: '3.2km from township boundary'
  },
  {
    id: 'ALT-MINE-3321',
    h3_index: '88209d9910fffff',
    predicted_class: 'mining',
    confidence: 0.81,
    timestamp: '2025-01-26 10:30 UTC',
    status: 'Thermal detection over active open-cast pit seam',
    asset_distance: '1.4km from overburden dump'
  },
  {
    id: 'ALT-AGRI-1102',
    h3_index: '88209e5522fffff',
    predicted_class: 'agricultural_burn',
    confidence: 0.58,
    timestamp: '2025-01-26 09:15 UTC',
    status: 'Low-intensity stubble burning cluster in crop residue field',
    asset_distance: 'Agricultural zone'
  },
  {
    id: 'ALT-UNC-0081',
    h3_index: '88209f7711fffff',
    predicted_class: 'unclassified',
    confidence: 0.48,
    timestamp: '2025-01-26 08:00 UTC',
    status: 'Thermal anomaly confidence below server classification threshold',
    asset_distance: 'Unclassified perimeter'
  }
];

export default function FireAlertsPage() {
  const [selectedClass, setSelectedClass] = useState('all');

  const filteredAlerts = selectedClass === 'all'
    ? ALERTS_FEED
    : ALERTS_FEED.filter(a => a.predicted_class === selectedClass);

  return (
    <div style={{ backgroundColor: 'var(--bg-dark)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '3rem 2rem', width: '100%', textAlign: 'left' }}>
        {/* Page Title */}
        <div style={{ marginBottom: '2rem' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent-blue)' }}>
            Real-Time Intelligence Broadcast
          </span>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.25rem', color: 'var(--text-primary)', marginTop: '4px' }}>
            Infrastructure Fire Alerts
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', marginTop: '6px' }}>
            Notifications for new or persistent thermal sources near critical infrastructure, classified automatically by TRINETRA.
          </p>
        </div>

        {/* Filter Row */}
        <div 
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            marginBottom: '1.5rem',
            padding: '12px 16px',
            backgroundColor: 'var(--panel-surface)',
            border: '1px solid var(--hairline-border)',
            borderRadius: '8px'
          }}
        >
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', fontWeight: 600, marginRight: '8px' }}>
            FILTER BY CLASS:
          </span>

          <button
            onClick={() => setSelectedClass('all')}
            style={{
              background: selectedClass === 'all' ? 'rgba(234, 237, 240, 0.15)' : 'transparent',
              color: selectedClass === 'all' ? 'var(--text-primary)' : 'var(--text-muted)',
              border: '1px solid var(--hairline-border)',
              borderRadius: '20px',
              padding: '4px 12px',
              fontSize: '0.8rem',
              fontFamily: 'var(--font-heading)',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            All Alerts ({ALERTS_FEED.length})
          </button>

          {['industrial', 'wildfire', 'mining', 'agricultural_burn', 'unclassified'].map(cls => {
            const count = ALERTS_FEED.filter(a => a.predicted_class === cls).length;
            const isUnclass = cls === 'unclassified';
            return (
              <button
                key={cls}
                onClick={() => setSelectedClass(cls)}
                style={{
                  background: selectedClass === cls ? FIRE_COLORS[cls] : 'transparent',
                  color: selectedClass === cls ? '#0A0E12' : (isUnclass ? 'var(--text-muted)' : 'var(--text-primary)'),
                  border: `1px solid ${selectedClass === cls ? FIRE_COLORS[cls] : 'var(--hairline-border)'}`,
                  borderRadius: '20px',
                  padding: '4px 12px',
                  fontSize: '0.8rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  opacity: isUnclass ? 0.75 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: FIRE_COLORS[cls] }} />
                {cls === 'industrial' ? 'Industrial' : cls === 'agricultural_burn' ? 'Agri Burn' : cls} ({count})
              </button>
            );
          })}
        </div>

        {/* Alerts Feed List (Flat Surfaces, Hairline Borders) */}
        {filteredAlerts.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredAlerts.map(alert => {
              const color = FIRE_COLORS[alert.predicted_class] || FIRE_COLORS.unclassified;
              const isUnclass = alert.predicted_class === 'unclassified';

              return (
                <div
                  key={alert.id}
                  style={{
                    backgroundColor: 'var(--panel-surface)',
                    border: '1px solid var(--hairline-border)',
                    borderRadius: '8px',
                    padding: '1.25rem 1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    opacity: isUnclass ? 0.7 : 1
                  }}
                >
                  {/* Top Row: Color Swatch + Class Label + Confidence + Timestamp */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1rem', color: color }}>
                        {FIRE_LABELS[alert.predicted_class]}
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        [{alert.h3_index}]
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        Confidence: <strong style={{ color: 'var(--text-primary)' }}>{(alert.confidence * 100).toFixed(0)}%</strong>
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {alert.timestamp}
                      </span>
                    </div>
                  </div>

                  {/* Location & Status Line */}
                  <div>
                    <h4 style={{ fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {alert.location}
                    </h4>
                    <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                      {alert.status} — <em style={{ color: 'var(--text-primary)' }}>{alert.asset_distance}</em>
                    </p>
                  </div>

                  {/* Caveat Flags */}
                  {FIRE_CAVEATS[alert.predicted_class] && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--hairline-border)', paddingTop: '6px' }}>
                      ℹ️ Note: {FIRE_CAVEATS[alert.predicted_class]}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Plain Muted Text Empty State */
          <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.95rem' }}>
            No thermal alerts match the selected classification filter.
          </div>
        )}
      </main>
    </div>
  );
}
