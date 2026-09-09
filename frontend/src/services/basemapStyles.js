// Basemap styles + per-class fire icons (Agent A — map engine).
//
// Three switchable basemaps, ALL self-hosted (offline demo):
//   bluemarble — NASA Blue Marble static satellite image (public/tiles/bluemarble.jpg)
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
      type: 'image',
      url: '/tiles/bluemarble.jpg',
      coordinates: [
        [-180, 85.0511], [180, 85.0511], [180, -85.0511], [-180, -85.0511]
      ]
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

// ─── Per-class fire icons (SVG map pins, data URIs — no network) ─────────────

const PIN_PATH =
  'M48 8 C31 8 18 20.5 18 36 C18 58 48 90 48 90 C48 90 78 58 78 36 C78 20.5 65 8 48 8 Z';

function pinSvg(fill, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <path d="${PIN_PATH}" fill="${fill}" stroke="#FFFFFF" stroke-width="4"/>
  ${glyph}
</svg>`;
}

function icon(fill, glyph) {
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pinSvg(fill, glyph))}`,
    width: 96,
    height: 96,
    anchorX: 48,
    anchorY: 88,
    mask: false
  };
}

// White glyphs centered ~ (48, 38) inside the pin head.
export const CLASS_ICONS = {
  industrial: icon('#E67E22', `
    <path d="M34 50 V32 l9 6 v-6 l9 6 V25 h9 v25 z" fill="#FFFFFF"/>`),
  mining: icon('#95A5A6', `
    <g stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" fill="none">
      <path d="M38 60 L58 32"/>
      <path d="M31 35 Q48 22 65 35"/>
    </g>`),
  agricultural_burn: icon('#F1C40F', `
    <g stroke="#FFFFFF" stroke-width="3.5" stroke-linecap="round" fill="none">
      <path d="M48 60 V29"/>
      <path d="M48 30 l-9 -7 M48 30 l9 -7"/>
      <path d="M48 40 l-9 -7 M48 40 l9 -7"/>
      <path d="M48 50 l-9 -7 M48 50 l9 -7"/>
    </g>`),
  wildfire: icon('#E74C3C', `
    <path d="M48 21 L62 44 h-7 L64 56 H32 L41 44 h-7 Z" fill="#FFFFFF"/>
    <rect x="45" y="56" width="6" height="9" fill="#FFFFFF"/>`),
  unclassified: icon('#787878', `
    <text x="48" y="50" font-family="Arial, Helvetica, sans-serif" font-size="36"
      font-weight="bold" fill="#FFFFFF" text-anchor="middle">?</text>`)
};

export const BASEMAP_ATTRIBUTIONS = { bluemarble: BM_ATTR, streets: OMT_ATTR, topographic: OMT_ATTR };
