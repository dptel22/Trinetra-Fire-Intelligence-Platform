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

      {/* 3D Perspective Hero Presentation Canvas */}
      <section className="hero-3d-canvas">
        <div className="hero-3d-frame">
          <div className="hero-3d-banner">
            <div className="hero-banner-overlay" />

            <div className="hero-content-grid">
              {/* Left Column: Headline, Subtext & CTA */}
              <div className="hero-left-content">
                <span className="eyebrow-tag">
                  BREAKING INTELLIGENCE · SATELLITE RADAR
                </span>
                <h1 className="hero-main-title">
                  See which fires are industrial before they're declared.
                </h1>
                <p className="hero-main-subtext">
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
                <div className="hero-taxonomy" aria-label="Fire classification taxonomy">
                  <span className="hero-taxonomy-label">Classifies</span>
                  <span className="hero-taxonomy-item"><i className="taxonomy-dot taxonomy-industrial" />Industrial</span>
                  <span className="hero-taxonomy-item"><i className="taxonomy-dot taxonomy-mining" />Mining</span>
                  <span className="hero-taxonomy-item"><i className="taxonomy-dot taxonomy-agri" />Agricultural</span>
                  <span className="hero-taxonomy-item"><i className="taxonomy-dot taxonomy-wildfire" />Wildfire</span>
                </div>
              </div>

              {/* Right Column: Floating 3D News & Intelligence Cards Overlapping Hero */}
              <div className="hero-floating-cards">
                {/* Floating Card 1 - Industrial Glow */}
                <Link to="/fire-map" className="floating-3d-card glow-industrial">
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Refinery Flare" />
                    <span className="card-badge">Industrial Facility</span>
                  </div>
                  <div className="card-body-text">
                    <div className="card-title">
                      Jamnagar Petrochemical Thermal Anomaly
                    </div>
                    <div className="card-meta">
                      Illustrative gas-flare assessment
                    </div>
                  </div>
                </Link>

                {/* Floating Card 2 - Wildfire Glow */}
                <Link to="/fire-alerts" className="floating-3d-card glow-wildfire">
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Wildfire Alert" />
                    <span className="card-badge card-badge-wildfire">
                      Wildfire
                    </span>
                  </div>
                  <div className="card-body-text">
                    <div className="card-title">
                      Shimla Canopy Wildfire Surge
                    </div>
                    <div className="card-meta">
                      Illustrative open-land assessment
                    </div>
                  </div>
                </Link>

                {/* Floating Card 3 - Mining Glow */}
                <Link to="/fire-map" className="floating-3d-card glow-mining">
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Mining and smelter context" />
                    <span className="card-badge card-badge-mining">
                      Mining / Smelter
                    </span>
                  </div>
                  <div className="card-body-text">
                    <div className="card-title">
                      Infrastructure-context assessment
                    </div>
                    <div className="card-meta">
                      Illustrative mining-context assessment
                    </div>
                  </div>
                </Link>
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
        <Link to="/fire-map">Open fire map</Link>
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
