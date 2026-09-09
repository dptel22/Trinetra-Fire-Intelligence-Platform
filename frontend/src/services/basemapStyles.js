// Basemap styles + per-class fire icons (Agent A — map engine).
//
// Three switchable basemaps, ALL self-hosted (offline demo):
//   bluemarble — NASA Blue Marble Web-Mercator raster tiles
//                (public/tiles/bluemarble/{z}/{x}/{y}.jpg)
//                + admin boundaries / place labels from the local PMTiles archive.
//   streets    — light OpenMapTiles-schema vector style from the local PMTiles archive.
//   topographic— earth-tone vector style from the same archive.
//
// Text labels use self-hosted Noto Sans glyph pages in public/fonts/glyphs/
// (fontstack names on disk have no spaces: NotoSansRegular / NotoSansBold).
//
// Fire icons: one SVG map-pin per predicted class, generated as data URIs —
// no external icon font or image request leaves localhost.

const PMTILES_URL = import.meta.env?.VITE_PMTILES_URL ?? null;

// True when the offline vector archive is configured via VITE_PMTILES_URL.
// When false the map runs on the local Blue Marble raster tiles and flat vector
// fallbacks — the UI surfaces a "basemap pack not installed" notice instead of
// failing silently (docs/PMTILES_BUILD.md).
export const PMTILES_AVAILABLE = Boolean(PMTILES_URL);

const GLYPHS_URL = '/fonts/glyphs/{fontstack}/{range}.pbf';
const OMT_ATTR = '© OpenMapTiles © OpenStreetMap contributors';
const BM_ATTR = 'NASA Visible Earth (Blue Marble) · © OpenMapTiles © OpenStreetMap contributors';

const FONT_REG = ['NotoSansRegular'];
const FONT_BOLD = ['NotoSansBold'];

function vectorSources() {
  const sources = {};
  if (PMTILES_URL) {
    sources.openmaptiles = {
      type: 'vector',
      url: `pmtiles://${PMTILES_URL}`,
      attribution: OMT_ATTR
    };
  }
  return sources;
}

// Shared overlay: admin boundaries + city/town labels (works over any base).
function boundaryAndPlaceLayers(paint) {
  const layers = [];
  if (PMTILES_URL) {
    layers.push({
      id: 'boundary-country',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['==', 'admin_level', 2],
      paint: { 'line-color': paint.country, 'line-width': 1.6, 'line-opacity': 0.95 }
    });
    layers.push({
      id: 'boundary-state',
      type: 'line',
      source: 'openmaptiles',
      'source-layer': 'boundary',
      filter: ['==', 'admin_level', 4],
      paint: { 'line-color': paint.state, 'line-width': 0.8, 'line-opacity': 0.7 }
    });
    layers.push({
      id: 'place-city',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['==', ['get', 'class'], 'city'],
      minzoom: 4,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 12, 10, 16]
      },
      paint: {
        'text-color': paint.label,
        'text-halo-color': paint.halo,
        'text-halo-width': 1.6
      }
    });
    layers.push({
      id: 'place-town',
      type: 'symbol',
      source: 'openmaptiles',
      'source-layer': 'place',
      filter: ['==', ['get', 'class'], 'town'],
      minzoom: 7.5,
      layout: {
        'text-field': ['get', 'name'],
        'text-font': FONT_REG,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 12, 13]
      },
      paint: {
        'text-color': paint.label,
        'text-halo-color': paint.halo,
        'text-halo-width': 1.4
      }
    });
  }
  return layers;
}

function buildBlueMarbleStyle() {
  const layers = [
    { id: 'background', type: 'background', paint: { 'background-color': '#0b1626' } },
    {
      id: 'bluemarble',
      type: 'raster',
      source: 'bluemarble',
      paint: { 'raster-opacity': 1, 'raster-fade-duration': 0 }
    }
  ];
  const sources = {
    bluemarble: {
      type: 'raster',
      tiles: ['/tiles/bluemarble/{z}/{x}/{y}.jpg'],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 6,
      attribution: BM_ATTR
    }
  };
  Object.assign(sources, vectorSources());
  layers.push(...boundaryAndPlaceLayers({
    country: '#FFFFFF', state: '#E8E8E8',
    label: '#FFFFFF', halo: 'rgba(0,0,0,0.75)'
  }));
  return {
    version: 8,
    name: 'blue-marble',
    glyphs: GLYPHS_URL,
    sources,
    layers
  };
}

function buildStreetsStyle() {
  if (!PMTILES_URL) {
    return {
      version: 8,
      name: 'streets-fallback',
      sources: {},
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#F5F4F0' } }
      ]
    };
  }
  return {
    version: 8,
    name: 'streets',
    glyphs: GLYPHS_URL,
    sources: vectorSources(),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#F5F4F0' } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: {
          'fill-opacity': 0.85,
          'fill-color': [
            'match', ['get', 'class'],
            'wood', '#D8E8CB',
            'grass', '#E4EFD6',
            'sand', '#EFE7CE',
            'wetland', '#D3E5D4',
            'ice', '#E3EDF2',
            'rgba(0,0,0,0)'
          ]
        }
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        paint: {
          'fill-opacity': 0.7,
          'fill-color': [
            'match', ['get', 'class'],
            'residential', '#ECEBE7',
            'industrial', '#E9E3DB',
            'quarry', '#E8E0D6',
            'farmland', '#EFE9CF',
            'rgba(0,0,0,0)'
          ]
        }
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': '#CDE7C2', 'fill-opacity': 0.9 }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': '#A8CFE3' }
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': '#A8CFE3',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 2]
        }
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: [
          'in', 'class', 'minor', 'service', 'track'
        ],
        minzoom: 11,
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 3]
        }
      },
      {
        id: 'road-mid',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'secondary', 'tertiary'],
        minzoom: 8,
        paint: {
          'line-color': '#FBD8AC',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.6, 14, 3]
        }
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
        paint: {
          'line-color': '#F3A64B',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 4]
        }
      },
      ...boundaryAndPlaceLayers({
        country: '#C0453A', state: '#B7BCC2',
        label: '#35393D', halo: '#FFFFFF'
      })
    ]
  };
}

