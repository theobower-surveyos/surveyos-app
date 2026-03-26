/**
 * LiveView.jsx — CAD Tech Portal
 * SurveyOS Phase 4, Track D
 *
 * Purpose: Real-time visualization of monument captures streaming from Party Chiefs
 * in the field. CAD Techs use this to monitor incoming data, flag QA issues, and
 * begin drafting deliverables as field work progresses.
 *
 * Role: cad_tech
 * Imports: ../data/constants.js
 * Styling: 100% inline (SurveyOS mandate)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  COLORS,
  MOCK_PROJECTS,
  MOCK_MONUMENTS,
  MOCK_CREW,
  STATUS_SEQUENCE,
} from '../data/constants';

// ─── Palette ───────────────────────────────────────────────
const C = {
  navy:   COLORS?.navy   || '#0F1B2D',
  gold:   COLORS?.gold   || '#C9963B',
  green:  COLORS?.green  || '#059669',
  blue:   COLORS?.blue   || '#2563EB',
  gray:   COLORS?.gray   || '#64748B',
  lgray:  COLORS?.lgray  || '#F8FAFC',
  mgray:  COLORS?.mgray  || '#E2E8F0',
  red:    '#DC2626',
  navyL:  '#1A2A42',
  navyLL: '#243550',
};

// ─── Simulated Live Monument Feed ──────────────────────────
const MONUMENT_TYPES = ['IP', 'RM', 'CM', 'NF', 'SET', 'RESET'];
const QA_FLAGS = ['none', 'none', 'none', 'poor_precision', 'duplicate', 'low_satellite'];

function generateMockCapture(id) {
  const type = MONUMENT_TYPES[Math.floor(Math.random() * MONUMENT_TYPES.length)];
  const qaFlag = QA_FLAGS[Math.floor(Math.random() * QA_FLAGS.length)];
  const lat = 33.4484 + (Math.random() - 0.5) * 0.05;
  const lng = -112.074 + (Math.random() - 0.5) * 0.05;
  return {
    id: `MON-${String(id).padStart(4, '0')}`,
    type,
    lat: lat.toFixed(6),
    lng: lng.toFixed(6),
    elevation: (1200 + Math.random() * 300).toFixed(2),
    hdop: (0.5 + Math.random() * 2.5).toFixed(2),
    crew: MOCK_CREW?.[Math.floor(Math.random() * (MOCK_CREW?.length || 1))]?.name || 'Crew Alpha',
    project: MOCK_PROJECTS?.[Math.floor(Math.random() * (MOCK_PROJECTS?.length || 1))]?.name || 'Desert Ridge ALTA',
    timestamp: new Date().toISOString(),
    qaFlag,
    synced: Math.random() > 0.15,
  };
}

// ─── Sub-components ────────────────────────────────────────

function PulsingDot({ color = C.green, size = 10 }) {
  const [opacity, setOpacity] = useState(1);
  useEffect(() => {
    const id = setInterval(() => setOpacity(o => (o === 1 ? 0.3 : 1)), 800);
    return () => clearInterval(id);
  }, []);
  return (
    <span style={{
      display: 'inline-block', width: size, height: size,
      borderRadius: '50%', background: color,
      opacity, transition: 'opacity 0.4s ease',
      boxShadow: `0 0 ${size}px ${color}55`,
    }} />
  );
}

function QABadge({ flag }) {
  if (flag === 'none') return null;
  const labels = {
    poor_precision: 'LOW PREC',
    duplicate: 'DUPLICATE',
    low_satellite: 'LOW SATS',
  };
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 700,
      letterSpacing: 0.8, padding: '2px 8px', borderRadius: 3,
      background: `${C.red}22`, color: C.red, marginLeft: 8,
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    }}>
      ⚠ {labels[flag] || flag.toUpperCase()}
    </span>
  );
}

function MonumentTypeBadge({ type }) {
  const colorMap = { IP: C.gold, RM: C.blue, CM: C.green, NF: C.gray, SET: '#8B5CF6', RESET: '#F59E0B' };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 38, height: 22, borderRadius: 4, fontSize: 10, fontWeight: 800,
      letterSpacing: 1, color: '#fff',
      background: colorMap[type] || C.gray,
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    }}>
      {type}
    </span>
  );
}

function StatCard({ label, value, accent = C.gold, sub }) {
  return (
    <div style={{
      background: C.navyL, borderRadius: 10, padding: '16px 20px',
      minWidth: 140, flex: '1 1 140px', border: `1px solid ${C.navyLL}`,
    }}>
      <div style={{ fontSize: 11, color: C.gray, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: accent, lineHeight: 1, fontFamily: "'JetBrains Mono', monospace" }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function MiniMap({ captures }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = C.navy;
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    ctx.strokeStyle = `${C.navyLL}`;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < w; i += 30) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
    }
    for (let j = 0; j < h; j += 30) {
      ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke();
    }

    // Plot monuments
    if (captures.length === 0) return;
    const lats = captures.map(c => parseFloat(c.lat));
    const lngs = captures.map(c => parseFloat(c.lng));
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const pad = 20;

    captures.forEach((cap, i) => {
      const x = lngs.length > 1
        ? pad + ((parseFloat(cap.lng) - minLng) / (maxLng - minLng || 1)) * (w - pad * 2)
        : w / 2;
      const y = lats.length > 1
        ? h - pad - ((parseFloat(cap.lat) - minLat) / (maxLat - minLat || 1)) * (h - pad * 2)
        : h / 2;

      const isRecent = i >= captures.length - 3;
      const hasFlag = cap.qaFlag !== 'none';

      // Glow for recent
      if (isRecent) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fillStyle = hasFlag ? `${C.red}33` : `${C.gold}33`;
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(x, y, hasFlag ? 5 : 4, 0, Math.PI * 2);
      ctx.fillStyle = hasFlag ? C.red : (isRecent ? C.gold : C.green);
      ctx.fill();
    });
  }, [captures]);

  return (
    <canvas
      ref={canvasRef}
      width={400}
      height={280}
      style={{ width: '100%', height: 280, borderRadius: 8, border: `1px solid ${C.navyLL}` }}
    />
  );
}

// ─── Main View ─────────────────────────────────────────────

export default function LiveView() {
  const [captures, setCaptures] = useState([]);
  const [selectedCapture, setSelectedCapture] = useState(null);
  const [isStreaming, setIsStreaming] = useState(true);
  const [filter, setFilter] = useState('all'); // all | flagged | recent
  const feedRef = useRef(null);
  const counterRef = useRef(1);

  // Simulate incoming monument stream
  useEffect(() => {
    if (!isStreaming) return;
    const interval = setInterval(() => {
      const newCapture = generateMockCapture(counterRef.current++);
      setCaptures(prev => [newCapture, ...prev].slice(0, 200));
    }, 2200 + Math.random() * 2000);
    return () => clearInterval(interval);
  }, [isStreaming]);

  const flaggedCount = captures.filter(c => c.qaFlag !== 'none').length;
  const uniqueProjects = [...new Set(captures.map(c => c.project))].length;

  const filteredCaptures = captures.filter(c => {
    if (filter === 'flagged') return c.qaFlag !== 'none';
    if (filter === 'recent') return captures.indexOf(c) < 10;
    return true;
  });

  const handleFlag = useCallback((captureId) => {
    setCaptures(prev => prev.map(c =>
      c.id === captureId
        ? { ...c, qaFlag: c.qaFlag === 'none' ? 'poor_precision' : 'none' }
        : c
    ));
  }, []);

  // ── Styles ──
  const pageStyle = {
    minHeight: '100vh', background: C.navy, color: '#fff',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    padding: '0 0 40px 0',
  };

  const headerStyle = {
    padding: '24px 32px 20px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', borderBottom: `1px solid ${C.navyLL}`,
  };

  const gridStyle = {
    display: 'grid', gridTemplateColumns: '1fr 400px',
    gap: 24, padding: '24px 32px', maxWidth: 1440, margin: '0 auto',
  };

  const filterBtnStyle = (active) => ({
    padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
    cursor: 'pointer', border: 'none',
    background: active ? C.gold : C.navyL,
    color: active ? C.navy : C.gray,
    transition: 'all 0.15s ease',
    letterSpacing: 0.5,
  });

  const feedItemStyle = (isSelected, hasFlag) => ({
    display: 'grid', gridTemplateColumns: '42px 1fr auto',
    gap: 12, alignItems: 'center',
    padding: '12px 16px', borderRadius: 8, cursor: 'pointer',
    background: isSelected ? C.navyLL : 'transparent',
    borderLeft: hasFlag ? `3px solid ${C.red}` : '3px solid transparent',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={pageStyle}>
      {/* ── Header ── */}
      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>
            <span style={{ color: C.gold }}>◉</span> Live View
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '4px 14px', borderRadius: 20,
            background: isStreaming ? `${C.green}18` : `${C.red}18`,
            border: `1px solid ${isStreaming ? C.green : C.red}33`,
          }}>
            <PulsingDot color={isStreaming ? C.green : C.red} size={8} />
            <span style={{ fontSize: 12, fontWeight: 600, color: isStreaming ? C.green : C.red }}>
              {isStreaming ? 'STREAMING' : 'PAUSED'}
            </span>
          </div>
        </div>

        <button
          onClick={() => setIsStreaming(s => !s)}
          style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: isStreaming ? `${C.red}22` : `${C.green}22`,
            color: isStreaming ? C.red : C.green,
            fontWeight: 700, fontSize: 13, letterSpacing: 0.5,
            transition: 'all 0.15s ease',
          }}
        >
          {isStreaming ? '⏸ Pause Stream' : '▶ Resume Stream'}
        </button>
      </div>

      {/* ── Stats Row ── */}
      <div style={{ display: 'flex', gap: 16, padding: '20px 32px', flexWrap: 'wrap' }}>
        <StatCard label="Captured" value={captures.length} accent={C.gold} sub="total monuments" />
        <StatCard label="QA Flags" value={flaggedCount} accent={flaggedCount > 0 ? C.red : C.green} sub={flaggedCount > 0 ? 'need review' : 'all clear'} />
        <StatCard label="Active Projects" value={uniqueProjects} accent={C.blue} />
        <StatCard label="Sync Rate" value={`${captures.length > 0 ? Math.round(captures.filter(c => c.synced).length / captures.length * 100) : 100}%`} accent={C.green} sub="cloud synced" />
      </div>

      {/* ── Main Grid ── */}
      <div style={gridStyle}>
        {/* Left: Monument Feed */}
        <div>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            {['all', 'flagged', 'recent'].map(f => (
              <button key={f} onClick={() => setFilter(f)} style={filterBtnStyle(filter === f)}>
                {f === 'all' ? `All (${captures.length})` : f === 'flagged' ? `Flagged (${flaggedCount})` : 'Recent 10'}
              </button>
            ))}
          </div>

          {/* Feed List */}
          <div ref={feedRef} style={{
            maxHeight: 540, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2,
            paddingRight: 8,
          }}>
            {filteredCaptures.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: C.gray, fontSize: 14 }}>
                {filter === 'flagged' ? '✓ No QA flags — all clear' : 'Waiting for captures...'}
              </div>
            )}
            {filteredCaptures.map(cap => (
              <div
                key={cap.id}
                onClick={() => setSelectedCapture(cap)}
                style={feedItemStyle(selectedCapture?.id === cap.id, cap.qaFlag !== 'none')}
              >
                <MonumentTypeBadge type={cap.type} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#fff' }}>{cap.id}</span>
                    <QABadge flag={cap.qaFlag} />
                  </div>
                  <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                    {cap.project} · {cap.crew}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.gray, fontFamily: "'JetBrains Mono', monospace" }}>
                    {new Date(cap.timestamp).toLocaleTimeString()}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 2 }}>
                    {cap.synced
                      ? <span style={{ color: C.green }}>● synced</span>
                      : <span style={{ color: C.gold }}>○ pending</span>
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Map + Detail Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 8, textTransform: 'uppercase' }}>
              Spatial Plot
            </div>
            <MiniMap captures={captures.slice(0, 80)} />
          </div>

          {/* Selected Detail */}
          <div style={{
            background: C.navyL, borderRadius: 10, padding: 20,
            border: `1px solid ${C.navyLL}`, flex: 1,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.gray, letterSpacing: 1, marginBottom: 12, textTransform: 'uppercase' }}>
              Monument Detail
            </div>
            {selectedCapture ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <MonumentTypeBadge type={selectedCapture.type} />
                  <span style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace" }}>
                    {selectedCapture.id}
                  </span>
                  <QABadge flag={selectedCapture.qaFlag} />
                </div>

                {[
                  ['Latitude', selectedCapture.lat],
                  ['Longitude', selectedCapture.lng],
                  ['Elevation', `${selectedCapture.elevation} ft`],
                  ['HDOP', selectedCapture.hdop],
                  ['Crew', selectedCapture.crew],
                  ['Project', selectedCapture.project],
                ].map(([label, val]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.navyLL}` }}>
                    <span style={{ fontSize: 12, color: C.gray }}>{label}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                  </div>
                ))}

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    onClick={() => handleFlag(selectedCapture.id)}
                    style={{
                      flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontWeight: 700, fontSize: 12,
                      background: selectedCapture.qaFlag !== 'none' ? `${C.green}22` : `${C.red}22`,
                      color: selectedCapture.qaFlag !== 'none' ? C.green : C.red,
                      letterSpacing: 0.5,
                    }}
                  >
                    {selectedCapture.qaFlag !== 'none' ? '✓ Clear Flag' : '⚠ Flag for QA'}
                  </button>
                  <button style={{
                    flex: 1, padding: '10px 0', borderRadius: 8, border: 'none',
                    cursor: 'pointer', fontWeight: 700, fontSize: 12,
                    background: `${C.blue}22`, color: C.blue, letterSpacing: 0.5,
                  }}>
                    Open in CAD
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ color: C.gray, fontSize: 13, padding: '20px 0', textAlign: 'center' }}>
                Select a monument from the feed
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}