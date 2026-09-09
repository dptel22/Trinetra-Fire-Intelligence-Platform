import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { FIRE_COLORS } from '../services/api';

const SEARCH_HOTSPOTS = [
  {
    id: 'jamnagar',
    name: 'Jamnagar Petrochemical Complex',
    region: 'Gujarat',
    type: 'industrial',
    typeLabel: 'Industrial / Petrochemical Flare',
    h3: '88209a2011fffff',
    lat: 22.4707,
    lon: 70.0577,
    desc: 'World largest refining hub flare stack & FCCU thermal anomalies.',
    frp: '94.2 MW',
    confidence: 96
  },
  {
    id: 'paradip',
    name: 'Paradip Port & Bulk Cargo Terminal',
    region: 'Odisha',
    type: 'industrial',
    typeLabel: 'Industrial Logistics & Smelting',
    h3: '8820839089fffff',
    lat: 20.2644,
    lon: 86.6713,
    desc: 'IOCL Refinery, Pellet Plant & maritime bulk terminal thermal perimeter.',
    frp: '78.5 MW',
    confidence: 94
  },
  {
    id: 'bhilai',
    name: 'Bhilai Steel Plant & Smelter',
    region: 'Chhattisgarh',
    type: 'industrial',
    typeLabel: 'Metallurgical Smelter / Blast Furnace',
    h3: '88209a2053fffff',
    lat: 21.1938,
    lon: 81.3509,
    desc: 'Heavy industrial metallurgical blast furnace thermal emission cluster.',
    frp: '112.4 MW',
    confidence: 97
  },
  {
    id: 'singrauli',
    name: 'Singrauli Open-Cast Coal Field',
    region: 'Madhya Pradesh',
    type: 'mining',
    typeLabel: 'Coal Mining & Power Complex',
    h3: '88209a208bfffff',
    lat: 24.1994,
    lon: 82.6644,
    desc: 'Continuous pit mining spontaneous combustion and thermal power perimeter.',
    frp: '62.1 MW',
    confidence: 88
  },
  {
    id: 'ramgarh',
    name: 'Ramgarh Coal Belt Extraction Pit',
    region: 'Jharkhand',
    type: 'mining',
    typeLabel: 'Subsurface Seam Combustion',
    h3: '88209a20a5fffff',
    lat: 23.6102,
    lon: 85.2799,
    desc: 'Persistent underground coal seam smoldering anomaly.',
    frp: '45.0 MW',
    confidence: 82
  },
  {
    id: 'shimla',
    name: 'Shimla Pine Forest Canopy Ridge',
    region: 'Himachal Pradesh',
    type: 'wildfire',
    typeLabel: 'Coniferous Canopy Wildfire',
    h3: '88209a20edfffff',
    lat: 31.1048,
    lon: 77.1734,
    desc: 'Steep montane terrain pine needles high-intensity flame front.',
    frp: '84.0 MW',
    confidence: 91
  },
  {
    id: 'dehradun',
    name: 'Dehradun Valley Perimeter Forest',
    region: 'Uttarakhand',
    type: 'wildfire',
    typeLabel: 'Shivalik Foothills Wildfire',
    h3: '88209a2037fffff',
    lat: 30.3165,
    lon: 78.0322,
    desc: 'Dry deciduous and mixed forest fire front advancing along valley floor.',
    frp: '68.5 MW',
    confidence: 89
  },
  {
    id: 'ludhiana',
    name: 'Ludhiana Agricultural Stubble Zone',
    region: 'Punjab',
    type: 'agricultural_burn',
    typeLabel: 'Paddy Residue Stubble Burn',
    h3: '88209a2069fffff',
    lat: 30.9010,
    lon: 75.8573,
    desc: 'Post-monsoon seasonal crop residue burning event in open fields.',
    frp: '34.8 MW',
    confidence: 76
  },
  {
    id: 'karnal',
    name: 'Karnal Crop Residue Sector',
    region: 'Haryana',
    type: 'agricultural_burn',
    typeLabel: 'Agricultural Field Burn',
    h3: '88209a2071fffff',
    lat: 29.9457,
    lon: 76.8173,
    desc: 'Transient agricultural burn detected along GT Karnal road corridor.',
    frp: '29.2 MW',
    confidence: 73
  },
  {
    id: 'pune',
    name: 'Pune Industrial Sub-Periphery',
    region: 'Maharashtra',
    type: 'unclassified',
    typeLabel: 'Unclassified Thermal Signature',
    h3: '88209a20b7fffff',
    lat: 18.5204,
    lon: 73.8567,
    desc: 'Thermal anomaly near manufacturing park undergoing CatBoost verification.',
    frp: '18.4 MW',
    confidence: 58
  }
];