function buildTopographicStyle() {
  if (!PMTILES_URL) {
    return {
      version: 8,
      name: 'topographic-fallback',
      sources: {},
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#EDE7D9' } }
      ]
    };
  }
  return {
    version: 8,
    name: 'topographic',
    glyphs: GLYPHS_URL,
    sources: vectorSources(),
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#EDE7D9' } },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: {
          'fill-opacity': 0.9,
          'fill-color': [
            'match', ['get', 'class'],
            'wood', '#C6D9AE',
            'grass', '#DFE6BE',
            'sand', '#EDE0B8',
            'wetland', '#C2D6C5',
            'rgba(0,0,0,0)'
          ]
        }
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        paint: {
          'fill-opacity': 0.8,
          'fill-color': [
            'match', ['get', 'class'],
            'farmland', '#E6DCB8',
            'residential', '#E3DCCE',
            'quarry', '#E0D4C2',
            'rgba(0,0,0,0)'
          ]
        }
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': '#CBE3B5', 'fill-opacity': 0.9 }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': '#9FC1D8' }
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': '#9FC1D8',
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.5, 12, 2]
        }
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'minor', 'service', 'track'],
        minzoom: 11,
        paint: {
          'line-color': '#FFFFFF',
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.5, 16, 2.5]
        }
      },
      {
        id: 'road-mid',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'secondary', 'tertiary'],
        minzoom: 8,
        paint: {
          'line-color': '#B49B76',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2.2]
        }
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', 'class', 'motorway', 'trunk', 'primary'],
        paint: {
          'line-color': '#C97F3D',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.7, 12, 3.5]
        }
      },
      ...(PMTILES_URL ? [{
        id: 'peak-label',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'mountain_peak',
        minzoom: 8,
        layout: {
          'text-field': ['concat', ['get', 'name'], ' · ', ['get', 'ele'], 'm'],
          'text-font': FONT_REG,
          'text-size': 10
        },
        paint: {
          'text-color': '#6B5233',
          'text-halo-color': '#F2ECDD',
          'text-halo-width': 1.2
        }
      }] : []),
      ...boundaryAndPlaceLayers({
        country: '#7A5C33', state: '#A98F63',
        label: '#4A3A22', halo: '#F2ECDD'
      })
    ]
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
// One restrained marker shape keeps the map calm; the white pictogram carries
// the class meaning so the taxonomy is not dependent on color alone.

const ICON_SIZE = 72;

function markerSvg(fill, glyph) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 72 72">
  <rect x="7" y="7" width="58" height="58" rx="18" fill="#0B1626" fill-opacity="0.92" stroke="#0B1626" stroke-width="5"/>
  <rect x="10" y="10" width="52" height="52" rx="15" fill="${fill}" stroke="#FFFFFF" stroke-width="2.5"/>
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

const ICON_COLORS = {
  industrial: '#F28C28',
  mining: '#8FA3AE',
  agricultural_burn: '#E9B923',
  wildfire: '#E8554F',
  unclassified: '#697783'
};

// Pictograms are deliberately simple so they remain recognizable at z4–z16.
const GLYPHS = {
  industrial: `<path d="M27 51 V39 h12 l7 5 v-17 h6 v24 h-6 V51 Z" fill="#FFFFFF"/>
    <path d="M51 27 c0-3 3-3 3-6 c3 3 3 6 0 8 c-2 1-3 0-3-2 Z" fill="#FFFFFF"/>`,
  wildfire: `<path d="M36 51 c-5-7-1-13 5-18 c0 5 3 6 4 9 c2-4 2-8 1-13 c8 7 11 13 8 20
    a12 12 0 0 1-23 2 c-1-4 1-7 4-10 c0 4 1 7 1 10 Z" fill="#FFFFFF"/>`,
  mining: `<g stroke="#FFFFFF" stroke-width="4.5" stroke-linecap="round" fill="none">
    <path d="M29 49 L49 29"/><path d="M42 27 Q51 27 57 34"/>
    <path d="M47 47 l8 8"/>
  </g>`,
  agricultural_burn: `<g stroke="#FFFFFF" stroke-width="3.2" stroke-linecap="round" fill="none">
    <path d="M36 53 V33 M36 41 l-7-6 M36 44 l7-7 M36 48 l-7-6"/>
    <path d="M46 53 V38 M46 44 l7-6 M46 47 l-7-5"/>
    <path d="M27 56 H56" stroke-width="3.8"/>
  </g>`,
  unclassified: `<text x="36" y="49" font-family="Arial, Helvetica, sans-serif" font-size="25"
    font-weight="bold" fill="#FFFFFF" text-anchor="middle">?</text>`
};

function buildClassIcons(withGlyph) {
  const out = {};
  for (const [cls, fill] of Object.entries(ICON_COLORS)) {
    out[cls] = markerSvg(fill, withGlyph ? GLYPHS[cls] : '');
  }
  return out;
}

export const CLASS_DOT_ICONS = buildClassIcons(false);
export const CLASS_ICONS = buildClassIcons(true);

export const BASEMAP_ATTRIBUTIONS = { bluemarble: BM_ATTR, streets: OMT_ATTR, topographic: OMT_ATTR };
