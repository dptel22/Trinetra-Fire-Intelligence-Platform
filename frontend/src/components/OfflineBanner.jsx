import React, { useState, useEffect } from 'react';
import { getApiMode, onApiModeChange } from '../services/api';

// Inline keyframe injection — avoids requiring a separate CSS file for this component.
// Injected once into the document head at module evaluation time.
const PULSE_STYLE_ID = 'offline-banner-pulse-style';
if (typeof document !== 'undefined' && !document.getElementById(PULSE_STYLE_ID)) {
  const style = document.createElement('style');
  style.id = PULSE_STYLE_ID;
  style.textContent = `
    @keyframes offlinePulse {
      0%, 100% { opacity: 1; box-shadow: 0 0 10px #F1C40F; }
      50%       { opacity: 0.45; box-shadow: 0 0 4px #F1C40F; }
    }
  `;
  document.head.appendChild(style);
}

/**
 * OfflineBanner component
 * Displays a non-blocking banner when the frontend is running in mock/demo mode.
 * The status dot pulses to ensure the offline state is unmissable.
 * 
 * Props:
 * - mode: (optional) 'live' | 'mock'. If omitted, subscribes to API mode changes.
 */
export default function OfflineBanner({ mode: propMode }) {
  const [apiMode, setApiMode] = useState(() => getApiMode());

  useEffect(() => {
    if (propMode !== undefined) {
      return;
    }
    const unsubscribe = onApiModeChange((newMode) => {
      setApiMode(newMode);
    });
    return () => unsubscribe();
  }, [propMode]);

  const activeMode = propMode !== undefined ? propMode : apiMode;

  if (activeMode !== 'mock') {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        pointerEvents: 'none', // Prevents blocking map interaction underneath
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          pointerEvents: 'auto',
          backgroundColor: 'rgba(26, 18, 8, 0.96)',
          color: '#F1C40F',
          border: '1.5px solid #F1C40F',
          borderRadius: '24px',
          padding: '8px 20px',
          fontSize: '0.82rem',
          fontWeight: 700,
          fontFamily: 'var(--font-heading, system-ui, sans-serif)',
          letterSpacing: '0.04em',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.6), 0 0 12px rgba(241, 196, 15, 0.3)',
          backdropFilter: 'blur(10px)'
        }}
      >
        <span
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#F1C40F',
            boxShadow: '0 0 10px #F1C40F',
            display: 'inline-block',
            flexShrink: 0,
            animation: 'offlinePulse 1.6s ease-in-out infinite'
          }}
        />
        <span>DEMO / OFFLINE MODE — Live backend unreachable. Displaying simulated hotspot data.</span>
      </div>
    </div>
  );
}
