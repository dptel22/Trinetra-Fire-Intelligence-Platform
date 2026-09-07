import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';

export default function HomePage() {
  const aboutRef = useRef(null);

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

    if (aboutRef.current) {
      observer.observe(aboutRef.current);
    }

    return () => {
      if (aboutRef.current) {
        observer.unobserve(aboutRef.current);
      }
    };
  }, []);

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
                  Classifying thermal anomalies across India by source — industrial facilities (including gas flares), wildfires, mining operations, and agricultural burns — using satellite thermal infrared signals and spatial infrastructure records.
                </p>
                {/* Hero text content - CTA button removed */}
              </div>

              {/* Right Column: Floating 3D News & Intelligence Cards Overlapping Hero */}
              <div className="hero-floating-cards">
                {/* Floating Card 1 - Industrial Glow */}
                <Link to="/fire-map" className="floating-3d-card glow-industrial">
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Refinery Flare" />
                    <span className="card-badge">Industrial</span>
                  </div>
                  <div className="card-body-text">
                    <div className="card-title">
                      Jamnagar Petrochemical Thermal Anomaly
                    </div>
                    <div className="card-meta">
                      Confidence 96% · 12m ago
                    </div>
                  </div>
                </Link>

                {/* Floating Card 2 - Wildfire Glow */}
                <Link to="/fire-alerts" className="floating-3d-card glow-wildfire">
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Wildfire Alert" />
                    <span className="card-badge" style={{ background: 'var(--color-wildfire)', color: '#fff' }}>
                      Wildfire
                    </span>
                  </div>
                  <div className="card-body-text">
                    <div className="card-title">
                      Shimla Canopy Wildfire Surge
                    </div>
                    <div className="card-meta">
                      FRP 84MW · 34m ago
                    </div>
                  </div>
                </Link>

                {/* Floating Card 3 - Logistics Glow */}
                <Link to="/fire-alerts" className="floating-3d-card glow-logistics">
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Port Logistics" />
                    <span className="card-badge" style={{ background: 'var(--accent-blue)', color: '#0A0E12' }}>
                      Logistics
                    </span>
                  </div>
                  <div className="card-body-text">
                    <div className="card-title">
                      Paradip Bulk Terminal Perimeter
                    </div>
                    <div className="card-meta">
                      850m to asset · 1h ago
                    </div>
                  </div>
                </Link>
              </div>
            </div>
          </div>
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
              Live thermal detections over India, colour-coded by classification — industrial, wildfire, gas flare, mining, agricultural burn.
            </p>
            <Link 
              to="/fire-map" 
              className="tri-btn-ember"
              style={{ textDecoration: 'none' }}
            >
              Open map →
            </Link>
          </div>

          {/* Hairline Divider */}
          <div style={{ backgroundColor: 'var(--hairline-border)', width: '1px', height: '100%' }} />

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
            About the app
          </span>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.65, marginBottom: '1.25rem' }}>
            Most satellite fire monitoring systems detect thermal anomalies, but struggle to distinguish between benign agricultural burns, routine industrial flare operations, and high-risk facility blazes.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.98rem', lineHeight: 1.65 }}>
            TRINETRA classifies each thermal detection by source using land-cover data and infrastructure records alongside the thermal signal. By isolating industrial facilities from open-land fires, response teams receive precise intelligence before incidents are officially declared.
          </p>
        </div>
      </section>
    </div>
  );
}


