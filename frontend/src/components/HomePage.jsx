import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import {
  CLASS_LABELS,
  FIRE_COLORS,
  KNOWN_CAVEATS,
  PRIMARY_CLASSES,
  assessIngestionFreshness,
  fetchHealth,
  getApiMode,
  onApiModeChange
} from '../services/api';

// oxlint-disable-next-line react/only-export-components -- deterministic status mapping is covered by the landing-page test.
export function deriveLandingStatus(health, apiMode, today = new Date().toLocaleDateString('en-CA')) {
  if (apiMode === 'mock') {
    return {
      tone: 'demo',
      label: 'Demo data',
      detail: 'Simulated data is shown and must not be used for operational decisions.'
    };
  }

  if (!health || health.status === 'offline') {
    return {
      tone: 'offline',
      label: 'Live data unavailable',
      detail: 'The service could not verify current data. Open the map to retry.'
    };
  }

  const { warnings } = assessIngestionFreshness({
    ingestion: health.ingestion,
    latestAcqDate: health.latest_acq_date,
    today
  });

  if (warnings.length || !health.latest_acq_date) {
    return {
      tone: 'caution',
      label: 'Data freshness requires review',
      detail: warnings[0] || 'The latest acquisition date is unavailable from the service.'
    };
  }

  return {
    tone: 'live',
    label: `Latest verified acquisition: ${health.latest_acq_date}`,
    detail: ''
  };
}

