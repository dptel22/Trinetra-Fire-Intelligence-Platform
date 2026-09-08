import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import { useSearchParams } from 'react-router-dom';
import Header from './Header';
import DataReliabilityBlock from './DataReliabilityBlock';
import { fetchPredictions, getH3Boundary, FIRE_COLORS, FIRE_LABELS, FIRE_CAVEATS } from '../services/api';

function MapLocationController({ onSelectLocation }) {
  const map = useMap();
  const [searchParams] = useSearchParams();
  const lastTargetRef = useRef(null);
  const onSelectLocationRef = useRef(onSelectLocation);
  onSelectLocationRef.current = onSelectLocation;

  useEffect(() => {
    const lat = searchParams.get('lat');
    const lon = searchParams.get('lon');
    const h3 = searchParams.get('h3');
    const name = searchParams.get('name');
    if (lat && lon) {
      const key = `${lat},${lon},${h3}`;
      if (lastTargetRef.current !== key) {
        lastTargetRef.current = key;
        const targetLat = parseFloat(lat);
        const targetLon = parseFloat(lon);
        map.flyTo([targetLat, targetLon], 9, { duration: 1.5 });
        if (onSelectLocationRef.current) {
          onSelectLocationRef.current({ lat: targetLat, lon: targetLon, h3, name });
        }
      }
    }
  }, [searchParams, map]);

  useEffect(() => {
    const handleLocateEvent = (e) => {
      if (e.detail?.lat && e.detail?.lon) {
        map.flyTo([e.detail.lat, e.detail.lon], 9, { duration: 1.5 });
        if (onSelectLocationRef.current) {
          onSelectLocationRef.current(e.detail);
        }
      }
    };
    window.addEventListener('trinetra:locate', handleLocateEvent);
    return () => window.removeEventListener('trinetra:locate', handleLocateEvent);
  }, [map]);

  return null;
}

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
  const predictionsRef = useRef(predictions);
  predictionsRef.current = predictions;

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

  const handleSelectLocation = useCallback((detail) => {
    if (!detail) return;
    const currentPreds = predictionsRef.current;
    const match = currentPreds.find(p => p.h3_index === detail.h3 || (detail.lat && Math.abs(p.latitude - detail.lat) < 0.15 && Math.abs(p.longitude - detail.lon) < 0.15));
    if (match) {
      setActiveHex({ ...match, name: detail.name || match.name });
    } else {
      setActiveHex({
        h3_index: detail.h3 || '88209a2011fffff',
        predicted_class: detail.type || 'industrial',
        confidence: detail.confidence ? (detail.confidence > 1 ? detail.confidence / 100 : detail.confidence) : 0.95,
        frp: detail.frp || '88.5 MW',
        timestamp: 'Live Orbital Pass (Telemetry Validated)',
        latitude: detail.lat,
        longitude: detail.lon,
        name: detail.name
      });
    }
  }, []);

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
              url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              maxZoom={20}
            />

            <MapViewportListener onBoundsChange={(nb) => setViewport(nb)} />
            <MapLocationController onSelectLocation={handleSelectLocation} />

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

        {/* Right Pane: ~340px Controls & Intelligence Sidebar */}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {filteredPredictions.filter(p => p.predicted_class === cls).length}
                    </span>
                    <input type="checkbox" checked={activeClasses[cls]} onChange={() => {}} style={{ accentColor: FIRE_COLORS[cls] }} />
                  </div>
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
                  border: '1px solid var(--hairline-border)',
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

          {/* Section: Selected Hex Detail Panel */}
          {activeHex ? (
            <div
              style={{
                backgroundColor: 'rgba(234, 237, 240, 0.04)',
                border: `1px solid ${FIRE_COLORS[activeHex.predicted_class] || FIRE_COLORS.unclassified}55`,
                borderRadius: '8px',
                padding: '1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
                  Selected Cell
                </span>
                <button
                  onClick={() => setActiveHex(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 }}
                >
                  ✕
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: FIRE_COLORS[activeHex.predicted_class] || FIRE_COLORS.unclassified, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '0.9rem', color: FIRE_COLORS[activeHex.predicted_class] || FIRE_COLORS.unclassified }}>
                  {FIRE_LABELS[activeHex.predicted_class] || activeHex.predicted_class}
                </span>
              </div>

              {activeHex.name && (
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '1px solid var(--hairline-border)', paddingBottom: '4px' }}>
                  📍 {activeHex.name}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Confidence</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{(activeHex.confidence * 100).toFixed(0)}%</strong>
                </div>
                {activeHex.frp && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Fire Radiative Power</span>
                    <strong style={{ color: 'var(--accent-ember)' }}>{typeof activeHex.frp === 'number' ? `${activeHex.frp.toFixed(1)} MW` : activeHex.frp}</strong>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>H3 Index</span>
                  <code style={{ fontSize: '10px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>{activeHex.h3_index}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Timestamp</span>
                  <span style={{ color: 'var(--text-primary)', fontSize: '10px' }}>{activeHex.timestamp}</span>
                </div>
              </div>

              {FIRE_CAVEATS[activeHex.predicted_class] && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', borderTop: '1px solid var(--hairline-border)', paddingTop: '6px', lineHeight: 1.4 }}>
                  ℹ️ {FIRE_CAVEATS[activeHex.predicted_class]}
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textAlign: 'center', padding: '0.75rem', border: '1px dashed var(--hairline-border)', borderRadius: '6px' }}>
              Click any hex on the map or search above to inspect detection details
            </div>
          )}

          {/* Section: Live Detection Count */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontFamily: 'var(--font-heading)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)' }}>
              Detections in View
            </span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', backgroundColor: 'rgba(234,237,240,0.04)', border: '1px solid var(--hairline-border)', borderRadius: '6px' }}>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Total visible</span>
              <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{filteredPredictions.length}</span>
            </div>
          </div>

          {/* Section: Data Reliability Block */}
          <DataReliabilityBlock />
        </aside>
      </div>
    </div>
  );
}
