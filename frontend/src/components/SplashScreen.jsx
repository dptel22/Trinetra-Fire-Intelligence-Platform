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
        background: '#0A0E12',
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

      {/* Radial Overlay Gradient */}
      <div 
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at center, rgba(5, 7, 10, 0.25) 0%, rgba(5, 7, 10, 0.8) 100%)',
          pointerEvents: 'none'
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
          gap: '2.5rem',
          transform: isExiting ? 'translateY(-8px)' : 'translateY(0)',
          opacity: isExiting ? 0 : 1,
          transition: 'transform 380ms ease-out, opacity 380ms ease-out'
        }}
      >
        {/* Glowing Circular Ember Logo Mark */}
        <div 
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#FF6B35',
            boxShadow: '0 0 40px rgba(255, 107, 53, 0.85), 0 0 80px rgba(255, 107, 53, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <div 
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              backgroundColor: '#FFFFFF',
              boxShadow: '0 0 12px #FFFFFF'
            }}
          />
        </div>

        {/* Single "Start" Gateway Button */}
        <button
          onClick={handleStart}
          style={{
            backgroundColor: '#FF6B35',
            color: '#0A0E12',
            fontFamily: 'var(--font-heading)',
            fontWeight: 700,
            fontSize: '1.15rem',
            letterSpacing: '0.04em',
            padding: '0.9rem 2.75rem',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 4px 20px rgba(255, 107, 53, 0.4)',
            transition: 'transform 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease'
          }}
          className="splash-start-btn"
        >
          Start
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
        .splash-start-btn:hover {
          transform: translateY(-2px);
          background-color: #ff7a4a !important;
          box-shadow: 0 6px 28px rgba(255, 107, 53, 0.6) !important;
        }
        .splash-start-btn:active {
          transform: translateY(1px) !important;
        }
      `}</style>
    </div>
  );
}