export default function HomePage() {
  const aboutRef = useRef(null);
  const [landingStatus, setLandingStatus] = useState(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in-view');
          }
        });
      },
      { threshold: 0.15 }
    );

    const observedNode = aboutRef.current;
    if (observedNode) {
      observer.observe(observedNode);
    }

    return () => {
      if (observedNode) {
        observer.unobserve(observedNode);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const refreshStatus = async () => {
      const health = await fetchHealth();
      if (!cancelled) {
        setLandingStatus(deriveLandingStatus(health, getApiMode()));
      }
    };

    refreshStatus();
    const unsubscribe = onApiModeChange(refreshStatus);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const classificationContext = {
    industrial: 'Thermal sources near mapped industrial facilities, including routine flare operations.',
    mining: KNOWN_CAVEATS.mining,
    agricultural_burn: KNOWN_CAVEATS.agricultural_burn,
    wildfire: 'Open-land and canopy thermal sources that require analyst review alongside local context.'
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-dark)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      {/* 1. Orange Marquee Alert Ribbon - Placed directly below top nav bar */}
      <div 
        className="alert-marquee-ribbon"
        style={{
          width: '100%',
          backgroundColor: '#FF6B35',
          color: '#0A0E12',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          padding: '0.65rem 1.25rem',
          fontSize: '0.92rem',
          fontFamily: 'var(--font-heading)',
          fontWeight: 800,
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          borderBottom: '1px solid rgba(0,0,0,0.15)',
          boxShadow: '0 2px 8px rgba(255, 107, 53, 0.3)',
          zIndex: 90
        }}
      >
        <div className="marquee-track">
          {[0, 1].map((copyIdx) => (
            <React.Fragment key={copyIdx}>
              <Link to="/fire-alerts?class=industrial" style={{ color: 'inherit', textDecoration: 'none', marginRight: '3.5rem' }}>
                ⚠️ ALERT — New thermal anomaly detected near Jamnagar Petrochemical Complex (Confidence: HIGH)
              </Link>
              <Link to="/fire-alerts?class=mining" style={{ color: 'inherit', textDecoration: 'none', marginRight: '3.5rem' }}>
                ⚠️ ALERT — Thermal flare activity flagged in Singrauli Coalfield Mining Sector
              </Link>
              <Link to="/fire-alerts?class=agricultural_burn" style={{ color: 'inherit', textDecoration: 'none', marginRight: '3.5rem' }}>
                ⚠️ ALERT — Agricultural stubble burning cluster detected in Sangrur Region, Punjab
              </Link>
              <Link to="/fire-alerts?class=wildfire" style={{ color: 'inherit', textDecoration: 'none', marginRight: '3.5rem' }}>
                ⚠️ ALERT — High-intensity canopy wildfire anomaly active near Shimla Forest Division
              </Link>
              <Link to="/fire-alerts?class=unclassified" style={{ color: 'inherit', textDecoration: 'none', marginRight: '3.5rem' }}>
                ⚠️ ALERT — Unclassified thermal detection under analyst review in Korba Basin
              </Link>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* 3D Perspective Hero Presentation Canvas */}
      <section className="hero-3d-canvas">
        <div className="hero-3d-frame">
          <div className="hero-3d-banner">
            <div className="hero-banner-overlay" />

            <div className="hero-content-grid" style={{ gridTemplateColumns: '1fr', padding: '3.5rem 3rem 2.5rem' }}>
              {/* Hero Main Content */}
              <div className="hero-left-content" style={{ maxWidth: '100%', width: '100%' }}>
                <span className="eyebrow-tag">
                  BREAKING INTELLIGENCE · SATELLITE RADAR
                </span>
                <h1 className="hero-main-title">
                  Not all hotspots are the same. We tell you which kind you're looking at.
                </h1>
                <p className="hero-main-subtext" style={{ maxWidth: '900px' }}>
                  Satellite thermal detections across India, assessed with land-cover and infrastructure context to distinguish industrial sources, wildfires, mining activity, and agricultural burns.
                </p>
                <div className="hero-actions">
                  <Link to="/fire-map" className="tri-btn-ember hero-action-primary">
                    Open fire map <span aria-hidden="true">→</span>
                  </Link>
                  <Link to="/fire-alerts" className="hero-action-secondary">
                    View alerts <span aria-hidden="true">↗</span>
                  </Link>
                </div>

                {/* 3. Category Cards Grid (Full Line Width, Interactive Filter Links) */}
                <div 
                  className="category-carousel-container"
                  style={{
                    width: '100%',
                    marginTop: '2.5rem',
                    paddingTop: '1.75rem',
                    borderTop: '1px solid var(--hairline-border)'
                  }}
                >
                  <div 
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '1.25rem'
                    }}
                  >
                    <span style={{ fontSize: '0.85rem', fontFamily: 'var(--font-heading)', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-ember)' }}>
                      CLASSIFICATION CATEGORIES
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                      Click any category to filter alerts
                    </span>
                  </div>

                  <div 
                    className="category-cards-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
                      gap: '1.25rem',
                      width: '100%'
                    }}
                  >
                    {/* Card 1: Industrial */}
                    <Link 
                      to="/fire-alerts?class=industrial"
                      className="category-card"
                      style={{
                        textDecoration: 'none',
                        backgroundColor: 'var(--panel-surface, #12181F)',
                        border: '1px solid rgba(230, 126, 34, 0.35)',
                        borderRadius: '14px',
                        padding: '1.75rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: '0 6px 20px rgba(230, 126, 34, 0.15)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        cursor: 'pointer'
                      }}
                    >
                      {/* Industrial Hexagon Badge */}
                      <svg width="72" height="72" viewBox="0 0 100 100" fill="none" style={{ marginBottom: '0.85rem' }}>
                        <polygon points="50 5, 90 27.5, 90 72.5, 50 95, 10 72.5, 10 27.5" fill="#E67E22" />
                        <path d="M30 65 V45 L42 41 V65 H30 Z M45 65 V48 L57 44 V65 H45 Z M62 65 V50 H72 V65 H62 Z" fill="#FFFFFF" />
                        <path d="M38 41 C38 34 48 35 44 28 C42 25 48 22 55 24 C60 26 56 31 66 32" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" fill="none" />
                      </svg>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                        Industrial
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#E67E22', fontWeight: 700 }}>
                        Active Flares
                      </span>
                    </Link>

                    {/* Card 2: Mining */}
                    <Link 
                      to="/fire-alerts?class=mining"
                      className="category-card"
                      style={{
                        textDecoration: 'none',
                        backgroundColor: 'var(--panel-surface, #12181F)',
                        border: '1px solid rgba(149, 165, 166, 0.35)',
                        borderRadius: '14px',
                        padding: '1.75rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: '0 6px 20px rgba(149, 165, 166, 0.15)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        cursor: 'pointer'
                      }}
                    >
                      {/* Mining Hexagon Badge */}
                      <svg width="72" height="72" viewBox="0 0 100 100" fill="none" style={{ marginBottom: '0.85rem' }}>
                        <polygon points="50 5, 90 27.5, 90 72.5, 50 95, 10 72.5, 10 27.5" fill="#4A5568" />
                        <path d="M25 58 L45 35 L62 48 L75 32" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                        <path d="M75 32 L75 42 M75 32 L65 32" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" fill="none" />
                        <path d="M48 65 L55 56 L62 65 Z M60 65 L66 58 L72 65 Z M32 65 H78" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" fill="none" />
                      </svg>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                        Mining
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#95A5A6', fontWeight: 700 }}>
                        Smelter Activity
                      </span>
                    </Link>

                    {/* Card 3: Agricultural Burn */}
                    <Link 
                      to="/fire-alerts?class=agricultural_burn"
                      className="category-card"
                      style={{
                        textDecoration: 'none',
                        backgroundColor: 'var(--panel-surface, #12181F)',
                        border: '1px solid rgba(46, 204, 113, 0.35)',
                        borderRadius: '14px',
                        padding: '1.75rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: '0 6px 20px rgba(46, 204, 113, 0.15)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        cursor: 'pointer'
                      }}
                    >
                      {/* Agricultural Burn Hexagon Badge */}
                      <svg width="72" height="72" viewBox="0 0 100 100" fill="none" style={{ marginBottom: '0.85rem' }}>
                        <polygon points="50 5, 90 27.5, 90 72.5, 50 95, 10 72.5, 10 27.5" fill="#2ECC71" />
                        {/* Stalks & Flame */}
                        <path d="M28 48 C28 40 34 38 34 38 M34 48 C34 40 40 38 40 38" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" fill="none" />
                        <path d="M60 48 C60 30 75 35 68 25 C58 35 52 42 60 48 Z" fill="#FFFFFF" />
                        {/* Furrowed Field Base */}
                        <path d="M20 62 L32 52 M32 62 L42 52 M44 62 L54 52 M56 62 L66 52 M68 62 L78 52" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" fill="none" />
                      </svg>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                        Agricultural Burn
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#2ECC71', fontWeight: 700 }}>
                        Stubble Fires
                      </span>
                    </Link>

                    {/* Card 4: Wildfire */}
                    <Link 
                      to="/fire-alerts?class=wildfire"
                      className="category-card"
                      style={{
                        textDecoration: 'none',
                        backgroundColor: 'var(--panel-surface, #12181F)',
                        border: '1px solid rgba(231, 76, 60, 0.35)',
                        borderRadius: '14px',
                        padding: '1.75rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: '0 6px 20px rgba(231, 76, 60, 0.15)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        cursor: 'pointer'
                      }}
                    >
                      {/* Wildfire Hexagon Badge */}
                      <svg width="72" height="72" viewBox="0 0 100 100" fill="none" style={{ marginBottom: '0.85rem' }}>
                        <polygon points="50 5, 90 27.5, 90 72.5, 50 95, 10 72.5, 10 27.5" fill="#E74C3C" />
                        {/* Trees */}
                        <polygon points="30 58, 22 58, 26 48, 23 48, 27 38, 33 38, 37 48, 34 48, 38 58" fill="#FFFFFF" />
                        <polygon points="50 58, 40 58, 45 45, 41 45, 46 32, 54 32, 59 45, 55 45, 60 58" fill="#FFFFFF" />
                        <polygon points="70 58, 62 58, 66 48, 63 48, 67 38, 73 38, 77 48, 74 48, 78 58" fill="#FFFFFF" />
                        {/* Canopy Flame */}
                        <path d="M50 32 C50 18 68 22 60 12 C48 22 42 28 50 32 Z" fill="#FFFFFF" />
                      </svg>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                        Wildfire
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#E74C3C', fontWeight: 700 }}>
                        Canopy Burns
                      </span>
                    </Link>

                    {/* Card 5: Unclassified */}
                    <Link 
                      to="/fire-alerts?class=unclassified"
                      className="category-card"
                      style={{
                        textDecoration: 'none',
                        backgroundColor: 'var(--panel-surface, #12181F)',
                        border: '1px solid rgba(155, 89, 182, 0.35)',
                        borderRadius: '14px',
                        padding: '1.75rem 1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        boxShadow: '0 6px 20px rgba(155, 89, 182, 0.15)',
                        transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
                        cursor: 'pointer'
                      }}
                    >
                      {/* Unclassified Hexagon Badge */}
                      <svg width="72" height="72" viewBox="0 0 100 100" fill="none" style={{ marginBottom: '0.85rem' }}>
                        <polygon points="50 5, 90 27.5, 90 72.5, 50 95, 10 72.5, 10 27.5" fill="#8E44AD" />
                        {/* Target Reticle + Question Mark */}
                        <circle cx="50" cy="48" r="20" stroke="#FFFFFF" strokeWidth="4" fill="none" />
                        <line x1="50" y1="22" x2="50" y2="28" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
                        <line x1="50" y1="68" x2="50" y2="74" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
                        <line x1="24" y1="48" x2="30" y2="48" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
                        <line x1="70" y1="48" x2="76" y2="48" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" />
                        <text x="50" y="55" fill="#FFFFFF" fontSize="22" fontWeight="900" textAnchor="middle" fontFamily="sans-serif">?</text>
                      </svg>
                      <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                        Unclassified
                      </span>
                      <span style={{ fontSize: '0.8rem', color: '#9B59B6', fontWeight: 700 }}>
                        Analyst Review
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        className={`landing-status${landingStatus ? ` landing-status-${landingStatus.tone}` : ' landing-status-checking'}`}
        aria-live="polite"
        aria-label="Data status"
      >
        <div>
          <span className="landing-status-label">Data status</span>
          <strong>{landingStatus?.label || 'Checking data availability'}</strong>
          {landingStatus?.detail && <span className="landing-status-detail">{landingStatus.detail}</span>}
        </div>
      </section>

      {/* Two-Column Panel Section Split by Hairline Border */}
      <section 
        style={{
          borderTop: '1px solid var(--hairline-border)',
          borderBottom: '1px solid var(--hairline-border)',
          backgroundColor: 'var(--panel-surface)',
          width: '100%'
        }}
      >
        <div
          className="landing-action-grid"
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1px 1fr',
            width: '100%'
          }}
        >
          {/* Fire Map Panel */}
          <div className="panel-card-hover" style={{ padding: '3.5rem 2.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div 
              className="panel-icon-circle"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 107, 53, 0.12)',
                border: '1px solid rgba(255, 107, 53, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                <line x1="8" y1="2" x2="8" y2="18" />
                <line x1="16" y1="6" x2="16" y2="22" />
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Fire Map
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.75rem', maxWidth: '480px' }}>
              Live thermal detections over India, classified as industrial facility, mining / smelter, agricultural burn, or wildfire. Gas flare is an evidence-based industrial assessment, not a separate class.
            </p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 1.5rem', paddingLeft: '1.1rem' }}>
              <li>Review national context and source classification.</li>
              <li>Inspect a detection alongside its available evidence.</li>
            </ul>
            <Link 
              to="/fire-map" 
              className="tri-btn-ember"
              style={{ textDecoration: 'none' }}
            >
              Open map →
            </Link>
          </div>

          {/* Hairline Divider */}
          <div className="landing-action-grid-divider" style={{ backgroundColor: 'var(--hairline-border)', width: '1px', height: '100%' }} />

          {/* Fire Alerts Panel */}
          <div className="panel-card-hover-blue" style={{ padding: '3.5rem 2.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div 
              className="panel-icon-circle-blue"
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: 'rgba(61, 157, 232, 0.12)',
                border: '1px solid rgba(61, 157, 232, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '1.25rem'
              }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3D9DE8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.6rem', color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Fire Alerts
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '1.75rem', maxWidth: '480px' }}>
              Notifications for new or persistent thermal sources near critical infrastructure, sent as they're detected.
            </p>
            <ul style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.6, margin: '0 0 1.5rem', paddingLeft: '1.1rem' }}>
              <li>Prioritize detections that need analyst review.</li>
              <li>Review alert history and export archived evidence.</li>
            </ul>
            <Link 
              to="/fire-alerts" 
              className="tri-btn-blue"
              style={{ textDecoration: 'none' }}
            >
              View alerts →
            </Link>
          </div>
        </div>
      </section>

      <section style={{ borderBottom: '1px solid var(--hairline-border)', backgroundColor: 'var(--panel-surface)', padding: '4.5rem 2.5rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--accent-blue)' }}>
            Assessment workflow
          </span>
          <h2 style={{ marginTop: '0.6rem', marginBottom: '2rem', fontSize: '2rem' }}>How TRINETRA supports assessment</h2>
          <div className="landing-process-grid">
            <article>
              <span>01</span>
              <h3>Detect</h3>
              <p>Start with satellite thermal detections across the national operating area.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Contextualize</h3>
              <p>Assess the thermal signal with land-cover and infrastructure context.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Investigate</h3>
              <p>Open the map or alerts feed to review source evidence before escalation.</p>
            </article>
          </div>
        </div>
      </section>

      {/* About the App Section - Scroll Reveal Trigger */}
      <section 
        ref={aboutRef}
        className="scroll-reveal"
        style={{
          padding: '4.5rem 2.5rem',
          maxWidth: '1280px',
          margin: '0 auto',
          width: '100%',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '3rem', alignItems: 'start' }} className="landing-classification-list">
          <div style={{ maxWidth: '620px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <span 
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '0.75rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-muted)',
              marginBottom: '1.25rem'
            }}
          >
            Assessment context
          </span>
          <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Classification context for analysts</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            A thermal detection is not, by itself, an incident classification. TRINETRA combines the signal with spatial context so analysts can distinguish routine industrial heat from sources that warrant further attention.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.65 }}>
            Classifications support assessment and must be reviewed against available evidence before escalation.
          </p>
        </div>
          <div>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)', display: 'block', marginBottom: '1rem' }}>
              Source categories
            </span>
            {PRIMARY_CLASSES.map((className) => (
              <div key={className} className="landing-classification-row">
                <span style={{ backgroundColor: FIRE_COLORS[className] }} aria-hidden="true" />
                <div>
                  <h3>{CLASS_LABELS[className]}</h3>
                  <p>{classificationContext[className]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
