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


function buildBlueMarbleStyle() {
  const sources = {
    satellite: {
      type: 'raster',
      tiles: [
        'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'
      ],
      tileSize: 256,
      maxzoom: 8,
      attribution: 'NASA Visible Earth · Blue Marble Next Generation (Shaded Relief & Bathymetry)'
    },
    reference: {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
        'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize: 256,
      maxzoom: 19
    }
  };

  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#030814' } },
    {
      id: 'satellite-layer',
      type: 'raster',
      source: 'satellite',
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 150 }
    },
    {
      id: 'reference-layer',
      type: 'raster',
      source: 'reference',
      paint: { 'raster-opacity': 0.85, 'raster-fade-duration': 150 }
    }
  ];

  return {
    version: 8,
    name: 'blue-marble',
    glyphs: GLYPHS_URL,
    sources,
    layers
  };
}

function buildStreetsStyle() {
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

function buildTopographicStyle() {
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
  { id: 'streets', label: 'Streets' },
  { id: 'topographic', label: 'Topographic' }
];

export function buildBasemapStyle(id) {
  switch (id) {
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

function getGlyph(cls, fill) {
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
    out[cls] = markerSvg(fill, withGlyph ? getGlyph(cls, fill) : '');
  }
  return out;
}

export const CLASS_DOT_ICONS = buildClassIcons(false);
export const CLASS_ICONS = buildClassIcons(true);

export const BASEMAP_ATTRIBUTIONS = { bluemarble: BM_ATTR, streets: OMT_ATTR, topographic: OMT_ATTR };
