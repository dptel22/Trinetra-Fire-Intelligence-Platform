import React, { useState, useEffect } from 'react';
import { getApiMode, onApiModeChange } from '../services/api';

/**
 * OfflineBanner component
 * Displays a non-blocking banner when the frontend is running in mock/demo mode.
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
          backgroundColor: 'rgba(30, 34, 42, 0.95)',
          color: '#F1C40F',
          border: '1px solid rgba(241, 196, 15, 0.4)',
          borderRadius: '20px',
          padding: '6px 16px',
          fontSize: '0.8rem',
          fontWeight: 600,
          fontFamily: 'var(--font-heading, system-ui, sans-serif)',
          letterSpacing: '0.03em',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
          backdropFilter: 'blur(8px)'
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#F1C40F',
            boxShadow: '0 0 8px #F1C40F',
            display: 'inline-block'
          }}
        />
        <span>Showing demo data — live backend unreachable</span>
      </div>
    </div>
  );
}
