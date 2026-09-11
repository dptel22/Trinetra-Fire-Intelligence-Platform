import React from 'react';
import { CLASS_COLORS, KNOWN_CAVEATS } from '../services/api';

/**
 * DataReliabilityBlock component
 * High-clarity, data-analyst grade model reliability & review threshold matrix.
 * Transparently presents calibrated confidence cutoffs, ground-truth support,
 * and operational caveats adhering strictly to the NTRO PS26162 taxonomy contract.
 *
 * Props:
 * - reviewThresholds: Record<string, number> | null
 */
export default function DataReliabilityBlock({ reviewThresholds = null }) {
  const getThresholdDisplay = (cls, defaultVal) => {
    const val = reviewThresholds?.[cls] ?? defaultVal;
    return `${(val * 100).toFixed(0)}%`;
  };

  const cards = [
    {
      id: 'industrial',
      name: 'Industrial Facility',
      color: CLASS_COLORS.industrial,
      threshold: `< ${getThresholdDisplay('industrial', 0.70)} Review`,
      statusType: 'calibrated',
      support: 'High Ground Truth',
      source: 'OSM / WRI Overlays',
      guidance: 'Mapped facility overlays provide verified ground truth. Hotspots below 70% confidence require manual analyst review.'
    },
    {
      id: 'wildfire',
      name: 'Wildfire',
      color: CLASS_COLORS.wildfire,
      threshold: `< ${getThresholdDisplay('wildfire', 0.70)} Review`,
      statusType: 'calibrated',
      support: 'Strong Evidence',
      source: 'FRP + Thermal Signatures',
      guidance: 'Distinct spectral and open-land fire signature. Hotspots below 70% confidence require manual analyst review.'
    },
    {
      id: 'mining',
      name: 'Mining / Smelter',
      color: CLASS_COLORS.mining,
      threshold: `< ${getThresholdDisplay('mining', 0.85)} Review`,
      statusType: 'caution',
      support: 'Lower Labeled Support',
      source: 'Cautious Interpretation',
      guidance: `${KNOWN_CAVEATS.mining} Calibrated analyst-review threshold is set at a strict 85% confidence bar.`
    },
    {
      id: 'agricultural_burn',
      name: 'Agricultural Burn',
      color: CLASS_COLORS.agricultural_burn,
      threshold: '100% Review (Mandatory)',
      statusType: 'warning',
      support: 'Provisional Rule',
      source: 'Active Refinement',
      guidance: 'All predictions require human analyst review while distance-based contextual rules remain under active refinement.'
    },
    {
      id: 'unclassified',
      name: 'Unclassified Fallback',
      color: CLASS_COLORS.unclassified,
      threshold: 'Abstention Fallback',
      statusType: 'neutral',
      support: 'Safety Safeguard',
      source: 'Operational Defense',
      guidance: 'Low-confidence thermal anomalies that do not meet verification criteria abstain to prevent false-alarm operational alerts.'
    }
  ];

  return (
    <div className="reliability-matrix-container">
      {/* ── Section Header ── */}
      <div className="reliability-header">
        <div className="reliability-title-group">
          <span className="reliability-badge-dot" />
          <span className="reliability-title">Model Reliability &amp; Review Thresholds</span>
        </div>
        <span className="reliability-version-tag">NTRO-PS26162</span>
      </div>

      <p className="reliability-subtitle">
        Operational review triggers and ground-truth evidence levels per classification:
      </p>

      {/* ── Cards Grid ── */}
      <div className="reliability-cards-list">
        {cards.map((c) => (
          <div
            key={c.id}
            className={`reliability-card reliability-card-${c.statusType}`}
            style={{ borderLeftColor: c.color }}
          >
            {/* Header: Class Name + Threshold Tag */}
            <div className="reliability-card-header">
              <div className="reliability-card-title-row">
                <span className="reliability-class-dot" style={{ backgroundColor: c.color }} />
                <span className="reliability-class-name">{c.name}</span>
              </div>
              <span className={`reliability-threshold-pill pill-${c.statusType}`}>
                {c.threshold}
              </span>
            </div>

            {/* Evidence & Provenance Bar */}
            <div className="reliability-evidence-row">
              <span className="reliability-evidence-tag">
                <span className="evidence-key">Evidence:</span> {c.support}
              </span>
              <span className="reliability-source-tag">{c.source}</span>
            </div>

            {/* Operational Guidance */}
            <div className="reliability-guidance">
              {c.guidance}
            </div>
          </div>
        ))}
      </div>

      {/* ── Governance Footnote ── */}
      <div className="reliability-footnote">
        <span>Protocol:</span> H3 Res-8 · Calibrated Probability Distribution · Zero Silent Abstention
      </div>
    </div>
  );
}
