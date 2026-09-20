// Basemap styles + per-class fire icons (Agent A — map engine).
//
// Three switchable basemaps:
//   bluemarble — NASA Blue Marble Web-Mercator raster tiles
//                (public/tiles/bluemarble/{z}/{x}/{y}.jpg)
//                + admin boundaries / place labels from the local PMTiles archive.
//   streets    — light OpenMapTiles-schema vector style from the local PMTiles archive.
//   topographic— earth-tone vector style from the same archive.
// When the optional PMTiles archive is missing, Streets and Topographic use
// public raster fallbacks instead of rendering an empty background.
//
// Text labels use self-hosted Noto Sans glyph pages in public/fonts/glyphs/
// (fontstack names on disk have no spaces: NotoSansRegular / NotoSansBold).
//
// Fire icons: one SVG map-pin per predicted class, generated as data URIs —
// no external icon font or image request leaves localhost.

const PMTILES_URL = import.meta.env?.VITE_PMTILES_URL ?? null;

// True when the offline vector archive is configured via VITE_PMTILES_URL.
// When false the map runs on the local Blue Marble raster tiles and public
// Streets/Topographic raster fallbacks — the UI surfaces the missing local pack
// instead of failing silently (docs/PMTILES_BUILD.md).
export const PMTILES_AVAILABLE = Boolean(PMTILES_URL);

const GLYPHS_URL = '/fonts/glyphs/{fontstack}/{range}.pbf';
const OMT_ATTR = '© OpenMapTiles © OpenStreetMap contributors';
const BM_ATTR = 'NASA Visible Earth (Blue Marble) · © OpenMapTiles © OpenStreetMap contributors';

// Single vector source shared by every PMTiles-backed style. The pmtiles://
// scheme is served by the protocol registered in FireMapPage.jsx.
const pmtilesVector = PMTILES_URL
  ? { type: 'vector', url: `pmtiles://${PMTILES_URL}`, attribution: OMT_ATTR }
  : null;

// Interpolated road width helper: [zoom, width] pairs.
function roadWidth(pairs, base) {
  return ['interpolate', ['exponential', 1.6], ['zoom'], ...pairs.flatMap(([z, w]) => [z, w * base])];
}

// ─── Shared vector layer blocks (used by Streets and Topographic) ───────────

function landcoverLayers(palette) {
  return [
    {
      id: 'landcover',
      type: 'fill',
      source: 'india',
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', palette.classes]],
      paint: { 'fill-color': palette.fill, 'fill-opacity': palette.opacity }
    },
    {
      id: 'park',
      type: 'fill',
      source: 'india',
      'source-layer': 'park',
      minzoom: 6,
      paint: { 'fill-color': palette.park, 'fill-opacity': 0.65 }
    }
  ];
}

function waterLayers(color) {
  return [
    {
      id: 'water',
      type: 'fill',
      source: 'india',
      'source-layer': 'water',
      paint: { 'fill-color': color }
    },
    {
      id: 'waterway',
      type: 'line',
      source: 'india',
      'source-layer': 'waterway',
      minzoom: 8,
      paint: { 'line-color': color, 'line-width': roadWidth([[9, 0.4], [14, 1.6], [18, 4]], 1) }
    }
  ];
}

function boundaryLayers(countryColor, stateColor) {
  return [
    {
      id: 'boundary-country',
      type: 'line',
      source: 'india',
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 2],
      paint: {
        'line-color': countryColor,
        'line-width': roadWidth([[2, 0.6], [6, 1.2], [10, 2]], 1),
        'line-dasharray': [3, 1.5]
      }
    },
    {
      id: 'boundary-state',
      type: 'line',
      source: 'india',
      'source-layer': 'boundary',
      filter: ['==', ['get', 'admin_level'], 4],
      minzoom: 4,
      paint: {
        'line-color': stateColor,
        'line-width': roadWidth([[4, 0.4], [8, 0.9], [12, 1.4]], 1),
        'line-dasharray': [2, 2.5]
      }
    }
  ];
}

