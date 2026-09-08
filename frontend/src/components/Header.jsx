import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import QuickSearchModal from './QuickSearchModal';
import AnnouncementsModal from './AnnouncementsModal';
import FeedbackModal from './FeedbackModal';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showTutorials, setShowTutorials] = useState(false);
  const [showFaqs, setShowFaqs] = useState(false);
  const [faqOpenIdx, setFaqOpenIdx] = useState(null);

  // Modals for Quick Search, Announcements, and Feedback
  const [showSearch, setShowSearch] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [unreadAnnouncements, setUnreadAnnouncements] = useState(3);
  const [showFeedback, setShowFeedback] = useState(false);

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('trinetra_theme') || 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('trinetra_theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const closeDrawer = () => setMobileOpen(false);

  const handleNav = (path) => {
    closeDrawer();
    navigate(path);
  };

  const faqsList = [
    {
      q: 'How often is satellite thermal detection data updated?',
      a: 'Thermal anomaly feeds update multiple times daily following SNPP/NOAA-20 VIIRS and TERRA/AQUA MODIS satellite orbital passes (typically every 3 to 6 hours over India).'
    },
    {
      q: 'How does TRINETRA distinguish industrial flares from wildfires?',
      a: 'Our CatBoost ML model processes 52 features including persistence over time, thermal intensity variance, land cover type, and spatial proximity to known refinery and industrial coordinates.'
    },
    {
      q: 'What is the Uber H3 spatial resolution used by the system?',
      a: 'TRINETRA indexes all detections using Uber H3 Resolution 8 spatial grid cells (~0.7 km² area), allowing instant spatial boundary joins and proximity queries.'
    },
    {
      q: 'Can I download historical archived thermal data?',
      a: 'Yes! Navigate to Download Archived Data from the menu or Fire Alerts panel to export past thermal detections in CSV or GeoJSON format.'
    }
  ];

  return (
    <>
      <header 
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1000,
          backgroundColor: theme === 'light' ? '#FFFFFF' : '#0A0E12',
          borderBottom: '1px solid var(--hairline-border)',
          padding: '1rem 2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          transition: 'background-color 0.25s ease'
        }}
      >
        {/* Left Group: Hamburger + Logo Mark + Title & Tagline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <button 
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation menu"
            style={{
              background: 'transparent',
              border: '1px solid var(--hairline-border)',
              color: 'var(--text-muted)',
              padding: '0.45rem',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease'
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          <Link to="/home" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div 
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-ember)',
                boxShadow: '0 0 12px rgba(255, 107, 53, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FFFFFF' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: 1.1 }}>
                TRINETRA
              </span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                Industrial Fire Intelligence
              </span>
            </div>
          </Link>
        </div>

        {/* Right Group: Navigation Options & Theme Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
          <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center' }}>
            {/* Quick Search */}
            <a 
              href="#search" 
              onClick={(e) => { e.preventDefault(); setShowSearch(true); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontSize: '1.05rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.2s ease'
              }}
              className="header-opt-link"
            >
              <div 
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, #3D9DE8 0%, #1E6091 100%)',
                  border: '1.5px solid #FFFFFF',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 2px 8px rgba(61, 157, 232, 0.5)',
                  flexShrink: 0
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
              <span>Quick Search</span>
            </a>

            {/* Announcements */}
            <a 
              href="#announcements" 
              onClick={(e) => { e.preventDefault(); setShowAnnouncements(true); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontSize: '1.05rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.2s ease'
              }}
              className="header-opt-link"
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="#F1C40F" stroke="#F1C40F" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M3 11l18-5v12L3 13v-2z" />
                  <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" fill="none" stroke="#F1C40F" strokeWidth="2" />
                </svg>
                {unreadAnnouncements > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: '-5px',
                      right: '-7px',
                      backgroundColor: 'var(--accent-ember)',
                      color: '#FFFFFF',
                      fontSize: '0.65rem',
                      fontWeight: 800,
                      borderRadius: '50%',
                      width: '16px',
                      height: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: '0 0 8px rgba(255, 107, 53, 0.9)'
                    }}
                  >
                    {unreadAnnouncements}
                  </span>
                )}
              </div>
              <span>Announcements</span>
            </a>

            {/* Feedback */}
            <a 
              href="#feedback" 
              onClick={(e) => { e.preventDefault(); setShowFeedback(true); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                color: 'var(--text-primary)',
                textDecoration: 'none',
                fontSize: '1.05rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.2s ease'
              }}
              className="header-opt-link"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Feedback</span>
            </a>

            {/* Dynamic Light / Dark Theme Toggle Button */}
            <button 
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--panel-surface)',
                border: '1px solid var(--hairline-border)',
                color: 'var(--text-primary)',
                padding: '0.45rem 0.85rem',
                borderRadius: '20px',
                cursor: 'pointer',
                fontSize: '0.85rem',
                fontFamily: 'var(--font-heading)',
                fontWeight: 600,
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                transition: 'all 0.2s ease',
                marginLeft: '0.5rem'
              }}
            >
              {theme === 'dark' ? (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F1C40F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                  <span>Light</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3D9DE8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                  <span>Dark</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* NASA FIRMS Style Side Navigation Drawer Backdrop */}
      {mobileOpen && (
        <div 
          onClick={closeDrawer}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(4px)',
            zIndex: 9998,
            transition: 'opacity 0.25s ease'
          }}
        />
      )}

      {/* NASA FIRMS Style Side Navigation Drawer Container - Theme Aware */}
      <div 
        className="side-drawer-container"
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: '360px',
          maxWidth: '85vw',
          zIndex: 9999,
          boxShadow: theme === 'light' ? '12px 0 35px rgba(0, 0, 0, 0.15)' : '12px 0 35px rgba(0, 0, 0, 0.7)',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflowY: 'auto'
        }}
      >
        {/* Ember Orange Header Banner */}
        <div className="drawer-header-orange">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
            <div 
              style={{
                width: '26px',
                height: '26px',
                borderRadius: '50%',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 0 10px rgba(255, 255, 255, 0.5)'
              }}
            >
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#D74E26' }} />
            </div>
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '0.04em', color: '#FFFFFF' }}>
              TRINETRA
            </span>
          </div>

          <button 
            onClick={closeDrawer}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FFFFFF',
              cursor: 'pointer',
              padding: '0.2rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Drawer Menu List Items */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          {/* Active Highlighted Row: FIRE MAP */}
          <div 
            onClick={() => handleNav('/fire-map')}
            className="drawer-active-row-orange"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: '0.9rem', letterSpacing: '0.06em', color: '#FFFFFF' }}>
                FIRE MAP
              </span>
            </div>
            <div 
              style={{
                fontSize: '0.72rem',
                color: 'rgba(255, 255, 255, 0.95)',
                backgroundColor: 'rgba(0, 0, 0, 0.22)',
                padding: '4px 8px',
                borderRadius: '4px',
                marginLeft: '2.1rem'
              }}
            >
              Interactively browse global MODIS & VIIRS thermal fire locations over India
            </div>
          </div>

          {/* Item 2: ACTIVE FIRE DATA */}
          <div 
            onClick={() => handleNav('/fire-map?filter=active')}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z" />
            </svg>
            <span>ACTIVE FIRE DATA</span>
          </div>

          {/* Item 3: SATELLITE IMAGERY */}
          <div 
            onClick={() => handleNav('/fire-map?layer=satellite')}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span>SATELLITE IMAGERY</span>
          </div>

          {/* Item 4: FIRE ALERTS */}
          <div 
            onClick={() => handleNav('/fire-alerts')}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span>FIRE ALERTS</span>
          </div>

          {/* Item 5: DOWNLOAD ARCHIVED DATA */}
          <div 
            onClick={() => handleNav('/fire-alerts?tab=archive')}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="21 8 21 21 3 21 3 8" />
              <rect x="1" y="3" width="22" height="5" />
              <line x1="10" y1="12" x2="14" y2="12" />
            </svg>
            <span>DOWNLOAD ARCHIVED DATA</span>
          </div>

          {/* Item 6: TUTORIALS */}
          <div 
            onClick={() => { closeDrawer(); setShowTutorials(true); }}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>TUTORIALS</span>
          </div>

          {/* Item 7: FAQS */}
          <div 
            onClick={() => { closeDrawer(); setShowFaqs(true); }}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>FAQS</span>
          </div>

          {/* Item 8: QUICK SEARCH */}
          <div 
            onClick={() => { closeDrawer(); setShowSearch(true); }}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <span>QUICK SEARCH</span>
          </div>

          {/* Item 9: ANNOUNCEMENTS */}
          <div 
            onClick={() => { closeDrawer(); setShowAnnouncements(true); }}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 11l18-5v12L3 13v-2z" />
              <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" fill="none" stroke="#FFFFFF" strokeWidth="2" />
            </svg>
            <span>ANNOUNCEMENTS {unreadAnnouncements > 0 ? `(${unreadAnnouncements})` : ''}</span>
          </div>

          {/* Item 10: FEEDBACK */}
          <div 
            onClick={() => { closeDrawer(); setShowFeedback(true); }}
            className="drawer-item-row"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>FEEDBACK</span>
          </div>
        </div>
      </div>

      {/* Tutorials Modal */}
      {showTutorials && (
        <div 
          onClick={() => setShowTutorials(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--panel-surface)',
              color: 'var(--text-primary)',
              borderRadius: '12px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '2rem',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--hairline-border)',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800 }}>
                TRINETRA Platform Tutorials
              </h2>
              <button 
                onClick={() => setShowTutorials(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div style={{ backgroundColor: 'rgba(255, 107, 53, 0.08)', border: '1px solid rgba(255, 107, 53, 0.25)', padding: '1rem 1.25rem', borderRadius: '8px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: '#D74E26', marginBottom: '0.4rem' }}>
                  1. Satellite Thermal Sensor Processing
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Learn how VIIRS I-Band (375m) and MODIS (1km) satellite thermal channels detect high-temperature surface anomalies across industrial regions.
                </p>
              </div>

              <div style={{ backgroundColor: 'rgba(61, 157, 232, 0.08)', border: '1px solid rgba(61, 157, 232, 0.25)', padding: '1rem 1.25rem', borderRadius: '8px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: '#3D9DE8', marginBottom: '0.4rem' }}>
                  2. CatBoost Industrial Flare Classification
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Discover how 52 spatial and temporal features isolate petrochemical gas flares and power plant emissions from open canopy wildfires.
                </p>
              </div>

              <div style={{ backgroundColor: 'rgba(255, 107, 53, 0.08)', border: '1px solid rgba(255, 107, 53, 0.25)', padding: '1rem 1.25rem', borderRadius: '8px' }}>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.05rem', color: '#D74E26', marginBottom: '0.4rem' }}>
                  3. Uber H3 Hexagonal Grid Inspection
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Click any hex on the Fire Map to inspect confidence scores, fire radiative power (FRP in MW), and nearest infrastructure distances.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FAQs Modal */}
      {showFaqs && (
        <div 
          onClick={() => setShowFaqs(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(6px)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem'
          }}
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: 'var(--panel-surface)',
              color: 'var(--text-primary)',
              borderRadius: '12px',
              maxWidth: '650px',
              width: '100%',
              maxHeight: '85vh',
              overflowY: 'auto',
              padding: '2rem',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.4)',
              border: '1px solid var(--hairline-border)',
              textAlign: 'left'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
              <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', fontWeight: 800 }}>
                Frequently Asked Questions
              </h2>
              <button 
                onClick={() => setShowFaqs(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {faqsList.map((faq, idx) => (
                <div 
                  key={idx}
                  style={{
                    border: '1px solid var(--hairline-border)',
                    borderRadius: '8px',
                    overflow: 'hidden'
                  }}
                >
                  <button 
                    onClick={() => setFaqOpenIdx(faqOpenIdx === idx ? null : idx)}
                    style={{
                      width: '100%',
                      padding: '1rem 1.25rem',
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--text-primary)',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 700,
                      fontSize: '0.95rem',
                      textAlign: 'left',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <span>{faq.q}</span>
                    <span>{faqOpenIdx === idx ? '−' : '+'}</span>
                  </button>

                  {faqOpenIdx === idx && (
                    <div style={{ padding: '0 1.25rem 1rem 1.25rem', fontSize: '0.9rem', color: 'var(--text-muted)', lineHeight: 1.55 }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Search Modal */}
      <QuickSearchModal 
        isOpen={showSearch} 
        onClose={() => setShowSearch(false)} 
      />

      {/* Announcements Modal */}
      <AnnouncementsModal 
        isOpen={showAnnouncements} 
        onClose={() => setShowAnnouncements(false)} 
        onClearBadge={() => setUnreadAnnouncements(0)} 
      />

      {/* Feedback Modal */}
      <FeedbackModal 
        isOpen={showFeedback} 
        onClose={() => setShowFeedback(false)} 
      />
    </>
  );
}

