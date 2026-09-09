/**
 * FireMapPage.jsx — Map Engine (Agent A, branch agent-a/basemap-pmtiles)
 *
 * Stack: react-map-gl/maplibre + deck.gl IconLayer + MapboxOverlay + PMTiles
 *
 * Basemap: three switchable self-hosted styles (Blue Marble / Streets /
 * Topographic) from ../services/basemapStyles.js — no CDN, no network beyond
 * localhost. Vector styles consume the OpenMapTiles-schema PMTiles archive
 * built by Planetiler (docs/PMTILES_BUILD.md).
 *
 * Detections render as per-class SVG fire-pin icons (CLASS_ICONS) instead of
 * H3 hexagons — one distinct glyph per predicted class. needs_review cells
 * get a dashed ring under the pin; selection gets a solid halo.
 *
 * Map interaction: no maxBounds clamp — free pan/zoom around India and its
 * neighbours (min zoom 2, max 16). Predictions stay filtered to the India
 * bbox (the backend only has India data).
 *
 * Model honesty: hover tooltip shows the qualitative confidenceLabel badge
 * only — never a bare numeric %. QuickSearch misses produce an
 * is_synthetic:true placeholder that is visibly labeled SIMULATED.
 */

import {
  useEffect, useState, useCallback, useRef, useMemo
} from 'react';
import Map, { useControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { PathStyleExtension } from '@deck.gl/extensions';
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
import {
  buildBasemapStyle, BASEMAP_OPTIONS, CLASS_ICONS
} from '../services/basemapStyles';

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

// India filter for client-side prediction clamping (backend holds India data
// only). NOT a map maxBounds — the map itself pans freely (Dhruv, 2026-09-09:
// "freedom to move around India, around the neighbours").
const INDIA_FILTER = { minLon: 68, maxLon: 98, minLat: 6, maxLat: 36 };

// Canonical class ordering for availableClasses (Agent B flag: raw Set spread
// gave non-deterministic order; Object.keys(CLASS_COLORS) is the taxonomy order).
const CLASS_ORDER = Object.keys(CLASS_COLORS);

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
  // Live FIRMS ingestion targets the current day; default to today's date.
  const [acqDate] = useState(() => new Date().toLocaleDateString('en-CA'));

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

  // Basemap selection (Blue Marble / Streets / Topographic — all self-hosted)
  const [basemapId, setBasemapId] = useState('bluemarble');

  // Current map zoom — drives icon sizing and low-zoom decluttering
  const [zoomLevel, setZoomLevel] = useState(INDIA_CENTER.zoom ?? 5);

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
    setZoomLevel(map.getZoom());
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
      // Synthetic-cell fallback (e.g. QuickSearch result with no loaded prediction).
      // Marked is_synthetic so every render path can badge it as SIMULATED —
      // never presented as a real model output (Agent B F5 handoff).
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
        name: detail.name,
        is_synthetic: true
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
  // (so `unclassified` toggle only appears when empirically present — per AGENTS.md),
  // emitted in canonical taxonomy order (CLASS_ORDER), not Set insertion order.
  const availableClasses = useMemo(() => {
    const present = new Set(indiaFiltered.map(p => p.predicted_class));
    return CLASS_ORDER.filter(cls => present.has(cls));
  }, [indiaFiltered]);

  // ── Deck.gl layers ────────────────────────────────────────────────────────
  // Per-class fire-pin icons (Dhruv, 2026-09-09: "instead of hexagons, generate
  // or get icons" — one distinct glyph per classification). Below zoom 6 the
  // national view can hold ~2500 detections; icons are decluttered to the top
  // 600 by calibrated confidence so the overview stays readable. Presentation-
  // only ranking — no data is fabricated or relabeled.
  const iconSize = zoomLevel <= 4.5 ? 26
    : zoomLevel <= 6 ? 32
    : zoomLevel <= 8 ? 40 : 48;

  const displayPredictions = useMemo(() => {
    if (zoomLevel >= 6 || filteredPredictions.length <= 600) return filteredPredictions;
    return [...filteredPredictions]
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, 600);
  }, [filteredPredictions, zoomLevel]);

  const layers = useMemo(() => {
    // Dashed ring under needs_review pins (visible caveat cue)
    const reviewRingLayer = new ScatterplotLayer({
      id: 'review-rings',
      data: displayPredictions.filter(d => d.needs_review),
      getPosition: d => [d.longitude, d.latitude],
      radiusUnits: 'pixels',
      getRadius: iconSize / 2 + 5,
      stroked: true,
      filled: false,
      lineWidthUnits: 'pixels',
      getLineWidth: 1.6,
      getColor: d => [
        ...(CLASS_RGB[d.predicted_class] ?? CLASS_RGB.unclassified), 190
      ],
      getDashArray: [4, 3],
      dashJustified: true,
      extensions: [new PathStyleExtension({ dash: true })],
      pickable: false,
      updateTriggers: {
        getRadius: [iconSize],
        getColor: [activeClasses]
      }
    });

    // Solid halo under the selected pin
    const selectionHaloLayer = new ScatterplotLayer({
      id: 'selection-halo',
      data: selectedCell?.latitude != null && selectedCell?.longitude != null
        ? [selectedCell]
        : [],
      getPosition: d => [d.longitude, d.latitude],
      radiusUnits: 'pixels',
      getRadius: iconSize / 2 + 8,
      stroked: true,
      filled: false,
      lineWidthUnits: 'pixels',
      getLineWidth: 2.4,
      getColor: [255, 255, 255, 220],
      pickable: false,
      updateTriggers: { getRadius: [iconSize] }
    });

    const iconLayer = new IconLayer({
      id: 'fire-icons',
      data: displayPredictions,
      getPosition: d => [d.longitude, d.latitude],
      getIcon: d => CLASS_ICONS[d.predicted_class] ?? CLASS_ICONS.unclassified,
      sizeUnits: 'pixels',
      getSize: iconSize,
      getColor: [255, 255, 255],
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 90],
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
        getIcon: [],
        getSize: [iconSize]
      }
    });

    return [reviewRingLayer, selectionHaloLayer, iconLayer];
  }, [displayPredictions, selectedCell, activeClasses, iconSize]);

  // ── Map style ─────────────────────────────────────────────────────────────
  const mapStyle = useMemo(() => buildBasemapStyle(basemapId), [basemapId]);

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
            minZoom={2}
            maxZoom={16}
            onMoveEnd={debouncedMoveEnd}
            style={{ width: '100%', height: '100%' }}
          >
            <DeckOverlay layers={layers} />
          </Map>

          {/* ── Basemap switcher (all styles self-hosted) ── */}
          <div className="firemap-style-switcher" role="group" aria-label="Basemap style">
            {BASEMAP_OPTIONS.map(opt => (
              <button
                key={opt.id}
                type="button"
                className={`firemap-style-btn${basemapId === opt.id ? ' active' : ''}`}
                onClick={() => setBasemapId(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>

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
                    {c.is_synthetic && (
                      <div className="firemap-tooltip-caveat" style={{ color: '#E74C3C', fontWeight: 700 }}>
                        SIMULATED — no model prediction for this location today
                      </div>
                    )}
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