function placeLabelLayers(labelColor, haloColor) {
  const label = (id, cls, minzoom, size, opts = {}) => ({
    id,
    type: 'symbol',
    source: 'india',
    'source-layer': 'place',
    minzoom,
    filter: ['==', ['get', 'class'], cls],
    layout: {
      'text-field': ['get', 'name'],
      'text-font': opts.bold ? ['NotoSansBold'] : ['NotoSansRegular'],
      'text-size': ['interpolate', ['linear'], ['zoom'], minzoom, size, 14, size * 1.5],
      'text-letter-spacing': opts.spacing ?? 0.02,
      'text-transform': opts.uppercase ? 'uppercase' : 'none',
      'text-max-width': 7,
      'text-padding': 3,
      'text-allow-overlap': false,
      'text-anchor': 'center'
    },
    paint: {
      'text-color': labelColor,
      'text-halo-color': haloColor,
      'text-halo-width': 1.4
    }
  });
  return [
    label('place-country', 'country', 2, 12, { bold: true, spacing: 0.18, uppercase: true }),
    label('place-state', 'state', 4, 10.5, { bold: true, spacing: 0.08 }),
    label('place-city', 'city', 6, 12, { bold: true }),
    label('place-town', 'town', 8.5, 10.5),
    label('place-village', 'village', 11.5, 9.5)
  ];
}

function roadLayers(road, casing) {
  const line = (id, classes, minzoom, widthPairs, paintColor, withCasing = false) => {
    const out = [];
    if (withCasing) {
      out.push({
        id: `${id}-casing`,
        type: 'line',
        source: 'india',
        'source-layer': 'transportation',
        minzoom,
        filter: ['in', ['get', 'class'], ['literal', classes]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': casing, 'line-width': roadWidth(widthPairs, 1.6) }
      });
    }
    out.push({
      id,
      type: 'line',
      source: 'india',
      'source-layer': 'transportation',
      minzoom,
      filter: ['in', ['get', 'class'], ['literal', classes]],
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': paintColor, 'line-width': roadWidth(widthPairs, 1) }
    });
    return out;
  };
  return [
    ...line('road-minor', ['minor', 'service', 'track'], 10, [[10, 0.4], [14, 1.4], [18, 6]], road.minor),
    ...line('road-secondary', ['tertiary', 'secondary'], 8, [[8, 0.5], [12, 1.6], [18, 8]], road.secondary),
    ...line('road-primary', ['primary'], 7, [[7, 0.7], [12, 2], [18, 10]], road.primary, true),
    ...line('road-motorway', ['motorway', 'trunk'], 5, [[5, 0.6], [10, 1.8], [18, 13]], road.motorway, true)
  ];
}

function roadNameLabels(color) {
  return {
    id: 'road-labels',
    type: 'symbol',
    source: 'india',
    'source-layer': 'transportation_name',
    minzoom: 13,
    layout: {
      'symbol-placement': 'line',
      'text-field': ['get', 'name'],
      'text-font': ['NotoSansRegular'],
      'text-size': 9.5,
      'text-max-angle': 38,
      'text-padding': 4
    },
    paint: {
      'text-color': color,
      'text-halo-color': 'rgba(255,255,255,0.9)',
      'text-halo-width': 1.2
    }
  };
}

// ─── Satellite imagery styles (Blue Marble + Satellite HD share this) ────────

function buildSatelliteStyle({ name, tiles, maxzoom, sourceAttribution }) {
  const sources = {
    satellite: {
      type: 'raster',
      tiles,
      tileSize: 256,
      maxzoom,
      attribution: sourceAttribution
    }
  };

  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#030814' } },
    {
      id: 'satellite-layer',
      type: 'raster',
      source: 'satellite',
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 150 }
    }
  ];

  // Without the archive, fall back to the Esri reference raster for labels.
  if (!pmtilesVector) {
    sources.reference = {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19
    };
    layers.push({
      id: 'reference-layer',
      type: 'raster',
      source: 'reference',
      paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 150 }
    });
  } else {
    // With the archive: crisp vector boundaries + place labels.
    sources.india = pmtilesVector;
    layers.push(
      {
        id: 'overlay-country',
        type: 'line',
        source: 'india',
        'source-layer': 'boundary',
        filter: ['==', ['get', 'admin_level'], 2],
        paint: {
          'line-color': 'rgba(255,255,255,0.85)',
          'line-width': roadWidth([[2, 0.7], [8, 1.6]], 1),
          'line-dasharray': [3, 1.5]
        }
      },
      {
        id: 'overlay-state',
        type: 'line',
        source: 'india',
        'source-layer': 'boundary',
        filter: ['==', ['get', 'admin_level'], 4],
        minzoom: 4,
        paint: {
          'line-color': 'rgba(255,255,255,0.4)',
          'line-width': roadWidth([[4, 0.4], [10, 1]], 1),
          'line-dasharray': [2, 2.5]
        }
      },
      ...placeLabelLayers('#FFFFFF', 'rgba(3,8,20,0.85)').map((l) => ({
        ...l,
        paint: { ...l.paint, 'text-halo-width': 1.8 }
      }))
    );
  }

  return {
    version: 8,
    name,
    glyphs: GLYPHS_URL,
    sources,
    layers
  };
}