export default function QuickSearchModal({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') onClose();
      };
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filtered = SEARCH_HOTSPOTS.filter(item => {
    const matchesType = selectedType === 'all' || item.type === selectedType;
    if (!matchesType) return false;
    if (!query.trim()) return true;

    const q = query.toLowerCase().trim();
    return (
      item.name.toLowerCase().includes(q) ||
      item.region.toLowerCase().includes(q) ||
      item.typeLabel.toLowerCase().includes(q) ||
      item.h3.toLowerCase().includes(q) ||
      item.desc.toLowerCase().includes(q)
    );
  });

  const handleSelectHotspot = (item) => {
    onClose();
    // Dispatch custom event for active map if already mounted
    window.dispatchEvent(new CustomEvent('trinetra:locate', { detail: item }));
    // Navigate with query params
    navigate(`/fire-map?lat=${item.lat}&lon=${item.lon}&h3=${item.h3}&name=${encodeURIComponent(item.name)}`);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        zIndex: 10000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '3rem 1.25rem 1.5rem 1.25rem',
        animation: 'fadeIn 0.18s ease-out'
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--panel-surface)',
          color: 'var(--text-primary)',
          borderRadius: '14px',
          maxWidth: '720px',
          width: '100%',
          maxHeight: '85vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 65px rgba(0, 0, 0, 0.5), 0 0 0 1px var(--hairline-border)',
          border: '1px solid var(--hairline-border)',
          overflow: 'hidden'
        }}
      >
        {/* Search Header Bar */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--hairline-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #3D9DE8 0%, #1E6091 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>

            <div style={{ flex: 1, position: 'relative' }}>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by H3 Cell (88209a...), Landmark (Jamnagar, Paradip...), or State..."
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--text-primary)',
                  fontSize: '1.1rem',
                  fontFamily: 'var(--font-heading)',
                  fontWeight: 600
                }}
              />
            </div>

            {query && (
              <button
                onClick={() => setQuery('')}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px'
                }}
                title="Clear input"
              >
                ✕
              </button>
            )}

            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                border: '1px solid var(--hairline-border)',
                borderRadius: '6px',
                padding: '4px 8px',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontFamily: 'var(--font-heading)'
              }}
            >
              ESC
            </button>
          </div>

          {/* Quick Filter Categories */}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', flexWrap: 'wrap' }}>
            {[
              { id: 'all', label: 'All Sources' },
              { id: 'industrial', label: 'Industrial / Flares' },
              { id: 'wildfire', label: 'Wildfire Fronts' },
              { id: 'mining', label: 'Mining Pits' },
              { id: 'agricultural_burn', label: 'Crop Residue' }
            ].map(cat => {
              const active = selectedType === cat.id;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedType(cat.id)}
                  style={{
                    fontSize: '0.78rem',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    border: '1px solid',
                    borderColor: active ? 'var(--accent-ember)' : 'var(--hairline-border)',
                    backgroundColor: active ? 'rgba(255, 107, 53, 0.15)' : 'transparent',
                    color: active ? 'var(--accent-ember)' : 'var(--text-muted)',
                    cursor: 'pointer',
                    fontWeight: active ? 700 : 500,
                    fontFamily: 'var(--font-heading)',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Results List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔍</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
                No thermal hotspots found
              </div>
              <p style={{ fontSize: '0.88rem', maxWidth: '400px', margin: '0 auto' }}>
                No match for "{query}". Try searching by state (e.g. Gujarat, Odisha), landmark name, or class (Wildfire, Industrial).
              </p>
            </div>
          ) : (
            filtered.map((item) => {
              const color = FIRE_COLORS[item.type] || '#787878';
              return (
                <div
                  key={item.id}
                  onClick={() => handleSelectHotspot(item)}
                  style={{
                    padding: '0.9rem 1.1rem',
                    borderRadius: '10px',
                    border: '1px solid var(--hairline-border)',
                    backgroundColor: 'rgba(255, 255, 255, 0.02)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '1rem',
                    cursor: 'pointer',
                    transition: 'background 0.18s ease, transform 0.15s ease, border-color 0.18s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 107, 53, 0.06)';
                    e.currentTarget.style.borderColor = color;
                    e.currentTarget.style.transform = 'translateY(-1px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                    e.currentTarget.style.borderColor = 'var(--hairline-border)';
                    e.currentTarget.style.transform = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: color,
                        marginTop: '6px',
                        boxShadow: `0 0 8px ${color}`,
                        flexShrink: 0
                      }}
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)' }}>
                          {item.name}
                        </span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          · {item.region}
                        </span>
                        <span
                          style={{
                            fontSize: '0.7rem',
                            padding: '2px 7px',
                            borderRadius: '4px',
                            backgroundColor: `${color}22`,
                            color: color,
                            fontWeight: 700,
                            fontFamily: 'var(--font-heading)',
                            border: `1px solid ${color}55`
                          }}
                        >
                          {item.typeLabel}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.83rem', color: 'var(--text-muted)', lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {item.desc}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <span>H3: <code style={{ fontFamily: 'monospace', color: 'var(--text-primary)' }}>{item.h3}</code></span>
                        <span>FRP: <strong style={{ color: 'var(--text-primary)' }}>{item.frp}</strong></span>
                        <span>Confidence: <strong style={{ color: color }}>{item.confidence}%</strong></span>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-heading)',
                      fontWeight: 700,
                      color: 'var(--accent-ember)',
                      padding: '0.4rem 0.75rem',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(255, 107, 53, 0.1)',
                      flexShrink: 0
                    }}
                  >
                    <span>Inspect</span>
                    <span>→</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info banner */}
        <div
          style={{
            padding: '0.75rem 1.5rem',
            borderTop: '1px solid var(--hairline-border)',
            backgroundColor: 'rgba(0,0,0,0.1)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.78rem',
            color: 'var(--text-muted)'
          }}
        >
          <span>Indexed over Uber H3 Res 8 (~0.7 km² spatial cells)</span>
          <span>Click any detection to zoom and inspect on Fire Map</span>
        </div>
      </div>
    </div>
  );
}
