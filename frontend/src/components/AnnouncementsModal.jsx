import React, { useState, useEffect } from 'react';

const INITIAL_ANNOUNCEMENTS = [
  {
    id: 'ann-1',
    title: 'CatBoost 52-Feature Real-Time Model Operational',
    date: '12 minutes ago',
    category: 'model',
    categoryLabel: 'Model Inference',
    badgeColor: '#FF6B35',
    isNew: true,
    summary: 'The latest CatBoost model checkpoint is actively classifying thermal infrared anomalies across all Indian sectors with enhanced gas flare vs canopy wildfire discrimination.',
    details: [
      'Incorporate 52 spatial, temporal, and radiative power features.',
      'Validated against 14,800+ OSM and WRI registered industrial facility perimeters.',
      'Macro F1 on industrial flare classification increased to 0.94.'
    ]
  },
  {
    id: 'ann-2',
    title: 'NOAA-20 & SNPP VIIRS High-Resolution Pass Ingested',
    date: '1 hour ago',
    category: 'feed',
    categoryLabel: 'Satellite Ingest',
    badgeColor: '#3D9DE8',
    isNew: true,
    summary: 'Afternoon thermal infrared orbital passes from VIIRS (375m I-Band) and MODIS (1km) sensors have been ingested and mapped onto Uber H3 Resolution 8 cells.',
    details: [
      '1,482 active high-temperature pixel clusters ingested across India.',
      'Sub-kilometer spatial aggregation completed in <180ms.',
      'Cloud cover occlusion masking applied over coastal regions.'
    ]
  },
  {
    id: 'ann-3',
    title: 'Dynamic Calibration: Agricultural Stubble Season',
    date: '6 hours ago',
    category: 'system',
    categoryLabel: 'System Calibration',
    badgeColor: '#F1C40F',
    isNew: true,
    summary: 'Seasonal crop residue burning calibration enabled over Punjab and Haryana corridors to prevent transient crop burns from false-triggering industrial infrastructure alerts.',
    details: [
      'Multi-day temporal persistence filter thresholds adjusted.',
      'Dedicated agricultural burn caveats displayed on inspection tooltips.',
      'Active verification ongoing with state disaster management feeds.'
    ]
  },
  {
    id: 'ann-4',
    title: 'Uber H3 Resolution 8 Spatial Grid Join Optimization',
    date: 'Yesterday',
    category: 'system',
    categoryLabel: 'Infrastructure',
    badgeColor: '#2ECC71',
    isNew: false,
    summary: 'Optimized polygon boundary tessellation and client-side bounding box queries for 60fps rendering across dense petrochemical corridors.',
    details: [
      'Zero latency client-side H3 cell polygon boundary rendering.',
      'Unified spatial indexing for refinery, smelter, and mining boundaries.'
    ]
  }
];

export default function AnnouncementsModal({ isOpen, onClose, onClearBadge }) {
  const [filter, setFilter] = useState('all');
  const [announcements, setAnnouncements] = useState(INITIAL_ANNOUNCEMENTS);

  useEffect(() => {
    if (isOpen) {
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMarkAllRead = () => {
    setAnnouncements(prev => prev.map(a => ({ ...a, isNew: false })));
    if (onClearBadge) onClearBadge();
  };

  const filtered = announcements.filter(item => {
    if (filter === 'all') return true;
    return item.category === filter;
  });

  const unreadCount = announcements.filter(a => a.isNew).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.18s ease-out'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--panel-surface)',
          color: 'var(--text-primary)',
          borderRadius: '14px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 65px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--hairline-border)',
          border: '1px solid var(--hairline-border)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{ padding: '1.25rem 1.75rem', borderBottom: '1px solid var(--hairline-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(241, 196, 15, 0.15)',
                  border: '1px solid rgba(241, 196, 15, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F1C40F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>
              <div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.35rem', fontWeight: 800, margin: 0 }}>
                  Platform Announcements
                </h2>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Live model releases, satellite telemetry status, and spatial intelligence updates
                </div>
              </div>
            </div>

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '1.2rem',
                padding: '4px'
              }}
            >
              ✕
            </button>
          </div>

          {/* Controls Bar: Filters + Mark All Read */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {[
                { id: 'all', label: 'All Updates' },
                { id: 'model', label: 'Model' },
                { id: 'feed', label: 'Satellites' },
                { id: 'system', label: 'System' }
              ].map(tab => {
                const active = filter === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setFilter(tab.id)}
                    style={{
                      fontSize: '0.78rem',
                      padding: '0.3rem 0.65rem',
                      borderRadius: '16px',
                      border: '1px solid',
                      borderColor: active ? 'var(--accent-ember)' : 'var(--hairline-border)',
                      backgroundColor: active ? 'rgba(255, 107, 53, 0.12)' : 'transparent',
                      color: active ? 'var(--accent-ember)' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: active ? 700 : 500,
                      fontFamily: 'var(--font-heading)'
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {unreadCount > 0 ? (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-blue)',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '2px 6px'
                }}
              >
                Mark all as read ({unreadCount})
              </button>
            ) : (
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                All caught up
              </span>
            )}
          </div>
        </div>

        {/* Announcements List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.75rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {filtered.map((item) => (
            <div
              key={item.id}
              style={{
                border: '1px solid var(--hairline-border)',
                borderRadius: '10px',
                padding: '1.1rem 1.25rem',
                backgroundColor: item.isNew ? 'rgba(255, 107, 53, 0.04)' : 'transparent',
                borderColor: item.isNew ? 'rgba(255, 107, 53, 0.3)' : 'var(--hairline-border)',
                transition: 'border-color 0.2s ease, background-color 0.2s ease'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: `${item.badgeColor}22`,
                      color: item.badgeColor,
                      fontWeight: 700,
                      fontFamily: 'var(--font-heading)',
                      border: `1px solid ${item.badgeColor}55`
                    }}
                  >
                    {item.categoryLabel}
                  </span>
                  <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    {item.title}
                  </h3>
                  {item.isNew && (
                    <span
                      style={{
                        fontSize: '0.65rem',
                        backgroundColor: 'var(--accent-ember)',
                        color: '#FFFFFF',
                        padding: '1px 6px',
                        borderRadius: '10px',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em'
                      }}
                    >
                      NEW
                    </span>
                  )}
                </div>

                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  {item.date}
                </span>
              </div>

              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0.4rem 0 0.6rem 0' }}>
                {item.summary}
              </p>

              {item.details && (
                <div style={{ borderTop: '1px dashed var(--hairline-border)', paddingTop: '0.5rem', marginTop: '0.5rem' }}>
                  <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                    {item.details.map((bullet, bIdx) => (
                      <li key={bIdx} style={{ marginBottom: '0.2rem' }}>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: '0.85rem 1.75rem',
            borderTop: '1px solid var(--hairline-border)',
            backgroundColor: 'rgba(0,0,0,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: 'var(--text-muted)'
          }}
        >
          <span>Telemetry feeds stream from ISRO & NASA FIRMS gateways</span>
          <button
            onClick={onClose}
            style={{
              padding: '0.4rem 1rem',
              backgroundColor: 'var(--panel-surface)',
              border: '1px solid var(--hairline-border)',
              borderRadius: '6px',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              fontWeight: 600,
              fontFamily: 'var(--font-heading)'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