// Blue Marble: NASA's global composite. Physically capped at zoom 8
// (~500 m/pixel) — that is the product's ceiling, not a styling choice.
function buildBlueMarbleStyle() {
  return buildSatelliteStyle({
    name: 'blue-marble',
    tiles: [
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'
    ],
    maxzoom: 8,
    sourceAttribution: 'NASA Visible Earth · Blue Marble Next Generation (Shaded Relief & Bathymetry)'
  });
}

// Satellite HD: Esri World Imagery — genuine high-res satellite (zoom 19),
// sourced from Maxar / Earthstar / Airbus imagery. Remote-only: needs internet.
function buildSatelliteHDStyle() {
  return buildSatelliteStyle({
    name: 'satellite-hd',
    tiles: [
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
    ],
    maxzoom: 19,
    sourceAttribution: '© Esri, Maxar, Earthstar Geographics · © OpenStreetMap contributors'
  });
}

// ─── Streets: light vector style (raster fallback when archive missing) ──────

function buildStreetsVectorStyle() {
  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#F5F3EE' } },
    {
      id: 'landuse',
      type: 'fill',
      source: 'india',
      'source-layer': 'landuse',
      filter: ['==', ['get', 'class'], 'residential'],
      minzoom: 7,
      paint: { 'fill-color': '#EAE7DF', 'fill-opacity': 0.8 }
    },
    ...landcoverLayers({ classes: ['wood', 'grass', 'ice', 'sand'], fill: '#DDE8D0', opacity: 0.9, park: '#D4E5C0' }),
    ...waterLayers('#A9CBDD'),
    {
      id: 'building',
      type: 'fill',
      source: 'india',
      'source-layer': 'building',
      minzoom: 13.5,
      paint: { 'fill-color': '#DFDAD0', 'fill-outline-color': '#CFC9BD' }
    },
    ...roadLayers(
      { minor: '#FFFFFF', secondary: '#FFFFFF', primary: '#F5DE9C', motorway: '#E8A87C' },
      '#D8D2C4'
    ),
    ...boundaryLayers('#8A8A8A', '#B0B0B0'),
    roadNameLabels('#55595E'),
    ...placeLabelLayers('#1B1E21', 'rgba(255,255,255,0.9)')
  ];

  return {
    version: 8,
    name: 'streets',
    glyphs: GLYPHS_URL,
    sources: { india: pmtilesVector },
    layers
  };
}

function buildStreetsStyle() {
  if (pmtilesVector) return buildStreetsVectorStyle();

  const sources = {
    streets: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri, HERE, Garmin, USGS, NGA, EPA, USDA, NPS · © OpenStreetMap contributors'
    }
  };

  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#F5F4F0' } },
    { id: 'streets-raster', type: 'raster', source: 'streets', paint: { 'raster-fade-duration': 150 } }
  ];

  return {
    version: 8,
    name: 'streets',
    glyphs: GLYPHS_URL,
    sources,
    layers
  };
}

