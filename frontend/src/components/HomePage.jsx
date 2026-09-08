import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import Header from './Header';
import { FIRE_COLORS } from '../services/api';

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
      { threshold: 0.1 }
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
              {/* Left Column: Headline, Subtext & Quick Action */}
              <div className="hero-left-content">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.85rem' }}>
                  <span 
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: '#FF6B35',
                      boxShadow: '0 0 10px #FF6B35',
                      animation: 'pulseGreen 2s infinite'
                    }}
                  />
                  <span className="eyebrow-tag" style={{ margin: 0 }}>
                    NATIONAL SATELLITE RADAR · REAL-TIME TELEMETRY
                  </span>
                </div>

                <h1 className="hero-main-title">
                  See which fires are industrial before they're declared.
                </h1>
                <p className="hero-main-subtext">
                  Classifying thermal anomalies across India by source — industrial facilities (including petrochemical gas flares), wildfires, mining operations, and agricultural burns — using satellite thermal infrared radiometry and spatial infrastructure joins.
                </p>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <Link to="/fire-map" className="tri-btn-ember" style={{ textDecoration: 'none' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                      <line x1="8" y1="2" x2="8" y2="18" />
                      <line x1="16" y1="6" x2="16" y2="22" />
                    </svg>
                    <span>Launch Fire Map</span>
                  </Link>
                  <Link to="/fire-alerts" className="tri-btn-blue" style={{ textDecoration: 'none' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <span>View Fire Alerts</span>
                  </Link>
                </div>
              </div>

              {/* Right Column: Floating 3D News & Intelligence Cards Overlapping Hero */}
              <div className="hero-floating-cards">
                {/* Floating Card 1 - Industrial Glow */}
                <Link to="/fire-map?lat=22.4707&lon=70.0577&name=Jamnagar%20Refinery" className="floating-3d-card glow-industrial" style={{ textDecoration: 'none' }}>
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Refinery Flare" />
                    <span className="card-badge" style={{ backgroundColor: '#E67E22', color: '#FFFFFF' }}>Industrial</span>
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
                <Link to="/fire-map?lat=31.1048&lon=77.1734&name=Shimla%20Forest" className="floating-3d-card glow-wildfire" style={{ textDecoration: 'none' }}>
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
                <Link to="/fire-map?lat=20.2644&lon=86.6713&name=Paradip%20Terminal" className="floating-3d-card glow-logistics" style={{ textDecoration: 'none' }}>
                  <div className="card-thumbnail-container">
                    <img src="/images/hero-wildfire.jpg" alt="Port Logistics" />
                    <span className="card-badge" style={{ background: 'var(--accent-blue)', color: '#FFFFFF' }}>
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

      {/* Real-Time Telemetry Metrics Ribbon */}
      <section className="telemetry-ribbon" style={{ padding: '1.25rem 2rem' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#2ECC71', boxShadow: '0 0 10px #2ECC71' }} />
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                1,482
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Active Thermal Pixels
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🎯</span>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--accent-ember)', lineHeight: 1.1 }}>
                94.2% F1
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Industrial Precision
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🛰️</span>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                375m / 1km
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                VIIRS & MODIS Sensors
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span style={{ fontSize: '1.3rem' }}>⚡</span>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--accent-blue)', lineHeight: 1.1 }}>
                52 Features
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                CatBoost Spatial Model
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <span style={{ fontSize: '1.3rem' }}>🌐</span>
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                Uber H3 Res-8
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                ~0.7 km² Spatial Mesh
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Two-Column Action Hub Section Split by Hairline Border */}
      <section 
        style={{
          borderBottom: '1px solid var(--hairline-border)',
          backgroundColor: 'var(--panel-surface)',
          width: '100%'
        }}
      >
        <div 
          className="home-two-col-grid"
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            display: 'grid',
            gridTemplateColumns: '1fr 1px 1fr',
            width: '100%'
          }}
        >
          {/* Fire Map Panel */}
          <div className="action-card-ember" style={{ padding: '3.5rem 2.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div 
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(255, 107, 53, 0.14)',
                  border: '1px solid rgba(255, 107, 53, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF6B35" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
                  <line x1="8" y1="2" x2="8" y2="18" />
                  <line x1="16" y1="6" x2="16" y2="22" />
                </svg>
              </div>

              <span 
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  color: 'var(--accent-ember)',
                  backgroundColor: 'rgba(255, 107, 53, 0.1)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}
              >
                Live GIS Surface
              </span>
            </div>

            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Interactive Fire Map
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.96rem', lineHeight: 1.6, marginBottom: '1.5rem', maxWidth: '480px' }}>
              Explore live thermal detections over the Indian subcontinent, color-coded by verified class — petrochemical gas flares, canopy wildfires, coal basins, and seasonal stubble burns.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#2ECC71', fontWeight: 'bold' }}>✓</span> Click any Uber H3 hexagon to inspect confidence, FRP, & caveats
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#2ECC71', fontWeight: 'bold' }}>✓</span> Real-time classification filter toggles & detection counters
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#2ECC71', fontWeight: 'bold' }}>✓</span> High-resolution Stadia dark tiles optimized for night thermal imaging
              </li>
            </ul>

            <Link 
              to="/fire-map" 
              className="tri-btn-ember"
              style={{ textDecoration: 'none' }}
            >
              <span>Launch Fire Map</span>
              <span>→</span>
            </Link>
          </div>

          {/* Hairline Divider */}
          <div className="home-two-col-divider" style={{ backgroundColor: 'var(--hairline-border)', width: '1px', height: '100%' }} />

          {/* Fire Alerts Panel */}
          <div className="action-card-blue" style={{ padding: '3.5rem 2.5rem', textAlign: 'left', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <div 
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '10px',
                  backgroundColor: 'rgba(61, 157, 232, 0.14)',
                  border: '1px solid rgba(61, 157, 232, 0.35)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#3D9DE8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                  <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                </svg>
              </div>

              <span 
                style={{
                  fontSize: '0.72rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 800,
                  color: 'var(--accent-blue)',
                  backgroundColor: 'rgba(61, 157, 232, 0.1)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase'
                }}
              >
                Early Warning Dispatch
              </span>
            </div>

            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.75rem' }}>
              Critical Infrastructure Alerts
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.96rem', lineHeight: 1.6, marginBottom: '1.5rem', maxWidth: '480px' }}>
              Automated notifications for persistent or sudden thermal spikes near high-value assets — oil refineries, maritime terminals, gas storage perimeters, and railway junctions.
            </p>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 2rem 0', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#2ECC71', fontWeight: 'bold' }}>✓</span> Exact distance-to-asset calculations (e.g. 850m to terminal boundary)
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#2ECC71', fontWeight: 'bold' }}>✓</span> Verified infrastructure join with OSM & WRI industrial facility registry
              </li>
              <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#2ECC71', fontWeight: 'bold' }}>✓</span> Export archived historical telemetry in GeoJSON & CSV formats
              </li>
            </ul>

            <Link 
              to="/fire-alerts" 
              className="tri-btn-blue"
              style={{ textDecoration: 'none' }}
            >
              <span>View Active Alerts</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured National Thermal Corridors Section */}
      <section style={{ padding: '4.5rem 2rem', borderBottom: '1px solid var(--hairline-border)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-ember)' }}>
                BENCHMARK INFRASTRUCTURE MONITORS
              </span>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem' }}>
                Key Indian Thermal Corridors
              </h2>
            </div>
            <Link to="/fire-map" style={{ color: 'var(--accent-ember)', textDecoration: 'none', fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem' }}>
              View all detections on map →
            </Link>
          </div>

          <div className="sectors-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
            {/* Sector 1: Jamnagar */}
            <div className="sector-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(230, 126, 34, 0.15)', color: '#E67E22', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  INDUSTRIAL FLARE
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Gujarat</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Jamnagar Petrochemical
              </h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '1rem' }}>
                World's largest refining hub continuous flare stack & FCCU thermal anomalies.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--hairline-border)', paddingTop: '0.75rem', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>FRP: <strong style={{ color: 'var(--text-primary)' }}>94.2 MW</strong></span>
                <Link to="/fire-map?lat=22.4707&lon=70.0577&name=Jamnagar%20Refinery" style={{ color: 'var(--accent-ember)', textDecoration: 'none', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  Inspect ↗
                </Link>
              </div>
            </div>

            {/* Sector 2: Shimla */}
            <div className="sector-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(231, 76, 60, 0.15)', color: '#E74C3C', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  CANOPY WILDFIRE
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Himachal</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Shimla Pine Canopy Ridge
              </h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '1rem' }}>
                Steep montane terrain coniferous high-intensity advancing flame front.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--hairline-border)', paddingTop: '0.75rem', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>FRP: <strong style={{ color: 'var(--text-primary)' }}>84.0 MW</strong></span>
                <Link to="/fire-map?lat=31.1048&lon=77.1734&name=Shimla%20Forest" style={{ color: 'var(--accent-ember)', textDecoration: 'none', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  Inspect ↗
                </Link>
              </div>
            </div>

            {/* Sector 3: Paradip */}
            <div className="sector-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(230, 126, 34, 0.15)', color: '#E67E22', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  PORT / SMELTER
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Odisha</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Paradip Bulk Terminal
              </h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '1rem' }}>
                IOCL refinery and pellet plant thermal anomaly cluster near maritime docks.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--hairline-border)', paddingTop: '0.75rem', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>FRP: <strong style={{ color: 'var(--text-primary)' }}>78.5 MW</strong></span>
                <Link to="/fire-map?lat=20.2644&lon=86.6713&name=Paradip%20Terminal" style={{ color: 'var(--accent-ember)', textDecoration: 'none', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  Inspect ↗
                </Link>
              </div>
            </div>

            {/* Sector 4: Singrauli */}
            <div className="sector-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.72rem', padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(149, 165, 166, 0.15)', color: '#95A5A6', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  MINING SEAM
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Madhya Pradesh</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.4rem' }}>
                Singrauli Coal Basin
              </h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.45, marginBottom: '1rem' }}>
                Continuous open-cast pit mining spontaneous combustion and thermal power perimeter.
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--hairline-border)', paddingTop: '0.75rem', fontSize: '0.8rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>FRP: <strong style={{ color: 'var(--text-primary)' }}>62.1 MW</strong></span>
                <Link to="/fire-map?lat=24.1994&lon=82.6644&name=Singrauli%20Mine" style={{ color: 'var(--accent-ember)', textDecoration: 'none', fontWeight: 700, fontFamily: 'var(--font-heading)' }}>
                  Inspect ↗
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* System Architecture: How TRINETRA Works */}
      <section style={{ padding: '5rem 2rem', borderBottom: '1px solid var(--hairline-border)', backgroundColor: 'var(--panel-surface)' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', textAlign: 'left' }}>
          <div style={{ maxWidth: '720px', marginBottom: '3rem' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent-blue)' }}>
              SYSTEM ARCHITECTURE
            </span>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.2rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: '0.4rem', marginBottom: '0.75rem' }}>
              How TRINETRA Works
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '1rem', lineHeight: 1.6 }}>
              From raw satellite radiant heat emissions to sub-kilometer industrial fire intelligence in 180 milliseconds.
            </p>
          </div>

          <div className="architecture-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.75rem' }}>
            {/* Step 1 */}
            <div className="arch-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.85rem', color: 'var(--accent-ember)', backgroundColor: 'rgba(255, 107, 53, 0.12)', padding: '3px 8px', borderRadius: '4px' }}>
                  STAGE 01
                </span>
                <span style={{ fontSize: '1.5rem' }}>📡</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Dual-Satellite Ingest
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                VIIRS (SNPP / NOAA-20) 375m I-Band infrared channels combined with MODIS 1km radiances, ingested automatically after every orbital pass over the Indian landmass.
              </p>
            </div>

            {/* Step 2 */}
            <div className="arch-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.85rem', color: 'var(--accent-blue)', backgroundColor: 'rgba(61, 157, 232, 0.12)', padding: '3px 8px', borderRadius: '4px' }}>
                  STAGE 02
                </span>
                <span style={{ fontSize: '1.5rem' }}>⚡</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                CatBoost 52-Feature AI
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Multi-temporal persistence tracking, FRP variance, and spatial proximity joins to 14,800+ registered refineries, power plants, and mines to isolate flares from wildfires.
              </p>
            </div>

            {/* Step 3 */}
            <div className="arch-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '1.25rem' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.85rem', color: '#2ECC71', backgroundColor: 'rgba(46, 204, 113, 0.12)', padding: '3px 8px', borderRadius: '4px' }}>
                  STAGE 03
                </span>
                <span style={{ fontSize: '1.5rem' }}>🌐</span>
              </div>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>
                Uber H3 Res-8 Mesh
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                Discretized into hexagonal ~0.7 km² spatial cells for instant proximity indexing. Routine flares are suppressed from wildland blazes while alert triggers route immediately to teams.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* About the Platform & Classification Matrix */}
      <section 
        ref={aboutRef}
        style={{
          padding: '5rem 2rem',
          maxWidth: '1280px',
          margin: '0 auto',
          width: '100%',
          textAlign: 'left'
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '3.5rem', alignItems: 'flex-start' }} className="home-two-col-grid">
          {/* Left Narrative */}
          <div>
            <span 
              style={{
                fontFamily: 'var(--font-heading)',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.14em',
                color: 'var(--accent-ember)',
                display: 'block',
                marginBottom: '0.6rem'
              }}
            >
              MISSION CRITICAL INTELLIGENCE
            </span>
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.1rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.25, marginBottom: '1.25rem' }}>
              Why traditional satellite fire monitoring fails in industrial hubs.
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.96rem', lineHeight: 1.7, marginBottom: '1rem' }}>
              Conventional satellite fire systems (like raw NASA FIRMS) detect high-temperature surface thermal anomalies. However, they struggle to differentiate between benign seasonal agricultural residue burns, routine petrochemical flare stacks, and catastrophic infrastructure blazes.
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.96rem', lineHeight: 1.7, marginBottom: '1.75rem' }}>
              TRINETRA bridges this gap by marrying multi-band infrared satellite radiometry with 52 engineered spatial features. By cross-referencing thermal persistence curves against registered industrial boundaries, emergency response teams receive verified intelligence before incidents are declared.
            </p>

            <div style={{ display: 'flex', gap: '1rem' }}>
              <Link to="/fire-map" className="tri-btn-ember" style={{ textDecoration: 'none', padding: '0.7rem 1.4rem', fontSize: '0.9rem' }}>
                Open Fire Map
              </Link>
              <Link to="/fire-alerts" className="tri-btn-blue" style={{ textDecoration: 'none', padding: '0.7rem 1.4rem', fontSize: '0.9rem' }}>
                View Alerts Feed
              </Link>
            </div>
          </div>

          {/* Right Matrix: Classification Capabilities */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
              Verified Classification Taxonomy
            </span>

            {/* Item 1 */}
            <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid var(--hairline-border)', backgroundColor: 'var(--panel-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#E67E22', flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    Industrial Facility (inc. Gas Flares)
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Validated against OSM/WRI Facility Maps · 14.8k Registered Sites
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: '#E67E22' }}>
                F1 &gt; 0.94
              </span>
            </div>

            {/* Item 2 */}
            <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid var(--hairline-border)', backgroundColor: 'var(--panel-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#E74C3C', flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    Open Canopy Wildfire
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    High Confidence Thermal Signal · Advancing Front Vectors
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: '#E74C3C' }}>
                F1 &gt; 0.90
              </span>
            </div>

            {/* Item 3 */}
            <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid var(--hairline-border)', backgroundColor: 'var(--panel-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#95A5A6', flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    Mining / Smelter Operations
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Subsurface Coal Seams & Continuous Slag Heat
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: '#95A5A6' }}>
                74% ± 8% CI
              </span>
            </div>

            {/* Item 4 */}
            <div style={{ padding: '1rem 1.25rem', borderRadius: '8px', border: '1px solid var(--hairline-border)', backgroundColor: 'var(--panel-surface)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#F1C40F', flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                    Agricultural Residue Burn
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    Dynamic Seasonal Stubble Rule · Punjab & Haryana Belts
                  </div>
                </div>
              </div>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.85rem', color: '#F1C40F' }}>
                Dynamic Rule
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Institutional Grade Footer */}
      <footer style={{ borderTop: '1px solid var(--hairline-border)', backgroundColor: '#070A0E', padding: '3.5rem 2rem 2rem 2rem', color: 'var(--text-muted)', textAlign: 'left' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr', gap: '2.5rem', marginBottom: '3rem' }} className="home-two-col-grid">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div 
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: '#FF6B35',
                    boxShadow: '0 0 14px rgba(255, 107, 53, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FFFFFF' }} />
                </div>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', color: '#FFFFFF', letterSpacing: '0.04em' }}>
                  TRINETRA
                </span>
              </div>
              <p style={{ fontSize: '0.85rem', lineHeight: 1.6, maxWidth: '320px', color: 'rgba(234, 237, 240, 0.65)' }}>
                National Industrial Fire & Thermal Intelligence. Early classification of high-temperature thermal infrared signals across India using satellite remote sensing and spatial artificial intelligence.
              </p>
            </div>

            <div>
              <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1rem' }}>
                Platform
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                <li><Link to="/fire-map" style={{ color: 'rgba(234, 237, 240, 0.65)', textDecoration: 'none' }}>Fire Map Surface</Link></li>
                <li><Link to="/fire-alerts" style={{ color: 'rgba(234, 237, 240, 0.65)', textDecoration: 'none' }}>Critical Fire Alerts</Link></li>
                <li><Link to="/fire-alerts?tab=archive" style={{ color: 'rgba(234, 237, 240, 0.65)', textDecoration: 'none' }}>Download Telemetry Data</Link></li>
                <li><Link to="/home" style={{ color: 'rgba(234, 237, 240, 0.65)', textDecoration: 'none' }}>Mission Overview</Link></li>
              </ul>
            </div>

            <div>
              <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1rem' }}>
                Data Pipeline
              </h4>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem', color: 'rgba(234, 237, 240, 0.65)' }}>
                <li>SNPP VIIRS I-Band (375m)</li>
                <li>NOAA-20 VIIRS Infrared</li>
                <li>Terra & Aqua MODIS (1km)</li>
                <li>Uber H3 Resolution 8 Grid</li>
                <li>OpenStreetMap Infrastructure</li>
              </ul>
            </div>

            <div>
              <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.85rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '1rem' }}>
                System Status
              </h4>
              <div 
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.4rem 0.8rem',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(46, 204, 113, 0.12)',
                  border: '1px solid rgba(46, 204, 113, 0.3)',
                  fontSize: '0.78rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 700,
                  color: '#2ECC71',
                  marginBottom: '0.75rem'
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2ECC71' }} />
                <span>All Feeds Operational</span>
              </div>
              <p style={{ fontSize: '0.75rem', color: 'rgba(234, 237, 240, 0.45)', lineHeight: 1.4 }}>
                CatBoost 52-Feature v2.4 model inference active. Average latency &lt;180ms.
              </p>
            </div>
          </div>

          <div style={{ borderTop: '1px solid var(--hairline-border)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', color: 'rgba(234, 237, 240, 0.4)', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span>TRINETRA · Smart India Hackathon 2026 · Industrial Thermal Intelligence</span>
            <span>Spatial Remote Sensing & Deep Learning Platform</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
