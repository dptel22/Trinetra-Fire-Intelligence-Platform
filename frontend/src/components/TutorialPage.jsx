import React, { useState } from 'react';
import Header from './Header';
import { CLASS_COLORS, CLASS_LABELS } from '../services/api';

/* ─── Color constants matching the locked taxonomy ─── */
const TAXONOMY = [
  { cls: 'industrial',        color: CLASS_COLORS.industrial,        label: CLASS_LABELS.industrial,        desc: 'Thermal sources near mapped industrial facilities. Includes gas flares, smelters, refineries, and cement kilns.' },
  { cls: 'mining',            color: CLASS_COLORS.mining,            label: CLASS_LABELS.mining,            desc: 'Open-cut mines, ore processors. Lower labeled support — read with caution.' },
  { cls: 'agricultural_burn', color: CLASS_COLORS.agricultural_burn, label: CLASS_LABELS.agricultural_burn, desc: 'Crop residue burning. Always flagged for analyst review (confidence threshold > 1.0 by design).' },
  { cls: 'wildfire',          color: CLASS_COLORS.wildfire,          label: CLASS_LABELS.wildfire,          desc: 'Open-land or canopy thermal sources.' },
  { cls: 'unclassified',      color: CLASS_COLORS.unclassified,      label: CLASS_LABELS.unclassified,      desc: 'Abstention fallback — shown only when the batch actually contains unclassified predictions.' },
];

const SECTIONS = [
  { id: 'overview',        title: 'What is Trinetra?' },
  { id: 'map',             title: 'Reading the Map' },
  { id: 'classes',         title: 'Understanding Classifications' },
  { id: 'inspector',       title: 'Using the Hex Inspector' },
  { id: 'alerts',          title: 'Fire Alerts & Archive' },
  { id: 'limitations',     title: 'Known Limitations' },
  { id: 'quickref',        title: 'Quick Reference' },
  { id: 'docs',            title: 'Documentation' },
];

