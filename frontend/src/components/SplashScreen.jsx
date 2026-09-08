import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SplashScreen() {
  const navigate = useNavigate();
  const [isExiting, setIsExiting] = useState(false);

  const handleStart = () => {
    setIsExiting(true);
    setTimeout(() => {
      navigate('/home');
    }, 380);
  };

  return (
    <div 
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#070A0E',
        zIndex: 9999,
        opacity: isExiting ? 0 : 1,
        transition: 'opacity 380ms ease-out'
      }}
    >
      {/* Background Photo with Subtle Slow Idle Zoom */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `url(/images/hero-wildfire.jpg)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
          animation: 'splashPhotoZoom 8s ease-out forwards',
          pointerEvents: 'none'
        }}
      />

      {/* Radial Dark Vignette & Atmospheric Thermal Glow */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, rgba(7, 10, 14, 0.35) 0%, rgba(7, 10, 14, 0.88) 85%, #070A0E 100%)',
          pointerEvents: 'none'
        }}
      />

      {/* Subtle Animated Radar Sweep Line */}
      <div 
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '500px',
          height: '500px',
          margin: '-250px 0 0 -250px',
          borderRadius: '50%',
          background: 'conic-gradient(from 0deg at 50% 50%, rgba(255, 107, 53, 0) 0deg, rgba(255, 107, 53, 0.12) 300deg, rgba(255, 107, 53, 0.28) 360deg)',
          animation: 'radarSweep 5s linear infinite',
          pointerEvents: 'none',
          opacity: 0.7
        }}
      />

      {/* Centered Gateway Content */}
      <div 
        style={{
          position: 'relative',
          zIndex: 10,
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '1.75rem',
          transform: isExiting ? 'translateY(-12px) scale(0.98)' : 'translateY(0) scale(1)',
          opacity: isExiting ? 0 : 1,
          transition: 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 380ms ease-out',
          textAlign: 'center',
          padding: '2rem'
        }}
      >
        {/* Meaningful TRINETRA Emblem: The Cybernetic Third Eye & Satellite Thermal Radar */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Ambient Outer Pulse Halo */}
          <div 
            style={{
              position: 'absolute',
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 107, 53, 0.35) 0%, rgba(255, 107, 53, 0) 70%)',
              animation: 'pulseGlow 3s ease-in-out infinite'
            }}
          />

          {/* SVG Emblem Component */}
          <svg width="120" height="120" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', zIndex: 2 }}>
            <defs>
              <linearGradient id="triEmberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFA447" />
                <stop offset="50%" stopColor="#FF6B35" />
                <stop offset="100%" stopColor="#D74E26" />
              </linearGradient>

              <radialGradient id="triCoreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="40%" stopColor="#FFA447" />
                <stop offset="80%" stopColor="#FF6B35" />
                <stop offset="100%" stopColor="rgba(215, 78, 38, 0)" />
              </radialGradient>

              <filter id="triDropGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            {/* Outer Rotating Radar Orbit Track */}
            <circle 
              cx="50" 
              cy="50" 
              r="46" 
              stroke="rgba(255, 107, 53, 0.35)" 
              strokeWidth="1.2" 
              strokeDasharray="4 6" 
              style={{ animation: 'spinClockwise 18s linear infinite', transformOrigin: 'center' }}
            />

            {/* Concentric Telemetry Guide Ring */}
            <circle cx="50" cy="50" r="38" stroke="rgba(255, 255, 255, 0.15)" strokeWidth="1" />

            {/* Cardinal Reticle Markers (North, South, East, West) */}
            <line x1="50" y1="2" x2="50" y2="10" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />
            <line x1="50" y1="90" x2="50" y2="98" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />
            <line x1="2" y1="50" x2="10" y2="50" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />
            <line x1="90" y1="50" x2="98" y2="50" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />

            {/* Orbital Satellite Node */}
            <circle cx="50" cy="4" r="2.5" fill="#FFFFFF" filter="drop-shadow(0 0 4px #FFFFFF)" />

            {/* The Sanskrit "Third Eye" (Trinetra) Sacred & Cybernetic Ocular Contour */}
            <path 
              d="M 16 50 C 32 24, 68 24, 84 50 C 68 76, 32 76, 16 50 Z" 
              fill="rgba(10, 14, 18, 0.75)" 
              stroke="url(#triEmberGrad)" 
              strokeWidth="2.8" 
              strokeLinejoin="round"
              filter="url(#triDropGlow)"
            />

            {/* Vertical Third-Eye Inner Flame / Iris Aperture */}
            <path 
              d="M 50 28 C 60 40, 60 60, 50 72 C 40 60, 40 40, 50 28 Z" 
              fill="rgba(255, 107, 53, 0.18)" 
              stroke="rgba(255, 164, 71, 0.7)" 
              strokeWidth="1.2" 
            />

            {/* Concentric Thermal Infrared Iris Lens */}
            <circle cx="50" cy="50" r="13" fill="url(#triCoreGlow)" />
            <circle cx="50" cy="50" r="13" stroke="#FFA447" strokeWidth="1.2" />

            {/* Glowing Core Pupil - The Living Sensor Point */}
            <circle cx="50" cy="50" r="5" fill="#FFFFFF" filter="drop-shadow(0 0 6px #FFFFFF)" />
          </svg>
        </div>

        {/* Platform Title & Meaningful Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.45rem' }}>
          <div 
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '2.4rem',
              fontWeight: 800,
              letterSpacing: '0.18em',
              color: '#FFFFFF',
              textShadow: '0 0 30px rgba(255, 107, 53, 0.6), 0 2px 10px rgba(0,0,0,0.8)',
              lineHeight: 1
            }}
          >
            TRINETRA
          </div>

          <div 
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '0.85rem',
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent-ember)',
              textShadow: '0 0 16px rgba(255, 107, 53, 0.5)'
            }}
          >
            National Industrial Fire & Thermal Intelligence
          </div>

          <div 
            style={{
              fontSize: '0.8rem',
              color: 'rgba(234, 237, 240, 0.65)',
              letterSpacing: '0.04em',
              maxWidth: '420px',
              marginTop: '0.2rem'
            }}
          >
            VIIRS & MODIS Satellite Telemetry · Real-Time CatBoost AI Classification
          </div>
        </div>

        {/* Live Mission Status Badge */}
        <div 
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.85rem',
            borderRadius: '20px',
            backgroundColor: 'rgba(46, 204, 113, 0.12)',
            border: '1px solid rgba(46, 204, 113, 0.35)',
            fontSize: '0.74rem',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            color: '#2ECC71',
            letterSpacing: '0.06em',
            textTransform: 'uppercase'
          }}
        >
          <span 
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor: '#2ECC71',
              boxShadow: '0 0 8px #2ECC71',
              animation: 'pulseGreen 2s infinite'
            }}
          />
          <span>Telemetry Stream Online · Orbit Pass Synchronized</span>
        </div>

        {/* High-Tech Gateway Button */}
        <button
          onClick={handleStart}
          style={{
            position: 'relative',
            overflow: 'hidden',
            backgroundColor: '#FF6B35',
            backgroundImage: 'linear-gradient(135deg, #FF7E47 0%, #FF6B35 50%, #D74E26 100%)',
            color: '#FFFFFF',
            fontFamily: 'var(--font-heading)',
            fontWeight: 800,
            fontSize: '1.05rem',
            letterSpacing: '0.08em',
            padding: '1rem 3rem',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            cursor: 'pointer',
            boxShadow: '0 8px 32px rgba(255, 107, 53, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.4)',
            transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            marginTop: '0.5rem'
          }}
          className="splash-start-btn"
        >
          <span>ENTER PLATFORM</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" style={{ transition: 'transform 0.2s ease' }} className="btn-arrow">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes splashPhotoZoom {
          from {
            transform: scale(1.06);
          }
          to {
            transform: scale(1.0);
          }
        }
        @keyframes radarSweep {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes spinClockwise {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(0.95); opacity: 0.6; }
          50% { transform: scale(1.15); opacity: 0.9; }
        }
        @keyframes pulseGreen {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
        .splash-start-btn:hover {
          transform: translateY(-3px) scale(1.02);
          background-color: #ff7a4a !important;
          box-shadow: 0 14px 44px rgba(255, 107, 53, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.6) !important;
        }
        .splash-start-btn:hover .btn-arrow {
          transform: translateX(4px);
        }
        .splash-start-btn:active {
          transform: translateY(1px) scale(0.99) !important;
        }
      `}</style>
    </div>
  );
}