// ─── Topographic: earth-tone vector style + DEM hillshade relief ────────────

function buildTopographicVectorStyle() {
  const sources = {
    india: pmtilesVector,
    // Terrain relief from the Mapzen/AWS terrarium DEM (free, no key). When
    // offline the tiles simply fail to load and the vector style stands alone.
    terrain: {
      type: 'raster-dem',
      tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15,
      attribution: 'Terrain: Mapzen · AWS Open Data'
    }
  };

  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#F0EADA' } },
    ...landcoverLayers({
      classes: ['wood', 'grass', 'ice', 'sand'],
      fill: '#DCE7C6',
      opacity: 0.95,
      park: '#CDE0B2'
    }),
    ...waterLayers('#A5C8DC'),
    {
      id: 'hillshade',
      type: 'hillshade',
      source: 'terrain',
      paint: {
        'hillshade-exaggeration': 0.5,
        'hillshade-shadow-color': '#6E5F49',
        'hillshade-highlight-color': '#FFF6E3',
        'hillshade-accent-color': '#8B7B60'
      }
    },
    ...roadLayers(
      { minor: '#F7F2E4', secondary: '#F7F2E4', primary: '#EFDCAC', motorway: '#DBA878' },
      '#D9CDAF'
    ),
    ...boundaryLayers('#7A7466', '#A29B8A'),
    {
      id: 'peak-labels',
      type: 'symbol',
      source: 'india',
      'source-layer': 'mountain_peak',
      minzoom: 9,
      filter: ['has', 'name'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['NotoSansRegular'],
        'text-size': 9.5,
        'text-letter-spacing': 0.05,
        'text-max-width': 7
      },
      paint: {
        'text-color': '#55603F',
        'text-halo-color': 'rgba(240,234,218,0.9)',
        'text-halo-width': 1.3
      }
    },
    ...placeLabelLayers('#4B4535', 'rgba(240,234,218,0.9)')
  ];

  return {
    version: 8,
    name: 'topographic',
    glyphs: GLYPHS_URL,
    sources,
    layers
  };
}

function buildTopographicStyle() {
  if (pmtilesVector) return buildTopographicVectorStyle();

  const sources = {
    topographic: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: '© Esri, USGS, NOAA · © OpenStreetMap contributors'
    }
  };

  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#EDE7D9' } },
    { id: 'topographic-raster', type: 'raster', source: 'topographic', paint: { 'raster-fade-duration': 150 } }
  ];

  return {
    version: 8,
    name: 'topographic',
    glyphs: GLYPHS_URL,
    sources,
    layers
  };
}

export const BASEMAP_OPTIONS = [
  { id: 'bluemarble', label: 'Blue Marble' },
  { id: 'satellite', label: 'Satellite HD' },
  { id: 'streets', label: 'Streets' },
  { id: 'topographic', label: 'Topographic' }
];

export function buildBasemapStyle(id) {
  switch (id) {
    case 'satellite': return buildSatelliteHDStyle();
    case 'streets': return buildStreetsStyle();
    case 'topographic': return buildTopographicStyle();
    case 'bluemarble':
    default: return buildBlueMarbleStyle();
  }
}

// ─── Per-class detection markers (flat, high-clarity icon system) ───────────
// ─── Per-class detection markers (exact hexagonal icon system) ───────────────
// Hexagonal pins matching the classified taxonomy icons:
//   industrial: orange hexagon with factory smokestacks & billowing smoke
//   mining: dark slate hexagon with heavy excavator digging rock rubble
//   agricultural_burn: emerald green hexagon with perspective crop furrows, wheat & flame
//   wildfire: red hexagon with fir trees & roaring flame
//   unclassified: gray (#787878) hexagon with crosshair reticle & question mark

const ICON_SIZE = 80;