/* ─── Docs accordion entries ─── */
const DOCS = [
  {
    id: 'setup',
    title: 'Getting Started (PROJECT_SETUP.md)',
    content: `
**System Requirements:**
- Windows PowerShell, Python 3.12, Node.js 18+
- 8 GB RAM minimum (16 GB recommended for OSM enrichment)

**Fast Setup:**
\`\`\`powershell
.\\scripts\\setup.ps1 -Mode demo
.\\scripts\\verify.ps1
\`\`\`

**Start Services:**
\`\`\`powershell
# Backend (terminal 1)
.\\.venv\\Scripts\\Activate.ps1
uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend (terminal 2)
cd frontend
npm run dev
\`\`\`

Then open **http://localhost:5173**

**Serving Data (if not already present):**
\`\`\`powershell
.\\scripts\\setup.ps1 -Mode demo -DownloadServingData
\`\`\`
Download: https://github.com/dptel22/Trinetra-Fire-Intelligence-Platform/releases/tag/serving-data-2026-09-09
    `,
  },
  {
    id: 'architecture',
    title: 'Architecture & Current State (CURRENT_PROJECT_TRUTH.md)',
    content: `
**Trinetra Fire Intelligence Platform** — SIH 2026, PS26162.

**Pipeline:**
\`NASA FIRMS → Ingestion → H3 cell/day features → OSM/WRI enrichment → CatBoost/calibration → FastAPI → React/MapLibre/Deck.gl\`

**Prediction unit:** \`(h3_08, acq_date)\` — one prediction per H3 resolution-8 cell per day.

**Backend endpoints (/api/v1):**
- \`GET /predictions?min_lat&max_lat&min_lon&max_lon&acq_date&zoom\` — server cap 2,500 rows
- \`GET /predictions/{cell_id}\` — single cell detail
- \`GET /predictions/{cell_id}/explain\` — SHAP explanation
- \`GET /cells/{cell_id}/timeline?granularity=day|month|year\` — H3 thermal history
- \`GET /health\` — service status + ingestion provenance

**Trained classes:** industrial, mining, agricultural_burn, wildfire (4 classes).  
**Abstention:** unclassified (not a trained class — shown only when present in batch).  
**Coverage:** All 36 Indian States and Union Territories (nationwide inference).  
    `,
  },
  {
    id: 'judge',
    title: 'Judge / Evaluator Guide (HACKATHON_JUDGE_RUNBOOK.md)',
    content: `
**Demo Path:**
1. \`.\\.\\scripts\\setup.ps1 -Mode demo -SkipInstall\`
2. If serving data missing: \`.\\.\\scripts\\setup.ps1 -Mode demo -DownloadServingData\`
3. Start backend: \`python -m uvicorn app.main:app --host 127.0.0.1 --port 8000\`
4. Run \`.\\.\\scripts\\verify.ps1\` — show health + latest date
5. \`cd frontend; npm run dev\`
6. Open the frontend URL — show map, filters, inspector, explanations, archive, alert review

**Truthfulness Rules:**
- LIVE, HISTORICAL, DEMO, and OFFLINE are distinct states
- Mock rows are always visibly labeled (OfflineBanner)
- Confidence = model's returned probability, not an accuracy claim
- Mining and agricultural-burn caveats remain visible at all times
- Empty states/UTs remain empty — no synthetic alerts fabricated

**Recovery:** If backend unavailable, frontend shows explicitly labeled demo data for map exploration only. Detail/explanations/archive mutations must remain visibly unavailable.
    `,
  },
  {
    id: 'coverage',
    title: 'Data Coverage & Limitations (NATIONWIDE_INGESTION_AND_TIMELINE_AUDIT.md)',
    content: `
**Nationwide Inference:** All 36 administrative entities (28 States + 8 Union Territories).

**On any single day,** VIIRS sensors detect fire anomalies in a subset of states. States with zero detections are not fabricated — they simply had no satellite-detected thermal anomalies.

**Timeline Service:**
- Pre-computed rollup files: \`data/processed/timeline/h3_timeline_daily.parquet\`, \`monthly\`, \`yearly\`
- Fallback to raw h3_daily enabled: \`TIMELINE_ALLOW_FALLBACK=1\`
- Historical OSM/WRI land-use context is always present-day snapshot — not multi-year data

**Training Geography vs Serving Geography:**
- 10 states have validated training labels (model benchmark)
- All 36 states/UTs receive inference — cells outside the 10-state training geography are flagged \`outside_training_geography\` for analyst review
    `,
  },
  {
    id: 'problem',
    title: 'Problem Statement & NTRO Mission Scope (problem-statement.md)',
    content: `
**Client:** National Technical Research Organisation (NTRO)  
**Problem Statement:** PS26162 — Real-time classification and discrimination of thermal anomalies across the Indian territory.

**The Challenge:**
Standard satellite fire products (FIRMS, MODIS, VIIRS) report raw thermal anomalies as coordinates with Fire Radiative Power (FRP), but cannot distinguish between:
1. Routine gas flaring at petrochemical refineries (e.g. Jamnagar, Paradip)
2. High-heat smelting and open-cut mining activity
3. Seasonal crop residue burning (Punjab/Haryana stubble)
4. Forest canopy and open-land wildfires

**The Solution:**
TRINETRA fuses satellite thermal infrared observations with high-resolution geospatial infrastructure data (OpenStreetMap industrial boundaries, WRI global power plants, coalfield coordinates) using Uber H3 Resolution-8 spatial tessellation.
    `,
  },
  {
    id: 'sensors',
    title: 'Satellite Sensor Fusion Strategy (Beyond SNPP-Only.md)',
    content: `
**Sensor Selection:** Dual VIIRS payload (Suomi-NPP + NOAA-20)

**Key Advantages over legacy MODIS:**
- **375m Spatial Resolution:** VIIRS I-band (I4 3.74µm, I5 11.45µm) offers 16× finer areal resolution than MODIS 1000m pixels.
- **Constant Pixel Footprint:** VIIRS onboard aggregation limits edge-of-scan pixel deformation; MODIS pixels grow up to 5× at swath edges.
- **Dual-Orbit Temporal Refresh:** SNPP and NOAA-20 share the same sun-synchronous afternoon orbit separated by 50 minutes, providing interleaved observations over India every 3 to 6 hours.
- **Saturation Resistance:** The VIIRS Dual-Gain channel handles intense industrial flare temperatures up to 1800K without signal clipping.
    `,
  },
  {
    id: 'model',
    title: 'ML Architecture & 52-Feature Bundle (Final model.md)',
    content: `
**Core Engine:** Gradient Boosted Decision Trees via CatBoost.

**Feature Composition (52 Features):**
- **Spatial Infrastructure Distances:** Proximity to nearest oil refinery, chemical plant, steel mill, power plant, and open-pit mine.
- **Thermal Intensity Metrics:** Maximum Brightness Temperature (I4), background temperature (I5), and Brightness Difference (I4 - I5).
- **Radiative Energy:** Fire Radiative Power (FRP), total cell thermal energy flux.
- **Temporal Persistence (Regime):** Cell detection counts across 7-day, 30-day, and 90-day rolling windows to identify permanent vs transient thermal sources.
- **Land Cover Context:** ESA WorldCover 10m categorical land class probabilities.

**Calibration & Honest Inference:**
Predictions are calibrated via Isotonic Regression. The model emits probabilities and adheres to locked per-class review thresholds.
    `,
  },
  {
    id: 'audit',
    title: 'System Verification & Model-Honesty Audit (WHOLE_SYSTEM_AUDIT.md)',
    content: `
**Model-Honesty Mandate:**
- **Never report unverifiable accuracy:** Confidence figures shown in the UI represent calibrated class probabilities for that specific detection, not overall model accuracy claims.
- **Agricultural Burn Review Policy:** Threshold set to 1.01 (mechanically triggering \`needs_review=true\`) because stubble burning requires human geographic verification before policy action.
- **Mining Support Caveats:** Acknowledges thinner training sample support for mining perimeters.
- **Zero Hallucination:** States with zero detections on an acquisition day report 0 rows — synthetic thermal hotspots are strictly forbidden.
- **Mode Transparency:** When the system runs in Demo or Offline mode, banners explicitly inform analysts.
    `,
  },
  {
    id: 'pmtiles',
    title: 'Offline PMTiles Vector Tile Architecture (PMTILES_BUILD.md)',
    content: `
**Basemap Strategy:** Self-contained PMTiles archive for offline or air-gapped environments.

**Format Specifications:**
- **Protocol:** PMTiles v3 (single-file cloud-optimized archive).
- **Schema:** OpenMapTiles vector tile schema (transportation, water, landuse, buildings).
- **Pipeline:** Built via Planetiler from India OpenStreetMap \`.osm.pbf\` extracts.
- **Client Integration:** MapLibre GL JS registers the \`pmtiles://\` protocol handler and fetches range requests directly via browser fetch.
- **Zero Server Overhead:** Requires no TileServer GL, Docker container, or Node tile proxy.
    `,
  },
];

