import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMapEvents } from 'react-leaflet';
import Header from './Header';
import DataReliabilityBlock from './DataReliabilityBlock';
import { fetchPredictions, getH3Boundary, FIRE_COLORS, FIRE_LABELS, FIRE_CAVEATS } from '../services/api';

function MapViewportListener({ onBoundsChange }) {
  const map = useMapEvents({
    moveend: () => {
      const b = map.getBounds();
      onBoundsChange({
        min_lat: b.getSouth(),
        max_lat: b.getNorth(),
        min_lon: b.getWest(),
        max_lon: b.getEast()
      });
    }
  });
  return null;
}

export default function FireMapPage() {
  const [predictions, setPredictions] = useState([]);
  const [dateRange, setDateRange] = useState('24hrs');
  const [acqDate, setAcqDate] = useState('2025-01-26');
  const [activeClasses, setActiveClasses] = useState({
    industrial: true,
    wildfire: true,
    mining: true,
    agricultural_burn: true,
    unclassified: true
  });
  const [activeHex, setActiveHex] = useState(null);

  const [viewport, setViewport] = useState({
    min_lat: 8.0,
    max_lat: 36.0,
    min_lon: 68.0,
    max_lon: 97.0
  });

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      const res = await fetchPredictions({ ...viewport, acq_date: acqDate });
      if (isMounted && res?.predictions) {
        setPredictions(res.predictions);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [acqDate, viewport]);

  const toggleClass = (cls) => {
    setActiveClasses(prev => ({ ...prev, [cls]: !prev[cls] }));
  };

  const filteredPredictions = predictions.filter(p => activeClasses[p.predicted_class]);

  return (
    <div style={{ backgroundColor: '#0A0E12', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <Header />

      {/* Main Two-Pane Layout */}
      <div style={{ flex: 1, display: 'flex', position: 'relative', width: '100%', height: 'calc(100vh - 65px)' }}>
        {/* Left Pane: Interactive Map Surface */}
        <div style={{ flex: 1, height: '100%', position: 'relative' }}>
          <MapContainer
            center={[22.5937, 78.9629]}
            zoom={5}
            style={{ width: '100%', height: '100%', background: '#080b0e' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution="&copy; OpenStreetMap &copy; CARTO"
            />

            <MapViewportListener onBoundsChange={(nb) => setViewport(nb)} />

            {filteredPredictions.map((pred) => {
              const boundary = getH3Boundary(pred.h3_index || pred.cell_id);
              const color = FIRE_COLORS[pred.predicted_class] || FIRE_COLORS.unclassified;
              const isSelected = activeHex?.h3_index === pred.h3_index;

              if (boundary && boundary.length > 0) {
                return (
                  <Polygon
                    key={pred.h3_index || pred.cell_id}
                    positions={boundary}
                    pathOptions={{
                      color: color,
                      fillColor: color,
                      fillOpacity: isSelected ? 0.9 : (pred.predicted_class === 'unclassified' ? 0.3 : 0.55),
                      weight: isSelected ? 3 : 1
                    }}
                    eventHandlers={{
                      click: () => setActiveHex(pred)
                    }}
                  >
                    <Tooltip sticky>
                      <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', textAlign: 'left', minWidth: '180px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                          <strong style={{ color: color, fontFamily: 'var(--font-heading)' }}>
                            {FIRE_LABELS[pred.predicted_class] || pred.predicted_class}
                          </strong>
                        </div>

                        <div>H3 Index: <code style={{ fontFamily: 'monospace' }}>{pred.h3_index}</code></div>
                        <div>Confidence: <strong>{(pred.confidence * 100).toFixed(0)}%</strong></div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Time: {pred.timestamp}</div>

                        {/* Visible Data Caveat in Tooltip */}
                        {pred.predicted_class === 'agricultural_burn' && (
                          <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#F1C40F', fontSize: '11px', fontWeight: 600 }}>
                            ⚠️ Low confidence — under active improvement
                          </div>
                        )}
                        {pred.predicted_class === 'mining' && (
                          <div style={{ marginTop: '6px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.1)', color: '#95A5A6', fontSize: '11px' }}>
                            ℹ️ Limited sample — 74% ± 8% CI
                          </div>
                        )}
                      </div>
                    </Tooltip>
                  </Polygon>
                );
              }
              return null;
            })}
          </MapContainer>
        </div>

        {/* Right Pane: ~320px Controls & Intelligence Sidebar */}
        <aside
          style={{
            width: '340px',
            height: '100%',
            backgroundColor: 'var(--panel-surface)',
            borderLeft: '1px solid var(--hairline-border)',
            padding: '1.25rem',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem',
            textAlign: 'left'
          }}
        >
          {/* Section: Date / Time Filter */}
          <div>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Timeframe Scan Range
            </span>
            <div style={{ display: 'flex', gap: '4px', marginTop: '8px', background: '#0A0E12', padding: '3px', borderRadius: '6px', border: '1px solid var(--hairline-border)' }}>
              {['Today', '24hrs', '7 days'].map(range => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  style={{
                    flex: 1,
                    background: dateRange === range ? 'var(--panel-surface)' : 'transparent',
                    color: dateRange === range ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '5px 0',
                    fontSize: '11px',
                    fontFamily: 'var(--font-heading)',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Section: Fire Classification Toggle List */}
          <div>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Fire Classification Legend
            </span>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '10px' }}>
              {/* Trained Classification Peer Categories */}
              {['industrial', 'wildfire', 'mining', 'agricultural_burn'].map(cls => (
                <div
                  key={cls}
                  onClick={() => toggleClass(cls)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    borderRadius: '6px',
                    backgroundColor: activeClasses[cls] ? 'rgba(234, 237, 240, 0.04)' : 'transparent',
                    border: '1px solid var(--hairline-border)',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: FIRE_COLORS[cls] }} />
                    <span style={{ fontSize: '0.85rem', color: activeClasses[cls] ? 'var(--text-primary)' : 'var(--text-muted)', fontWeight: 500 }}>
                      {cls === 'industrial' ? 'Industrial (inc. Flares)' : FIRE_LABELS[cls]}
                    </span>
                  </div>
                  <input type="checkbox" checked={activeClasses[cls]} onChange={() => {}} style={{ accentColor: FIRE_COLORS[cls] }} />
                </div>
              ))}

              <div style={{ height: '1px', backgroundColor: 'var(--hairline-border)', margin: '4px 0' }} />

              {/* Unclassified Fallback (Desaturated & Separated) */}
              <div
                onClick={() => toggleClass('unclassified')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  backgroundColor: activeClasses['unclassified'] ? 'rgba(234, 237, 240, 0.02)' : 'transparent',
                  border: '1px stroke rgba(120, 120, 120, 0.2)',
                  opacity: 0.75,
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: FIRE_COLORS.unclassified }} />
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Unclassified Fallback
                  </span>
                </div>
                <input type="checkbox" checked={activeClasses['unclassified']} onChange={() => {}} style={{ accentColor: FIRE_COLORS.unclassified }} />
              </div>
            </div>
          </div>

          {/* Section: Data Reliability Block */}
          <DataReliabilityBlock />
        </aside>
      </div>
    </div>
  );
}