function markerSvg(fill, glyph) {
  // Pointy-topped hexagon with rounded corners, dark contrast base and crisp inner stroke
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 80 80">
  <polygon points="40,5 71,22.8 71,57.2 40,75 9,57.2 9,22.8" fill="#070D18" stroke="#070D18" stroke-width="5" stroke-linejoin="round"/>
  <polygon points="40,7 68.5,23.5 68.5,56.5 40,73 11.5,56.5 11.5,23.5" fill="${fill}" stroke="${fill}" stroke-width="3" stroke-linejoin="round"/>
  <polygon points="40,8.5 67,24.5 67,55.5 40,71.5 13,55.5 13,24.5" fill="none" stroke="#FFFFFF" stroke-width="1.3" stroke-opacity="0.9" stroke-linejoin="round"/>
  ${glyph}
</svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: ICON_SIZE,
    height: ICON_SIZE,
    anchorX: ICON_SIZE / 2,
    anchorY: ICON_SIZE / 2,
    mask: false
  };
}

export const ICON_COLORS = {
  industrial: '#E67E22',
  mining: '#95A5A6',
  agricultural_burn: '#F1C40F',
  wildfire: '#E74C3C',
  unclassified: '#787878'
};

function getGlyph(cls) {
  switch (cls) {
    case 'industrial':
      return `
        <g transform="scale(0.8)">
          <path d="M30 65 V45 L42 41 V65 H30 Z M45 65 V48 L57 44 V65 H45 Z M62 65 V50 H72 V65 H62 Z" fill="#FFFFFF" />
          <path d="M38 41 C38 34 48 35 44 28 C42 25 48 22 55 24 C60 26 56 31 66 32" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none" />
        </g>
      `;
    case 'mining':
      return `
        <g transform="scale(0.8)">
          <path d="M25 58 L45 35 L62 48 L75 32" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          <path d="M75 32 L75 42 M75 32 L65 32" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" fill="none" />
          <path d="M48 65 L55 56 L62 65 Z M60 65 L66 58 L72 65 Z M32 65 H78" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none" />
        </g>
      `;
    case 'agricultural_burn':
      return `
        <g transform="scale(0.8)">
          <path d="M28 58 L38 46 M38 58 L48 46 M48 58 L58 46 M58 58 L68 46" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" />
          <path d="M42 42 C40 32 48 28 46 20 M54 42 C52 34 60 30 58 22" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" fill="none" />
          <path d="M25 64 H75" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" />
        </g>
      `;
    case 'wildfire':
      return `
        <g transform="scale(0.8)">
          <path d="M30 65 V52 L35 48 V65 H30 Z M46 65 V45 L52 40 V65 H46 Z M64 65 V52 L69 48 V65 H64 Z" fill="#FFFFFF" />
          <path d="M50 40 C44 32 54 28 50 20 C62 25 58 35 50 40 Z" fill="#FFFFFF" />
        </g>
      `;
    case 'unclassified':
      return `
        <g transform="scale(0.8)">
          <circle cx="50" cy="50" r="22" stroke="#FFFFFF" stroke-width="4" fill="none" stroke-dasharray="6 4" />
          <circle cx="50" cy="50" r="14" stroke="#FFFFFF" stroke-width="3" fill="none" />
          <text x="50" y="58" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="24" font-weight="900" fill="#FFFFFF" text-anchor="middle">?</text>
        </g>
      `;
    default:
      return '';
  }
}

function buildClassIcons(withGlyph) {
  const out = {};
  for (const [cls, fill] of Object.entries(ICON_COLORS)) {
    out[cls] = markerSvg(fill, withGlyph ? getGlyph(cls) : '');
  }
  return out;
}

export const CLASS_DOT_ICONS = buildClassIcons(false);
export const CLASS_ICONS = buildClassIcons(true);

export const BASEMAP_ATTRIBUTIONS = {
  bluemarble: BM_ATTR,
  satellite: '© Esri, Maxar, Earthstar Geographics',
  streets: OMT_ATTR,
  topographic: OMT_ATTR
};
