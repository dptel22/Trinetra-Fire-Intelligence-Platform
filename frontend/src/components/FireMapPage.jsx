/**
 * FireMapPage.jsx — Map Engine (Agent A, branch agent-a/map-engine)
 *
 * Stack: react-map-gl/maplibre + deck.gl H3HexagonLayer + MapboxOverlay + PMTiles
 *
 * Design corrections vs. original task prompt:
 *   - PathStyleExtension is a PathLayer extension; it CANNOT be applied to
 *     H3HexagonLayer. The needs_review dashed outline is implemented via a
 *     companion PathLayer whose paths are h3-js cellToBoundary polygons
 *     with PathStyleExtension({dash:true}). See AGENT_LOG for details.
 *   - Mining tooltip no longer shows fabricated "74% ± 8% CI" — replaced with
 *     KNOWN_CAVEATS.mining verbatim text per model-honesty rule.
 *   - PMTiles URL is stubbed via VITE_PMTILES_URL env var; absent → dark bg fallback.
 *     Flagged as demo-day dependency in AGENT_LOG.
 *
 * India bounding box used for both maxBounds and client-side lat/lon filter:
 *   SW [68, 6], NE [98, 36]  (lon, lat — MapLibre convention)
 */

import {
  useEffect, useState, useCallback, useRef, useMemo
} from 'react';
import Map, { useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { H3HexagonLayer } from '@deck.gl/geo-layers';
import { PathLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
import * as h3lib from 'h3-js';
import { Protocol } from 'pmtiles';
import { addProtocol } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import './FireMapPage.css';

import Header from './Header';
import ClassificationFilters from './ClassificationFilters';
import HexInspectorPanel from './HexInspectorPanel';
import OfflineBanner from './OfflineBanner';
import Legend from './Legend';
import DataReliabilityBlock from './DataReliabilityBlock';

import {
  CLASS_COLORS,
  CLASS_LABELS,
  INDIA_CENTER,
  fetchPredictions,
  fetchHealth,
  fetchExplanation,
  onApiModeChange,
  confidenceLabel,
  parseCaveatFlag,
  KNOWN_CAVEATS,
} from '../services/api';

import { useMapLocation } from '../services/mapLocation';

// ─── PMTiles protocol registration (static, guarded against HMR re-eval) ─────
let pmtilesRegistered = false;
function registerPmtilesProtocol() {
  if (pmtilesRegistered || typeof addProtocol !== 'function') return;
  try {
    const protocol = new Protocol();
    addProtocol('pmtiles', protocol.tile.bind(protocol));
    pmtilesRegistered = true;
  } catch (err) {
    console.warn('[FireMap] PMTiles protocol registration failed:', err);
  }
}
registerPmtilesProtocol();

// ─── Constants ──────────────────────────────────────────────────────────────

// India bounding box: [west, south, east, north] — MapLibre LngLat order
const INDIA_BOUNDS_MLIB = [[68, 6], [98, 36]]; // [[minLon,minLat],[maxLon,maxLat]]
const INDIA_FILTER = { minLon: 68, maxLon: 98, minLat: 6, maxLat: 36 };

// VITE_PMTILES_URL stubbed; absent → dark background fallback style.
// FLAG (demo-day dependency): set VITE_PMTILES_URL in .env once PMTiles archive
// is generated from the OpenMapTiles build step. See docs/AGENT_LOG.md.
const PMTILES_URL = import.meta.env?.VITE_PMTILES_URL ?? null;

const MAP_STYLE_FALLBACK = {
  version: 8,
  name: 'dark-fallback',
  sources: {},
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#080b0e' } }
  ]
};

function buildPMTilesStyle(url) {
  return {
    version: 8,
    sources: {
      'openmaptiles': {
        type: 'vector',
        url: `pmtiles://${url}`,
        attribution: '© OpenMapTiles © OpenStreetMap'
      }
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#080b0e' } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: { 'fill-color': '#0d1117', 'fill-opacity': 0.8 }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': '#0a1628' }
      },
      {
        id: 'boundary-country',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['==', 'admin_level', 2],
        paint: { 'line-color': '#2e3440', 'line-width': 1.5 }
      },
      {
        id: 'boundary-state',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        filter: ['==', 'admin_level', 4],
        paint: { 'line-color': '#1e2229', 'line-width': 0.7 }
      }
    ]
  };
}

// ─── Hex→RGB util (deck.gl fill colors are [r,g,b,a] 0-255) ─────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// Pre-build RGB table for the 5 classes
const CLASS_RGB = Object.fromEntries(
  Object.entries(CLASS_COLORS).map(([k, v]) => [k, hexToRgb(v)])
);

