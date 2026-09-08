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

      {/* Clean Dark Vignette Overlay */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, rgba(7, 10, 14, 0.45) 0%, rgba(7, 10, 14, 0.85) 75%, #070A0E 100%)',
          pointerEvents: 'none'
        }}
      />

      {/* Centered Gateway Content - Medium, Minimal, Elegant */}
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
          gap: '1.25rem',
          transform: isExiting ? 'translateY(-10px) scale(0.98)' : 'translateY(0) scale(1)',
          opacity: isExiting ? 0 : 1,
          transition: 'transform 380ms cubic-bezier(0.16, 1, 0.3, 1), opacity 380ms ease-out',
          textAlign: 'center',
          padding: '1.5rem'
        }}
      >
        {/* Minimal Trinetra Cybernetic Eye & Satellite Emblem (56x56) */}
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Subtle Ambient Glow */}
          <div 
            style={{
              position: 'absolute',
              width: '74px',
              height: '74px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 107, 53, 0.4) 0%, rgba(255, 107, 53, 0) 70%)',
              animation: 'pulseGlow 2.8s ease-in-out infinite'
            }}
          />

          <svg width="58" height="58" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ position: 'relative', zIndex: 2 }}>
            <defs>
              <linearGradient id="miniEmberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFA447" />
                <stop offset="50%" stopColor="#FF6B35" />
                <stop offset="100%" stopColor="#D74E26" />
              </linearGradient>

              <radialGradient id="miniCoreGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="50%" stopColor="#FFA447" />
                <stop offset="100%" stopColor="#FF6B35" />
              </radialGradient>
            </defs>

            {/* Outer Subtle Orbit Ring */}
            <circle 
              cx="50" 
              cy="50" 
              r="44" 
              stroke="rgba(255, 107, 53, 0.4)" 
              strokeWidth="1.2" 
              strokeDasharray="4 5" 
              style={{ animation: 'spinClockwise 16s linear infinite', transformOrigin: 'center' }}
            />

            {/* Reticle Cardinal Ticks */}
            <line x1="50" y1="4" x2="50" y2="11" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />
            <line x1="50" y1="89" x2="50" y2="96" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />
            <line x1="4" y1="50" x2="11" y2="50" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />
            <line x1="89" y1="50" x2="96" y2="50" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round" />

            {/* Trinetra Ocular Contour Path */}
            <path 
              d="M 18 50 C 32 26, 68 26, 82 50 C 68 74, 32 74, 18 50 Z" 
              fill="rgba(10, 14, 18, 0.85)" 
              stroke="url(#miniEmberGrad)" 
              strokeWidth="3" 
              strokeLinejoin="round"
            />

            {/* Vertical Inner Flame Aperture */}
            <path 
              d="M 50 30 C 58 40, 58 60, 50 70 C 42 60, 42 40, 50 30 Z" 
              fill="rgba(255, 107, 53, 0.25)" 
              stroke="rgba(255, 164, 71, 0.6)" 
              strokeWidth="1.2" 
            />

            {/* Concentric Thermal Infrared Core */}
            <circle cx="50" cy="50" r="11" fill="url(#miniCoreGlow)" />
            <circle cx="50" cy="50" r="4.5" fill="#FFFFFF" />
          </svg>
        </div>

        {/* Minimal Title & Clean Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem' }}>
          <div 
            style={{
              fontFamily: 'var(--font-heading)',
              fontSize: '1.65rem',
              fontWeight: 800,
              letterSpacing: '0.14em',
              color: '#FFFFFF',
              textShadow: '0 2px 14px rgba(0,0,0,0.8), 0 0 20px rgba(255, 107, 53, 0.4)',
              lineHeight: 1.1
            }}
          >
            TRINETRA
          </div>

          <div 
            style={{
              fontSize: '0.78rem',
              color: 'rgba(234, 237, 240, 0.75)',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-heading)',
              fontWeight: 500
            }}
          >
            Industrial Fire & Thermal Intelligence
          </div>
        </div>

        {/* Medium, Sleek, Minimal Start Button */}
        <button
          onClick={handleStart}
          style={{
            backgroundColor: '#FF6B35',
            backgroundImage: 'linear-gradient(135deg, #FF7E47 0%, #FF6B35 100%)',
            color: '#FFFFFF',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: '0.92rem',
            letterSpacing: '0.05em',
            padding: '0.65rem 1.85rem',
            borderRadius: '6px',
            border: '1px solid rgba(255, 255, 255, 0.25)',
            cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(255, 107, 53, 0.45)',
            transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.45rem',
            marginTop: '0.25rem'
          }}
          className="splash-start-btn-mini"
        >
          <span>Start</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" className="mini-arrow">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>

      <style>{`
        @keyframes splashPhotoZoom {
          from {
            transform: scale(1.04);
          }
          to {
            transform: scale(1.0);
          }
        }
        @keyframes spinClockwise {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { transform: scale(0.95); opacity: 0.5; }
          50% { transform: scale(1.15); opacity: 0.85; }
        }
        .splash-start-btn-mini:hover {
          transform: translateY(-2px);
          background-color: #ff7a4a !important;
          box-shadow: 0 6px 22px rgba(255, 107, 53, 0.65) !important;
        }
        .splash-start-btn-mini:hover .mini-arrow {
          transform: translateX(3px);
        }
        .splash-start-btn-mini:active {
          transform: translateY(1px) !important;
        }
        .mini-arrow {
          transition: transform 0.18s ease;
        }
      `}</style>
    </div>
  );
}