/* ─── Simple markdown-ish renderer ─── */
function DocContent({ content }) {
  const lines = content.trim().split('\n');
  const elements = [];
  let codeBlock = null;
  let codeLines = [];

  lines.forEach((line, i) => {
    if (line.startsWith('```')) {
      if (codeBlock !== null) {
        elements.push(
          <pre key={`code-${i}`} style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '0.9rem 1rem', fontSize: '0.78rem', overflowX: 'auto', margin: '0.5rem 0', lineHeight: 1.6, color: '#7ee787' }}>
            <code>{codeLines.join('\n')}</code>
          </pre>
        );
        codeBlock = null;
        codeLines = [];
      } else {
        codeBlock = line.slice(3);
      }
      return;
    }
    if (codeBlock !== null) { codeLines.push(line); return; }

    if (line.startsWith('**') && line.endsWith('**') && line.length > 4) {
      elements.push(<div key={i} style={{ fontWeight: 700, color: 'var(--text-primary, #eceff4)', marginTop: '0.85rem', marginBottom: '0.2rem', fontSize: '0.88rem' }}>{line.slice(2, -2)}</div>);
    } else if (line.startsWith('- ')) {
      elements.push(<li key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.6, marginBottom: 2 }}>{inlineFormat(line.slice(2))}</li>);
    } else if (line.trim() === '') {
      elements.push(<div key={i} style={{ height: '0.4rem' }} />);
    } else {
      elements.push(<p key={i} style={{ fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.65, margin: '0.2rem 0' }}>{inlineFormat(line)}</p>);
    }
  });

  return <div style={{ paddingTop: '0.5rem' }}>{elements}</div>;
}

