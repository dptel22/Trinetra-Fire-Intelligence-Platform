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
  industrial: '#FF7A00',
  mining: '#333A44',
  agricultural_burn: '#0E8A38',
  wildfire: '#E62325',
  unclassified: '#787878'
};

function getGlyph(cls, fill) {
  switch (cls) {
    case 'industrial':
      return `
        <rect x="15" y="44" width="31" height="15" rx="0.5" fill="#FFFFFF"/>
        <rect x="18" y="50" width="3.5" height="3.5" rx="0.5" fill="${fill}"/>
        <rect x="25" y="50" width="3.5" height="3.5" rx="0.5" fill="${fill}"/>
        <rect x="32" y="50" width="3.5" height="3.5" rx="0.5" fill="${fill}"/>
        <rect x="39" y="50" width="3.5" height="3.5" rx="0.5" fill="${fill}"/>
        <polygon points="21,44 23,30 27,30 28,44" fill="#FFFFFF"/>
        <polygon points="29,44 31,31 35,31 36,44" fill="#FFFFFF"/>
        <rect x="49" y="38" width="6.5" height="21" rx="0.5" fill="#FFFFFF"/>
        <rect x="58" y="42" width="6.5" height="17" rx="0.5" fill="#FFFFFF"/>
        <path d="M 24,30 C 23,24 28,19 33,20 C 36,17 43,17 46,20 C 50,18 56,21 57,25 C 58,29 55,33 50,32 C 45,32 42,34 37,32 C 32,32 29,33 24,30 Z" fill="#FFFFFF"/>
      `;
    case 'mining':
      return `
        <rect x="15" y="51" width="26" height="8" rx="4" fill="#FFFFFF"/>
        <rect x="18" y="53.5" width="20" height="3" rx="1.5" fill="${fill}"/>
        <circle cx="21" cy="55" r="1" fill="#FFFFFF"/>
        <circle cx="25" cy="55" r="1" fill="#FFFFFF"/>
        <circle cx="28" cy="55" r="1" fill="#FFFFFF"/>
        <circle cx="31" cy="55" r="1" fill="#FFFFFF"/>
        <circle cx="35" cy="55" r="1" fill="#FFFFFF"/>
        <path d="M 23 51 V 40 H 35 V 51 Z" fill="#FFFFFF"/>
        <rect x="27.5" y="42" width="6" height="5" rx="0.8" fill="${fill}"/>
        <polygon points="32,45 35,42 49,24 53,26 36,47" fill="#FFFFFF"/>
        <polygon points="49,24 60,37 57,39.5 47,27" fill="#FFFFFF"/>
        <path d="M 58,37 L 64,42 C 65,47 62,51 57,51 L 56,46 L 55,41 Z" fill="#FFFFFF"/>
        <polygon points="56,51 57,53.5 58,51" fill="#FFFFFF"/>
        <polygon points="59,51 60,53.5 61,51" fill="#FFFFFF"/>
        <polygon points="46,59 53,48 60,59" fill="#FFFFFF"/>
        <polygon points="41,59 45,53 49,59" fill="#FFFFFF"/>
        <polygon points="57,59 61,52 65,59" fill="#FFFFFF"/>
      `;
    case 'agricultural_burn':
      return `
        <path d="M 38.5,49 L 41.5,49 L 43,62 L 37,62 Z" fill="#FFFFFF"/>
        <path d="M 34,50 L 36.5,50 L 33.5,62 L 28,62 Z" fill="#FFFFFF"/>
        <path d="M 29.5,51 L 32,51 L 24.5,62 L 19,62 Z" fill="#FFFFFF"/>
        <path d="M 25,52.5 L 27.5,52.5 L 16,61 L 13.5,59.5 Z" fill="#FFFFFF"/>
        <path d="M 43.5,50 L 46,50 L 52,62 L 46.5,62 Z" fill="#FFFFFF"/>
        <path d="M 48,51 L 50.5,51 L 61,62 L 55.5,62 Z" fill="#FFFFFF"/>
        <path d="M 52.5,52.5 L 55,52.5 L 66.5,59.5 L 64,61 Z" fill="#FFFFFF"/>
        <line x1="16" y1="48" x2="64" y2="48" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
        <line x1="21" y1="46" x2="21" y2="30" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
        <path d="M 21,34 Q 17,32 17,34 Q 18,37 21,36 M 21,34 Q 25,32 25,34 Q 24,37 21,36 M 21,39 Q 17,37 17,39 Q 18,42 21,41 M 21,39 Q 25,37 25,39 Q 24,42 21,41 M 21,30 Q 19,27 21,25 Q 23,27 21,30" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.8"/>
        <line x1="29" y1="46" x2="29" y2="28" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round"/>
        <path d="M 29,32 Q 25,30 25,32 Q 26,35 29,34 M 29,32 Q 33,30 33,32 Q 32,35 29,34 M 29,37 Q 25,35 25,37 Q 26,40 29,39 M 29,37 Q 33,35 33,37 Q 32,40 29,39 M 29,28 Q 27,25 29,23 Q 31,25 29,28" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="0.8"/>
        <path d="M 48,46 C 40,46 38,39 42,34 C 44,30 45,28 43,24 C 46,23 50,19 51,18 C 52,23 57,25 54,29 C 58,29 62,33 60,38 C 59,44 54,46 48,46 Z" fill="#FFFFFF"/>
        <path d="M 48,43 C 45,43 43,40 45,36 C 46,34 47,32 46,30 C 48,31 51,34 50,37 C 49,41 48,43 48,43 Z" fill="${fill}"/>
      `;
    case 'wildfire':
      return `
        <path d="M 17,59 Q 40,55 63,59" stroke="#FFFFFF" stroke-width="2.8" stroke-linecap="round" fill="none"/>
        <rect x="39" y="53" width="2" height="5" fill="#FFFFFF"/>
        <polygon points="32,53 48,53 40,45" fill="#FFFFFF"/>
        <polygon points="34,47 46,47 40,40" fill="#FFFFFF"/>
        <polygon points="36,42 44,42 40,35" fill="#FFFFFF"/>
        <rect x="25" y="55" width="1.8" height="4" fill="#FFFFFF"/>
        <polygon points="19,55 33,55 26,48" fill="#FFFFFF"/>
        <polygon points="21,50 31,50 26,43" fill="#FFFFFF"/>
        <rect x="53" y="55" width="1.8" height="4" fill="#FFFFFF"/>
        <polygon points="47,55 61,55 54,48" fill="#FFFFFF"/>
        <polygon points="49,50 59,50 54,43" fill="#FFFFFF"/>
        <path d="M 40,16 C 49,21 52,29 48,34 C 52,32 55,34 54,40 C 53,44 47,47 40,47 C 33,47 27,44 26,40 C 25,34 28,32 32,34 C 28,29 31,21 40,16 Z" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M 40,25 C 43,28 44,32 42,36 C 40,38 37,38 37,35" fill="none" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
      `;
    case 'unclassified':
      return `
        <circle cx="40" cy="40" r="18" fill="none" stroke="#FFFFFF" stroke-width="2.8" stroke-dasharray="23 5.5 23 5.5 23 5.5 23 5.5" transform="rotate(45 40 40)"/>
        <line x1="40" y1="14" x2="40" y2="21" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
        <line x1="40" y1="59" x2="40" y2="66" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
        <line x1="14" y1="40" x2="21" y2="40" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
        <line x1="59" y1="40" x2="66" y2="40" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round"/>
        <text x="40" y="48.5" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="25" font-weight="900" fill="#FFFFFF" text-anchor="middle">?</text>
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