// ─── Deck overlay wrapper ─────────────────────────────────────────────────────
function DeckOverlay(props) {
  const overlay = useControl(() => new MapboxOverlay({ interleaved: false, ...props }));
  overlay.setProps(props);
  return null;
}

// ─── Debounce helper ─────────────────────────────────────────────────────────
function useDebounce(fn, delay) {
  const timer = useRef(null);
  return useCallback((...args) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => fn(...args), delay);
  }, [fn, delay]);
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function FireMapPage() {
  // Register PMTiles protocol once at module scope — done above; no-op here.

  // ── State ─────────────────────────────────────────────────────────────────
  const [predictions, setPredictions] = useState([]);
  const predictionsRef = useRef(predictions);

  useEffect(() => {
    predictionsRef.current = predictions;
  }, [predictions]);

  const [dateRange, setDateRange] = useState('24hrs');
  const [acqDate] = useState('2025-01-26');

  // activeClasses is a Set — seeded with all 5, matching original all-on default
  const [activeClasses, setActiveClasses] = useState(
    () => new Set(['industrial', 'wildfire', 'mining', 'agricultural_burn', 'unclassified'])
  );

  const [selectedCell, setSelectedCell] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [loadingExplanation, setLoadingExplanation] = useState(false);

  // Hover tooltip state: {x, y, cell} or null
  const [hoverInfo, setHoverInfo] = useState(null);

  // Health / review thresholds for Legend + DataReliabilityBlock
  const [reviewThresholds, setReviewThresholds] = useState(null);

  // API mode for OfflineBanner subscription
  const [apiMode, setApiMode] = useState('live');

  // Map instance ref (react-map-gl's Map ref carries .getMap())
  const mapRef = useRef(null);

  // Viewport bbox for debounced fetching
  const [viewport, setViewport] = useState({
    min_lat: INDIA_FILTER.minLat,
    max_lat: INDIA_FILTER.maxLat,
    min_lon: INDIA_FILTER.minLon,
    max_lon: INDIA_FILTER.maxLon
  });

  // ── API mode subscription ─────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onApiModeChange((mode) => setApiMode(mode));
    return () => unsub();
  }, []);

  // ── Fetch health once on mount ────────────────────────────────────────────
  useEffect(() => {
    fetchHealth().then((h) => {
      if (h?.review_thresholds) setReviewThresholds(h.review_thresholds);
    }).catch(() => {});
  }, []);

  // ── Predictions fetch ─────────────────────────────────────────────────────
  useEffect(() => {
    let isMounted = true;
    async function load() {
      const zoom = mapRef.current?.getMap?.()?.getZoom?.() ?? 5;
      const clampedZoom = Math.max(1, Math.min(20, zoom));
      const res = await fetchPredictions(viewport, acqDate, clampedZoom);
      if (!isMounted) return;
      // res is PredictionResponse[] (Agent B's api.js returns the array directly)
      const arr = Array.isArray(res) ? res : (res?.predictions ?? []);
      setPredictions(arr);
    }
    load();
    return () => { isMounted = false; };
  }, [acqDate, viewport]);

  // ── Debounced moveend handler ─────────────────────────────────────────────
  const handleMoveEnd = useCallback(() => {
    const map = mapRef.current?.getMap?.();
    if (!map) return;
    const b = map.getBounds();
    setViewport({
      min_lat: b.getSouth(),
      max_lat: b.getNorth(),
      min_lon: b.getWest(),
      max_lon: b.getEast()
    });
  }, []);

  const debouncedMoveEnd = useDebounce(handleMoveEnd, 400);

  // ── useMapLocation hook (URL params + trinetra:locate event) ─────────────
  useMapLocation(mapRef, useCallback((detail) => {
    if (!detail) return;
    const currentPreds = predictionsRef.current;
    const match = currentPreds.find(
      p => p.h3_index === detail.h3
        || (detail.lat != null
          && Math.abs(p.latitude - detail.lat) < 0.15
          && Math.abs(p.longitude - detail.lon) < 0.15)
    );
    if (match) {
      setSelectedCell({ ...match, name: detail.name || match.name });
    } else {
      // Synthetic-cell fallback (e.g. QuickSearch result with no loaded prediction)
      const conf = detail.confidence != null
        ? (detail.confidence > 1 ? detail.confidence / 100 : detail.confidence)
        : 0.95;
      setSelectedCell({
        h3_index: detail.h3 || '88209a2011fffff',
        predicted_class: detail.type || 'industrial',
        confidence: conf,
        needs_review: conf < 0.70,
        probabilities: [],
        caveat_flag: null,
        calibrated: false,
        latency_ms: null,
        latitude: detail.lat,
        longitude: detail.lon,
        name: detail.name
      });
    }
    setExplanation(null);
  }, []));

  // ── onRequestExplanation ──────────────────────────────────────────────────
  const handleRequestExplanation = useCallback(async () => {
    if (!selectedCell?.cell_id && !selectedCell?.h3_index) return;
    setLoadingExplanation(true);
    setExplanation(null);
    try {
      const result = await fetchExplanation(
        selectedCell.cell_id ?? selectedCell.h3_index,
        acqDate
      );
      setExplanation(result);
    } catch {
      setExplanation(null);
    } finally {
      setLoadingExplanation(false);
    }
  }, [selectedCell, acqDate]);

  // ── Derived data ──────────────────────────────────────────────────────────

  // Client-side India filter (task 5b — cheap insurance against backend regressions)
  const indiaFiltered = useMemo(() => predictions.filter(p =>
    p.latitude  >= INDIA_FILTER.minLat && p.latitude  <= INDIA_FILTER.maxLat &&
    p.longitude >= INDIA_FILTER.minLon && p.longitude <= INDIA_FILTER.maxLon
  ), [predictions]);

  // Class-filtered display data
  const filteredPredictions = useMemo(() =>
    indiaFiltered.filter(p => activeClasses.has(p.predicted_class)),
    [indiaFiltered, activeClasses]
  );

  // Available classes: only what's actually present in the loaded batch
  // (so `unclassified` toggle only appears when empirically present — per AGENTS.md)
  const availableClasses = useMemo(() =>
    [...new Set(indiaFiltered.map(p => p.predicted_class))],
    [indiaFiltered]
  );

  // ── Outline paths for PathLayer (needs_review dashed borders) ────────────
  // PathStyleExtension is a PathLayer extension — cannot apply to H3HexagonLayer.
  // We build a companion PathLayer with cellToBoundary polygons. Memoized.
  const outlinePaths = useMemo(() => {
    return filteredPredictions.map(p => {
      let boundary;
      try {
        if (typeof h3lib.cellToBoundary === 'function') {
          // cellToBoundary returns [[lat,lng]...]; PathLayer needs [lng,lat]
          boundary = h3lib.cellToBoundary(p.h3_index).map(([lat, lng]) => [lng, lat]);
          // Close the polygon
          boundary = [...boundary, boundary[0]];
        }
      } catch {
        boundary = null;
      }
      return { ...p, boundary };
    }).filter(p => p.boundary);
  }, [filteredPredictions]);

  // ── Deck.gl layers ────────────────────────────────────────────────────────
  const layers = useMemo(() => {
    const selectedId = selectedCell?.h3_index ?? selectedCell?.cell_id;

    const hexLayer = new H3HexagonLayer({
      id: 'h3-hexagons',
      data: filteredPredictions,
      getHexagon: d => d.h3_index,
      extruded: false,
      filled: true,
      stroked: false,
      getFillColor: d => {
        const rgb = CLASS_RGB[d.predicted_class] ?? CLASS_RGB.unclassified;
        const isSelected = (d.h3_index ?? d.cell_id) === selectedId;
        const opacity = isSelected
          ? 230
          : d.predicted_class === 'unclassified' ? 77 : 140; // 0.9 / 0.3 / 0.55 × 255
        return [...rgb, opacity];
      },
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 60],
      onClick: ({ object }) => {
        if (object) {
          setSelectedCell(object);
          setExplanation(null);
        }
      },
      onHover: ({ object, x, y }) => {
        setHoverInfo(object ? { x, y, cell: object } : null);
      },
      updateTriggers: {
        getFillColor: [selectedId, activeClasses]
      }
    });

    const outlineLayer = new PathLayer({
      id: 'hex-outlines',
      data: outlinePaths,
      getPath: d => d.boundary,
      getWidth: d => {
        const isSelected = (d.h3_index ?? d.cell_id) === selectedId;
        return isSelected ? 3 : 1;
      },
      getColor: d => {
        const rgb = CLASS_RGB[d.predicted_class] ?? CLASS_RGB.unclassified;
        return [...rgb, 200];
      },
      widthUnits: 'pixels',
      getDashArray: d => d.needs_review ? [3, 2] : [1, 0],
      dashJustified: true,
      extensions: [new PathStyleExtension({ dash: true })],
      pickable: false,
      updateTriggers: {
        getWidth: [selectedId],
        getColor: [activeClasses],
        getDashArray: []
      }
    });

    return [hexLayer, outlineLayer];
  }, [filteredPredictions, outlinePaths, selectedCell, activeClasses]);

  // ── Map style ─────────────────────────────────────────────────────────────
  const mapStyle = useMemo(() =>
    PMTILES_URL ? buildPMTilesStyle(PMTILES_URL) : MAP_STYLE_FALLBACK,
    []
  );

  // ── Class toggle ──────────────────────────────────────────────────────────
  const handleToggleClass = useCallback((cls) => {
    setActiveClasses(prev => {
      const next = new Set(prev);
      if (next.has(cls)) next.delete(cls);
      else next.add(cls);
      return next;
    });
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="firemap-page">
      <Header />

      {/* OfflineBanner — fixed position, non-blocking, auto-subscribes to mode */}
      <OfflineBanner mode={apiMode} />

      <div className="firemap-body">
        {/* ── Map pane ── */}
        <div className="firemap-map-pane">
          <Map
            ref={mapRef}
            initialViewState={{
              longitude: INDIA_CENTER.lon,
              latitude: INDIA_CENTER.lat,
              zoom: INDIA_CENTER.zoom ?? 5
            }}
            mapStyle={mapStyle}
            maxBounds={INDIA_BOUNDS_MLIB}
            onMoveEnd={debouncedMoveEnd}
            style={{ width: '100%', height: '100%' }}
          >
            <DeckOverlay layers={layers} />
          </Map>

          {/* ── Hover tooltip ── */}
          {hoverInfo && (
            <div
              className="firemap-tooltip"
              style={{ left: hoverInfo.x + 12, top: hoverInfo.y + 12 }}
            >
              {(() => {
                const c = hoverInfo.cell;
                const color = CLASS_COLORS[c.predicted_class] ?? '#787878';
                const label = confidenceLabel(c);
                const badgeCls = label === 'High confidence' ? 'high'
                  : label === 'Needs review' ? 'review' : 'uncertain';
                const caveats = parseCaveatFlag(c.caveat_flag);
                return (
                  <>
                    <div className="firemap-tooltip-header">
                      <span className="firemap-tooltip-dot" style={{ backgroundColor: color }} />
                      <span className="firemap-tooltip-class" style={{ color }}>
                        {CLASS_LABELS[c.predicted_class] ?? c.predicted_class}
                      </span>
                      <span className={`firemap-tooltip-badge ${badgeCls}`}>
                        {label}
                      </span>
                    </div>
                    <div className="firemap-tooltip-row">
                      <span>H3</span>
                      <code style={{ fontFamily: 'monospace', fontSize: 10 }}>{c.h3_index}</code>
                    </div>
                    <div className="firemap-tooltip-row">
                      <span>Conf.</span>
                      <strong>{(c.confidence * 100).toFixed(0)}%</strong>
                    </div>
                    {caveats.length > 0 && (
                      <div className="firemap-tooltip-caveat">
                        ⚠️ {caveats[0]}
                      </div>
                    )}
                    {(() => {
                      // Per-class canonical caveat, deduped against caveat_flag chips
                      const known = KNOWN_CAVEATS[c.predicted_class];
                      if (!known || caveats.includes(known)) return null;
                      return (
                        <div className="firemap-tooltip-caveat" style={{ color: '#95a5a6' }}>
                          ℹ️ {known}
                        </div>
                      );
                    })()}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <aside className="firemap-sidebar">
          {/* Timeframe scan range (cosmetic — acqDate wiring is Phase 4 / Agent B) */}
          <div>
            <div className="firemap-section-label">Timeframe Scan Range</div>
            <div className="firemap-timeframe-bar">
              {['Today', '24hrs', '7 days'].map(range => (
                <button
                  key={range}
                  type="button"
                  className={`firemap-timeframe-btn${dateRange === range ? ' active' : ''}`}
                  onClick={() => setDateRange(range)}
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          {/* Classification Filters — dynamic classes, never hardcoded */}
          <ClassificationFilters
            availableClasses={availableClasses}
            activeClasses={activeClasses}
            onToggle={handleToggleClass}
          />

          {/* Legend */}
          <Legend reviewThresholds={reviewThresholds} />

          {/* Clear-selection control — HexInspectorPanel contract has no onClose */}
          {selectedCell && (
            <button
              type="button"
              className="firemap-clear-btn"
              onClick={() => {
                setSelectedCell(null);
                setExplanation(null);
              }}
            >
              ✕ Clear selection
            </button>
          )}

          {/* Hex Inspector */}
          <HexInspectorPanel
            cell={selectedCell}
            onRequestExplanation={handleRequestExplanation}
            explanation={explanation}
            loadingExplanation={loadingExplanation}
          />

          {/* Detections in View count */}
          <div>
            <div className="firemap-section-label">Detections in View</div>
            <div className="firemap-count-box">
              <span className="firemap-count-label">Total visible</span>
              <span className="firemap-count-value">{filteredPredictions.length}</span>
            </div>
          </div>

          <div className="firemap-divider" />

          {/* Data Reliability Block */}
          <DataReliabilityBlock reviewThresholds={reviewThresholds} />
        </aside>
      </div>
    </div>
  );
}
