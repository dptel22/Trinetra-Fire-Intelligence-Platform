import React, { useEffect, useState } from 'react';

/**
 * Reusable, theme-reactive TRINETRA brand identity component.
 * 
 * Supports:
 * - variant="compact" (default): 32px circular satellite emblem + styled vector text
 * - variant="mark": circular satellite emblem only
 * - variant="full": wide horizontal graphical lockup
 * 
 * Theme awareness:
 * - Automatically listens to [data-theme] changes on <html> or respects an explicit `theme` prop.
 * - In Dark Mode: Uses the high-contrast metallic platinum satellite emblem + white "TRI".
 * - In Light Mode: Uses the dark charcoal satellite emblem + dark "TRI".
 */
export default function TrinetraBrand({
  variant = 'compact',
  size = 32,
  theme: explicitTheme,
  showSubtitle = true,
  className = '',
  style = {}
}) {
  const [inferredTheme, setInferredTheme] = useState(() => {
    return document.documentElement.getAttribute('data-theme') || 
           localStorage.getItem('trinetra_theme') || 
           'light';
  });

  useEffect(() => {
    if (explicitTheme) return;

    const observer = new MutationObserver(() => {
      const active = document.documentElement.getAttribute('data-theme') || 'light';
      setInferredTheme(active);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    });

    return () => observer.disconnect();
  }, [explicitTheme]);

  const currentTheme = explicitTheme || inferredTheme;

  const isDark = currentTheme === 'dark';
  const emblemSrc = isDark ? '/images/trinetra-emblem-dark.png' : '/images/trinetra-emblem-light.png';
  const logoSrc = isDark ? '/images/trinetra-logo-dark.png' : '/images/trinetra-logo-light.png';

  if (variant === 'full') {
    return (
      <div 
        className={`trinetra-brand-full ${className}`}
        style={{ display: 'inline-flex', alignItems: 'center', ...style }}
      >
        <img
          src={logoSrc}
          alt="TRINETRA Industrial Fire Intelligence"
          style={{
            height: typeof size === 'number' ? `${size}px` : size,
            width: 'auto',
            display: 'block',
            maxWidth: '100%',
            objectFit: 'contain'
          }}
        />
      </div>
    );
  }

  if (variant === 'mark') {
    return (
      <div 
        className={`trinetra-brand-mark ${className}`}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          ...style
        }}
      >
        <img
          src={emblemSrc}
          alt="TRINETRA Emblem"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'contain'
          }}
        />
      </div>
    );
  }

  // Default: variant === 'compact' (emblem mark + styled vector typography)
  // `size` directly controls the emblem image px — text is derived proportionally
  const emblemPx = size;
  const wordmarkFs = Math.max(1.25, size * 0.030); // rem — kept proportional but emblem leads
  const subtitleFs = Math.max(0.68, size * 0.016); // rem

  return (
    <div 
      className={`trinetra-brand-compact ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.6rem',
        textDecoration: 'none',
        ...style
      }}
    >
      {/* High-res circular emblem mark — height matched to text column */}
      <div 
        style={{
          width: `${emblemPx}px`,
          height: `${emblemPx}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          filter: isDark ? 'drop-shadow(0 0 12px rgba(255, 107, 53, 0.45))' : 'drop-shadow(0 2px 8px rgba(0, 0, 0, 0.12))',
          transition: 'filter 0.25s ease'
        }}
      >
        <img
          src={emblemSrc}
          alt="TRINETRA Emblem"
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'contain'
          }}
        />
      </div>

      {/* Stylized Wordmark + Subtitle */}
      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', lineHeight: 1.1 }}>
          <span 
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 850,
              fontSize: `${wordmarkFs}rem`,
              color: isDark ? '#FFFFFF' : '#1E293B',
              letterSpacing: '0.04em',
              transition: 'color 0.25s ease'
            }}
          >
            TRI
          </span>
          <span 
            style={{
              fontFamily: 'var(--font-heading)',
              fontWeight: 850,
              fontSize: `${wordmarkFs}rem`,
              background: 'linear-gradient(135deg, #FF6B35 0%, #E65100 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.04em',
              position: 'relative'
            }}
          >
            NETRA
          </span>
        </div>

        {showSubtitle && (
          <span 
            style={{
              fontSize: `${subtitleFs}rem`,
              color: isDark ? '#94A3B8' : '#475569',
              fontWeight: 550,
              letterSpacing: '0.03em',
              marginTop: '3px',
              transition: 'color 0.25s ease'
            }}
          >
            Industrial Fire Intelligence
          </span>
        )}
      </div>
    </div>
  );
}