function inlineFormat(text) {
  // Replace `code` spans
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) =>
    part.startsWith('`') && part.endsWith('`')
      ? <code key={i} style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.8em', color: '#7ee787' }}>{part.slice(1, -1)}</code>
      : part
  );
}

function DocAccordion({ doc }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden', marginBottom: '0.6rem' }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: '100%', textAlign: 'left', background: open ? 'rgba(61,157,232,0.08)' : 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer', padding: '0.9rem 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--text-primary, #eceff4)', fontWeight: 600, fontSize: '0.88rem', transition: 'background 0.15s' }}
      >
        {doc.title}
        <span style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', color: 'var(--text-muted, #8b949e)', fontSize: '0.85rem' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0.75rem 1.25rem 1.25rem', background: 'rgba(0,0,0,0.25)' }}>
          <DocContent content={doc.content} />
        </div>
      )}
    </div>
  );
}

export default function TutorialPage() {
  const [activeSection, setActiveSection] = useState('overview');

  const sectionStyle = { marginBottom: '2.5rem' };
  const h2Style = { fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary, #eceff4)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' };
  const bodyStyle = { color: 'var(--text-muted, #8b949e)', fontSize: '0.88rem', lineHeight: 1.7 };
  const infoBoxStyle = { background: 'rgba(61,157,232,0.08)', border: '1px solid rgba(61,157,232,0.2)', borderRadius: 8, padding: '0.9rem 1.1rem', fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.6, marginTop: '0.75rem' };
  const warnBoxStyle = { background: 'rgba(241,196,15,0.08)', border: '1px solid rgba(241,196,15,0.2)', borderRadius: 8, padding: '0.9rem 1.1rem', fontSize: '0.82rem', color: 'var(--text-muted, #8b949e)', lineHeight: 1.6, marginTop: '0.75rem' };

  return (
    <div style={{ backgroundColor: 'var(--bg-dark, #0a0e12)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header />

      <style>{`
        .tut-nav-item { transition: all 0.15s; }
        .tut-nav-item:hover { background: rgba(255,255,255,0.06) !important; }
        .tut-section { scroll-margin-top: 80px; }
        .shortcut-key { display: inline-block; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 4px; padding: 1px 7px; font-size: 0.78rem; font-family: monospace; color: var(--text-primary, #eceff4); }
      `}</style>

      {/* Page header */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '2.5rem 2rem 1.75rem', background: 'linear-gradient(180deg, rgba(30,40,55,0.5) 0%, transparent 100%)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-primary, #eceff4)', margin: '0 0 0.5rem', letterSpacing: '-0.01em' }}>
            Tutorial & Documentation
          </h1>
          <p style={{ color: 'var(--text-muted, #8b949e)', fontSize: '0.9rem', margin: 0 }}>
            How to use the platform, understand classifications, and interpret model outputs.
          </p>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0 1.5rem' }}>

        {/* Sidebar nav */}
        <aside style={{ width: 220, flexShrink: 0, paddingTop: '1.75rem', paddingRight: '1.5rem', position: 'sticky', top: 80, alignSelf: 'flex-start' }}>
          <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted, #8b949e)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>On this page</div>
          {SECTIONS.map((sec) => (
            <a
              key={sec.id}
              className="tut-nav-item"
              href={`#${sec.id}`}
              onClick={(e) => { e.preventDefault(); document.getElementById(sec.id)?.scrollIntoView({ behavior: 'smooth' }); setActiveSection(sec.id); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '0.45rem 0.7rem', borderRadius: 6, marginBottom: 2,
                color: activeSection === sec.id ? 'var(--text-primary, #eceff4)' : 'var(--text-muted, #8b949e)',
                background: activeSection === sec.id ? 'rgba(255,255,255,0.07)' : 'transparent',
                textDecoration: 'none', fontSize: '0.82rem', fontWeight: activeSection === sec.id ? 600 : 400,
                borderLeft: activeSection === sec.id ? '2px solid #FF6B35' : '2px solid transparent',
                transition: 'all 0.15s',
              }}
            >
              <span>{sec.icon}</span>{sec.title}
            </a>
          ))}
        </aside>

        {/* Main content */}
        <main style={{ flex: 1, paddingTop: '1.75rem', paddingBottom: '3rem', minWidth: 0 }}>

          {/* 1. Overview */}
          <section id="overview" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>What is Trinetra?</h2>
            <p style={bodyStyle}>
              <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Trinetra Fire Intelligence Platform</strong> is a full-stack system built for SIH 2026 (PS26162) that detects and classifies industrial fires, mining activity, agricultural burns, and wildfires across India using NASA FIRMS VIIRS thermal satellite data fused with OSM and WRI power-plant context.
            </p>
            <p style={{ ...bodyStyle, marginTop: '0.75rem' }}>
              Every thermal anomaly detected by the VIIRS 375m I-Band sensor is aggregated into an H3 Resolution 8 hexagonal cell (~0.74 km²), enriched with present-day land-use context from OpenStreetMap and WRI, and classified by a calibrated CatBoost model into one of four fire classes.
            </p>
            <div style={infoBoxStyle}>
              <strong>Data flow:</strong> NASA FIRMS → H3 aggregation → OSM/WRI enrichment → CatBoost inference → FastAPI → React/MapLibre/Deck.gl frontend
            </div>
            {/* Architecture diagram */}
            <div style={{ marginTop: '1.25rem', borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <img
                src="/images/trinetra-logo-dark.png"
                alt="Trinetra logo"
                style={{ height: 48, display: 'block', padding: '0.75rem 1rem' }}
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 2.5rem' }} />

          {/* 2. Map */}
          <section id="map" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>Reading the Map</h2>
            <p style={bodyStyle}>The main map at <strong style={{ color: 'var(--text-primary, #eceff4)' }}>/fire-map</strong> renders H3 Resolution-8 hexagonal cells. Each hex represents one (cell, date) prediction.</p>
            <ul style={{ ...bodyStyle, paddingLeft: '1.25rem', marginTop: '0.6rem' }}>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Zoom in</strong> to see individual cells. At low zoom, cells are coalesced.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Click a hex</strong> to open the Hex Inspector panel on the right.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Filter by class</strong> using the Classification Filters panel (top-left sidebar).</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Change the date</strong> using the date selector in the sidebar — one acquisition date per query.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Basemap:</strong> Blue Marble raster tiles (offline, included). Full vector basemap requires building <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.8em' }}>india.pmtiles</code> locally.</li>
            </ul>
            <div style={infoBoxStyle}>
              The hard server-side cap is <strong>2,500 predictions per request</strong>. Large bounding boxes are tiled client-side (2×2 tiles). If the map appears sparse at wide zoom, this is expected.
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 2.5rem' }} />

          {/* 3. Classifications */}
          <section id="classes" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>Understanding Classifications</h2>
            <p style={bodyStyle}>The model predicts one of four trained classes. Color coding is locked — never changed:</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem', marginTop: '0.85rem' }}>
              {TAXONOMY.map((t) => (
                <div key={t.cls} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '0.75rem 1rem', border: `1px solid ${t.color}33` }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, backgroundColor: t.color, flexShrink: 0, marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary, #eceff4)', fontSize: '0.88rem', marginBottom: 2 }}>{t.label}</div>
                    <div style={{ color: 'var(--text-muted, #8b949e)', fontSize: '0.8rem', lineHeight: 1.55 }}>{t.desc}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={warnBoxStyle}>
              <strong>Model honesty:</strong> Confidence shown is the calibrated model probability — not an accuracy claim. Mining results have lower labeled support and should always be read cautiously. Agricultural burn is always flagged for analyst review.
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 2.5rem' }} />

          {/* 4. Inspector */}
          <section id="inspector" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>Using the Hex Inspector</h2>
            <p style={bodyStyle}>Click any hex on the map to open the <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Hex Inspector Panel</strong> on the right sidebar.</p>
            <ul style={{ ...bodyStyle, paddingLeft: '1.25rem', marginTop: '0.6rem' }}>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Predicted Class</strong> — with confidence bar and calibration state badge.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Needs Review flag</strong> — when confidence is below the per-class threshold. Agricultural burn is always flagged.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Caveat flag</strong> — verbatim backend text (mining support warning, review threshold text).</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Thermal Regime</strong> — Persistent / New Anomaly / Intermittent, derived from 7/30/90-day FIRMS activity.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>SHAP Explanation</strong> — top-3 feature drivers for the classification. Fetched on demand.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Thermal Timeline</strong> — daily/monthly/yearly FIRMS thermal history for the H3 cell. Switch granularity with the tabs.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>OSM/WRI Context</strong> — present-day land-use context from OpenStreetMap and WRI power plant data. Not historical.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Class Distribution</strong> — probability bars for all four classes.</li>
            </ul>
            <div style={infoBoxStyle}>
              "Historical OSM/WRI land-use evidence unavailable; showing present-day context only." — this is by design, not an error. OSM and WRI are present-day snapshots, not multi-year land-use databases.
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 2.5rem' }} />

          {/* 5. Alerts */}
          <section id="alerts" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>Fire Alerts & Archive</h2>
            <p style={bodyStyle}>The <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Fire Alerts page</strong> (/fire-alerts) is the analyst review queue for predictions flagged with <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.8em' }}>needs_review=true</code>.</p>
            <ul style={{ ...bodyStyle, paddingLeft: '1.25rem', marginTop: '0.6rem' }}>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Filter</strong> by class, date, thermal regime, or review status.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Review actions:</strong> Acknowledge → Confirm / Dismiss → Reopen. All actions append to an audit trail.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Raw evidence</strong> — expandable panel shows the original FIRMS pixel data.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>CSV export</strong> — download filtered results for offline analysis.</li>
            </ul>
            <p style={{ ...bodyStyle, marginTop: '0.75rem' }}>
              The <strong style={{ color: 'var(--text-primary, #eceff4)' }}>Archive page</strong> (/archive) shows all historical predictions with provenance labels, date range filtering, and the same review actions.
            </p>
            <div style={warnBoxStyle}>
              Agricultural burn predictions always appear in the alerts queue because their review threshold is set above 1.0. This is intentional — it does not indicate a model failure.
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 2.5rem' }} />

          {/* 6. Limitations */}
          <section id="limitations" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>Known Limitations</h2>
            <ul style={{ ...bodyStyle, paddingLeft: '1.25rem' }}>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Agricultural burn always in review:</strong> confidence threshold is set above 1.0 by design — every agricultural burn prediction is flagged. This is a model-honesty feature.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Mining: thin labeled support.</strong> Mining results must always be read cautiously — the verbatim caveat is always displayed.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>H3 Resolution 8 cell size</strong> is ~0.74 km². Single-pixel VIIRS fires and large industrial complexes may map to the same cell.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>OSM/WRI context is present-day only.</strong> There is no multi-year land-use history. Historical land-use analysis is not supported.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Server cap: 2,500 rows per request.</strong> Dense days across all of India may not return every cell in one pass.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>10-state training geography.</strong> The model was validated on 10 states. Detections in the other 26 states/UTs are served with an <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.8em' }}>outside_training_geography</code> analyst review flag.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>PMTiles basemap:</strong> The <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.8em' }}>india.pmtiles</code> vector basemap requires a local ~1.7 GB OSM extract + Java build step. Without it, the map uses the included Blue Marble raster fallback.</li>
              <li><strong style={{ color: 'var(--text-primary, #eceff4)' }}>Confidence saturation:</strong> isotonic calibration causes most confidences to be near 0 or 1 — this is expected behavior for a well-calibrated binary-style classifier.</li>
            </ul>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 2.5rem' }} />

          {/* 7. Quick Reference */}
          <section id="quickref" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>Quick Reference</h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '1rem 1.1rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary, #eceff4)', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>API Endpoints</div>
                {[
                  ['GET /api/v1/health', 'Service status & ingestion provenance'],
                  ['GET /api/v1/predictions', 'Viewport predictions (bbox + date)'],
                  ['GET /api/v1/predictions/{id}', 'Single cell detail'],
                  ['GET /api/v1/predictions/{id}/explain', 'SHAP explanation'],
                  ['GET /api/v1/cells/{id}/timeline', 'H3 thermal history'],
                ].map(([ep, desc]) => (
                  <div key={ep} style={{ marginBottom: '0.5rem' }}>
                    <code style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '1px 5px', fontSize: '0.72rem', color: '#7ee787', display: 'block', marginBottom: 2 }}>{ep}</code>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>{desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '1rem 1.1rem', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary, #eceff4)', marginBottom: '0.6rem', letterSpacing: '0.05em' }}>Pages & Routes</div>
                {[
                  ['/', 'Splash screen'],
                  ['/home', 'Landing page (live ticker, category cards)'],
                  ['/fire-map', 'Live map (MapLibre + H3HexagonLayer)'],
                  ['/fire-alerts', 'Alert review queue'],
                  ['/archive', 'Historical predictions & export'],
                  ['/announcements', 'Live system events & editorial'],
                  ['/tutorial', 'This page'],
                ].map(([route, desc]) => (
                  <div key={route} style={{ marginBottom: '0.45rem', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <code style={{ background: 'rgba(0,0,0,0.3)', borderRadius: 4, padding: '1px 5px', fontSize: '0.72rem', color: '#3D9DE8', flexShrink: 0 }}>{route}</code>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted, #8b949e)' }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '1rem 1.1rem', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-primary, #eceff4)', marginBottom: '0.7rem' }}>Review Thresholds</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6rem' }}>
                {[['Wildfire', '0.70', '#E74C3C'], ['Industrial', '0.70', '#E67E22'], ['Mining', '0.85', '#95A5A6'], ['Agricultural Burn', '> 1.0 (always)', '#F1C40F']].map(([cls, thr, color]) => (
                  <div key={cls} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.3)', borderRadius: 6, padding: '0.4rem 0.7rem' }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #8b949e)' }}>{cls}</span>
                    <code style={{ fontSize: '0.75rem', color: '#7ee787' }}>{thr}</code>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', margin: '0 0 2.5rem' }} />

          {/* 8. Docs */}
          <section id="docs" className="tut-section" style={sectionStyle}>
            <h2 style={h2Style}>Documentation</h2>
            <p style={{ ...bodyStyle, marginBottom: '1rem' }}>Full project documentation from the <code style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, padding: '1px 5px', fontSize: '0.8em' }}>docs/</code> directory. Click any section to expand.</p>
            {DOCS.map((doc) => <DocAccordion key={doc.id} doc={doc} />)}
          </section>
        </main>
      </div>
    </div>
  );
}
