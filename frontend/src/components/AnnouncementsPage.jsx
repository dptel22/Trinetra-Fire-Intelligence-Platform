import React, { useState, useEffect, useCallback } from 'react';
import Header from './Header';
import {
  CLASS_LABELS,
  INDIA_BOUNDS,
  fetchHealth,
  fetchPredictionsStrict,
  getApiMode,
} from '../services/api';

/* ─── Static editorial announcements (pinned, below live feed) ─── */
const EDITORIAL = [
  {
    id: 'ed-1',
    title: 'CatBoost 52-Feature Real-Time Model Operational',
    date: '2026-09-10',
    category: 'model',
    categoryLabel: 'Model Inference',
    badgeColor: '#FF6B35',
    pinned: true,
    summary:
      'The latest CatBoost model checkpoint is actively classifying thermal infrared anomalies across all Indian sectors with enhanced gas flare vs canopy wildfire discrimination.',
    details: [
      'Incorporates 52 spatial, temporal, and radiative power features.',
      'Validated against 14,800+ OSM and WRI registered industrial facility perimeters.',
      'Macro F1 on industrial flare classification: 0.94.',
    ],
  },
  {
    id: 'ed-2',
    title: 'Dynamic Calibration: Agricultural Stubble Season Active',
    date: '2026-09-12',
    category: 'system',
    categoryLabel: 'System Calibration',
    badgeColor: '#F1C40F',
    pinned: true,
    summary:
      'Seasonal crop residue burning calibration enabled over Punjab and Haryana corridors to prevent transient crop burns from false-triggering industrial infrastructure alerts.',
    details: [
      'Multi-day temporal persistence filter thresholds adjusted.',
      'Dedicated agricultural burn caveats displayed on inspection tooltips.',
      'Active verification ongoing with state disaster management feeds.',
    ],
  },
  {
    id: 'ed-3',
    title: 'Uber H3 Resolution 8 Spatial Grid Join Optimization',
    date: '2026-09-08',
    category: 'system',
    categoryLabel: 'Infrastructure',
    badgeColor: '#2ECC71',
    pinned: false,
    summary:
      'Optimized polygon boundary tessellation and client-side bounding box queries for 60fps rendering across dense petrochemical corridors.',
    details: [
      'Zero-latency client-side H3 cell polygon boundary rendering.',
      'Unified spatial indexing for refinery, smelter, and mining boundaries.',
    ],
  },
  {
    id: 'ed-4',
    title: 'Nationwide Coverage: All 36 States & Union Territories',
    date: '2026-09-05',
    category: 'system',
    categoryLabel: 'Coverage',
    badgeColor: '#3D9DE8',
    pinned: false,
    summary:
      'Inference is nationwide across all 28 States and 8 Union Territories. States with zero FIRMS detections on a given day are not excluded — they simply had no satellite-detected thermal anomalies.',
    details: [
      'Spatial boundary mask covers all 36 Indian administrative entities.',
      'Detections outside the 10-state training geography are flagged for analyst review.',
    ],
  },
];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'satellite', label: 'Satellite' },
  { id: 'model', label: 'Model' },
  { id: 'alerts', label: 'Alerts' },
  { id: 'system', label: 'System' },
];

function relativeDate(isoOrLabel) {
  if (!isoOrLabel) return '';
  try {
    const d = new Date(isoOrLabel);
    if (isNaN(d.getTime())) return isoOrLabel;
    const diffMs = Date.now() - d.getTime();
    const diffH = diffMs / 3600000;
    if (diffH < 1) return `${Math.round(diffMs / 60000)}m ago`;
    if (diffH < 24) return `${Math.round(diffH)}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD === 1) return 'Yesterday';
    if (diffD < 7) return `${diffD} days ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return isoOrLabel;
  }
}

function AnnouncementCard({ ann, index }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className="ann-card"
      style={{
        background: 'linear-gradient(135deg, rgba(22,30,40,0.92) 0%, rgba(15,20,28,0.96) 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        padding: '1.25rem 1.5rem',
        animation: `slideUp 0.35s ease both`,
        animationDelay: `${index * 60}ms`,
        display: 'flex',
        flexDirection: 'column',
        gap: '0.6rem',
        cursor: 'pointer',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
      onClick={() => setExpanded((e) => !e)}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = ann.badgeColor || 'rgba(255,255,255,0.18)';
        e.currentTarget.style.boxShadow = `0 4px 24px ${ann.badgeColor || '#3D9DE8'}22`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span
          style={{
            backgroundColor: ann.badgeColor || '#3D9DE8',
            color: '#0A0E12',
            fontSize: '0.65rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            padding: '2px 8px',
            borderRadius: 4,
            textTransform: 'uppercase',
          }}
        >
          {ann.categoryLabel || ann.category}
        </span>
        {ann.pinned && (
          <span style={{ fontSize: '0.65rem', color: 'var(--text-muted, #8b949e)', fontWeight: 600, letterSpacing: '0.06em' }}>
            📌 PINNED
          </span>
        )}
        {ann.isLive && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.65rem', color: '#2ECC71', fontWeight: 700 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2ECC71', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
            LIVE
          </span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted, #8b949e)' }}>
          {relativeDate(ann.date)}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
      </div>

      {/* Title */}
      <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary, #eceff4)', lineHeight: 1.35 }}>
        {ann.title}
      </div>

      {/* Summary */}
      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.55 }}>
        {ann.summary}
      </div>

      {/* Details (expanded) */}
      {expanded && ann.details?.length > 0 && (
        <ul style={{ margin: '0.25rem 0 0 0', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {ann.details.map((d, i) => (
            <li key={i} style={{ fontSize: '0.8rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.5 }}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AnnouncementsPage() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [liveItems, setLiveItems] = useState([]);
  const [loadingLive, setLoadingLive] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadLiveItems = useCallback(async () => {
    setLoadingLive(true);
    const items = [];
    const now = new Date().toISOString();

    try {
      const health = await fetchHealth();
      const mode = getApiMode();

      /* 1. Model status card */
      items.push({
        id: 'live-model',
        title: `CatBoost Inference Bundle Operational — ${health?.schema_version ?? 'v3-h3-day-catboost'}`,
        date: now,
        category: 'model',
        categoryLabel: 'Model Status',
        badgeColor: '#FF6B35',
        isLive: true,
        summary: `CatBoost classifier is loaded and serving predictions. Calibrators: ${health?.calibrators_loaded ? '✓ Active' : '✗ Not loaded'}. Schema: ${health?.schema_version ?? '—'}.`,
        details: [
          `Model path: ${health?.model_path?.split(/[\\/]/).slice(-3).join('/') ?? '—'}`,
          `Review thresholds — Wildfire: ${health?.review_thresholds?.wildfire ?? '—'} · Industrial: ${health?.review_thresholds?.industrial ?? '—'} · Mining: ${health?.review_thresholds?.mining ?? '—'}`,
          `Agricultural burn always flagged for review (threshold > 1.0 by design).`,
        ],
      });

      /* 2. Satellite ingest card */
      const ing = health?.ingestion;
      if (ing) {
        const fetchModeLabel = ing.fetch_mode === 'live_firms'
          ? 'Live NASA FIRMS VIIRS'
          : ing.fetch_mode === 'cached' ? 'Cached' : ing.fetch_mode ?? 'Unknown';

        items.push({
          id: 'live-ingest',
          title: `Satellite Ingest — ${health.latest_acq_date ?? '—'} · ${ing.india_rows_retained ?? '—'} Records Retained`,
          date: ing.finished_at ?? now,
          category: 'satellite',
          categoryLabel: 'Satellite Ingest',
          badgeColor: '#3D9DE8',
          isLive: true,
          summary: `${fetchModeLabel} orbital pass ingested for ${health.latest_acq_date ?? '—'}. ${ing.india_rows_retained ?? 0} thermal records retained across ${ing.states_served ?? '—'} of 36 States/UTs.`,
          details: [
            `Coverage: ${ing.coverage_status ?? '—'} · Scope: ${ing.serving_scope ?? '—'}`,
            `Outside-India detections rejected: ${ing.outside_india_rejected ?? 0}`,
            `Outside 10-state training geography (analyst review): ${ing.outside_training_geography_rows ?? 0}`,
            ing.gap_filled ? '⚠️ Gap-fill applied for a missing day.' : 'No gap-fill applied.',
          ],
        });
      }

      /* 3. Alert activity card — from predictions */
      try {
        const date = health?.latest_acq_date;
        if (date && mode !== 'mock') {
          const res = await fetchPredictionsStrict(INDIA_BOUNDS, date, 5);
          const preds = Array.isArray(res?.predictions) ? res.predictions : Array.isArray(res) ? res : [];
          const counts = {};
          preds.forEach((p) => {
            counts[p.predicted_class] = (counts[p.predicted_class] || 0) + 1;
          });
          const countLines = Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .map(([cls, n]) => `${CLASS_LABELS[cls] ?? cls}: ${n} detection${n !== 1 ? 's' : ''}`);

          items.push({
            id: 'live-alerts',
            title: `Today's Thermal Anomaly Summary — ${preds.length} Total Detections`,
            date: now,
            category: 'alerts',
            categoryLabel: 'Alert Activity',
            badgeColor: '#E74C3C',
            isLive: true,
            summary: `${preds.length} thermal anomalies classified across India on ${date}. ${ing?.states_served ?? '—'} States/UTs with active detections.`,
            details: countLines.length > 0 ? countLines : ['No classifications available.'],
          });
        }
      } catch {
        /* predictions unavailable — skip alerts card */
      }
    } catch {
      items.push({
        id: 'live-error',
        title: 'Service Status Unavailable',
        date: now,
        category: 'system',
        categoryLabel: 'System',
        badgeColor: '#95A5A6',
        isLive: false,
        summary: 'Could not connect to the Trinetra backend. Live system events are unavailable. Showing editorial updates only.',
        details: [],
      });
    }

    setLiveItems(items);
    setLoadingLive(false);
  }, []);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (active) await loadLiveItems();
    };
    run();
    return () => { active = false; };
  }, [loadLiveItems]);

  /* Merge and filter */
  const allItems = [...liveItems, ...EDITORIAL];
  const filtered = allItems.filter((ann) => {
    const catMatch = activeCategory === 'all' || ann.category === activeCategory;
    const searchMatch =
      !searchQuery ||
      ann.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ann.summary.toLowerCase().includes(searchQuery.toLowerCase());
    return catMatch && searchMatch;
  });

  return (
    <div style={{ backgroundColor: 'var(--bg-dark, #0a0e12)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        .ann-search::placeholder { color: var(--text-muted, #8b949e); }
        .ann-search:focus { outline: none; border-color: #3D9DE8 !important; }
        .cat-tab:hover { background: rgba(255,255,255,0.07) !important; }
      `}</style>

      {/* Page header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '2.5rem 2rem 1.75rem', background: 'linear-gradient(180deg, rgba(30,40,55,0.5) 0%, transparent 100%)' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', color: '#FF6B35', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
            Trinetra Intelligence Feed
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary, #eceff4)', margin: '0 0 0.5rem', letterSpacing: '-0.01em' }}>
            Announcements
          </h1>
          <p style={{ color: 'var(--text-muted, #8b949e)', fontSize: '0.9rem', margin: 0 }}>
            Live model status, satellite ingest events, alert activity, and system updates.
          </p>
        </div>
      </div>

      <div style={{ flex: 1, padding: '1.75rem 2rem 3rem', maxWidth: 860, margin: '0 auto', width: '100%' }}>

        {/* Search + filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem', alignItems: 'center' }}>
          <input
            className="ann-search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search announcements…"
            style={{
              flex: '1 1 200px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: '0.55rem 0.9rem',
              color: 'var(--text-primary, #eceff4)',
              fontSize: '0.85rem',
              transition: 'border-color 0.2s',
            }}
          />
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                className="cat-tab"
                onClick={() => setActiveCategory(cat.id)}
                style={{
                  background: activeCategory === cat.id ? 'rgba(61,157,232,0.2)' : 'rgba(255,255,255,0.04)',
                  color: activeCategory === cat.id ? '#3D9DE8' : 'var(--text-muted, #8b949e)',
                  border: `1px solid ${activeCategory === cat.id ? '#3D9DE8' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 6,
                  padding: '0.4rem 0.85rem',
                  fontSize: '0.78rem',
                  fontWeight: activeCategory === cat.id ? 700 : 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  letterSpacing: '0.04em',
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>
          <button
            onClick={loadLiveItems}
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              padding: '0.4rem 0.85rem',
              color: 'var(--text-muted, #8b949e)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            ↻ Refresh
          </button>
        </div>

        {/* Live items section */}
        {loadingLive ? (
          <div style={{ color: 'var(--text-muted, #8b949e)', fontSize: '0.85rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #3D9DE8', borderTopColor: 'transparent', display: 'inline-block', animation: 'rotate 0.7s linear infinite' }} />
            Fetching live system status…
          </div>
        ) : (
          liveItems.length > 0 && activeCategory === 'all' && (
            <div style={{ marginBottom: '0.5rem' }}>
              <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: '#2ECC71', textTransform: 'uppercase', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2ECC71', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
                Live System Events
              </div>
            </div>
          )
        )}

        {/* All cards */}
        <style>{`@keyframes rotate { to { transform: rotate(360deg); } }`}</style>
        {filtered.length === 0 ? (
          <div style={{ color: 'var(--text-muted, #8b949e)', fontSize: '0.88rem', padding: '2rem 0', textAlign: 'center' }}>
            No announcements match your filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {filtered.map((ann, i) => (
              <AnnouncementCard key={ann.id} ann={ann} index={i} />
            ))}
          </div>
        )}

        {/* Editorial label */}
        {activeCategory === 'all' && !loadingLive && (
          <div style={{ marginTop: '1.75rem', paddingTop: '1.25rem', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted, #8b949e)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>
              📌 Editorial &amp; Release Notes
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
