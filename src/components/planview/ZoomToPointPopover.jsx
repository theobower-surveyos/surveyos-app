import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Locate } from 'lucide-react';

// ─── ZoomToPointPopover ───────────────────────────────────────────────
// Portal-rendered autocomplete + distance-preset panel. Anchored to the
// toolbar button via a screen-space rect. Smart-flips above/left if it
// would overflow the viewport — same pattern as PointTolerancePopover.
//
// Props.points is the full point list; searches by point_id and by
// feature_code (startsWith, case-insensitive), returning up to 10 rows.

const POP_WIDTH = 340;
const POP_GAP = 6;
const ESTIMATED_H = 430;

const DISTANCE_PRESETS = [5, 15, 50, 100];

export default function ZoomToPointPopover({
    visible,
    anchorRect,
    points,
    onClose,
    onZoom,
}) {
    const cardRef = useRef(null);
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [highlightIdx, setHighlightIdx] = useState(0);
    const [selected, setSelected] = useState(null);
    const [distance, setDistance] = useState(15);
    const [customDistance, setCustomDistance] = useState('');
    const [customActive, setCustomActive] = useState(false);
    const [pos, setPos] = useState({ left: 0, top: 0 });

    // Search results
    const matches = useMemo(() => {
        const q = query.trim().toUpperCase();
        if (!q) return (points || []).slice(0, 10);
        const out = [];
        for (const p of (points || [])) {
            const pid = (p.point_id || '').toUpperCase();
            const code = (p.feature_code || '').toUpperCase();
            if (pid.startsWith(q) || code.startsWith(q)) {
                out.push(p);
                if (out.length >= 10) break;
            }
        }
        return out;
    }, [points, query]);

    // Initial position + smart flip
    useLayoutEffect(() => {
        if (!visible || !anchorRect) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 16;

        // Anchor horizontally: if the button is in the right half of the
        // viewport, align the popover's right edge to the button's right
        // edge (drops down-left from the button). Otherwise, align its
        // left edge to the button's left edge (drops down-right).
        const buttonMidX = (anchorRect.left + anchorRect.right) / 2;
        let left;
        if (buttonMidX > vw / 2) {
            left = anchorRect.right - POP_WIDTH;
        } else {
            left = anchorRect.left;
        }
        // Clamp to viewport
        left = Math.min(Math.max(margin, left), vw - POP_WIDTH - margin);

        // Vertical: prefer below, flip above if not enough room
        const spaceBelow = vh - anchorRect.bottom;
        const spaceAbove = anchorRect.top;
        const fitsBelow = spaceBelow >= ESTIMATED_H + POP_GAP + margin;
        const top = fitsBelow || spaceBelow >= spaceAbove
            ? anchorRect.bottom + POP_GAP
            : Math.max(margin, anchorRect.top - ESTIMATED_H - POP_GAP);
        setPos({ left, top });
    }, [visible, anchorRect]);

    // Focus the search input on open; reset state on close
    useEffect(() => {
        if (visible && inputRef.current) {
            inputRef.current.focus();
        }
        if (!visible) {
            setQuery('');
            setSelected(null);
            setHighlightIdx(0);
            setCustomActive(false);
            setCustomDistance('');
        }
    }, [visible]);

    // Escape / outside-click
    useEffect(() => {
        if (!visible) return;
        function onKey(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        }
        function onMouseDown(e) {
            if (cardRef.current && !cardRef.current.contains(e.target)) {
                onClose();
            }
        }
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('mousedown', onMouseDown);
        };
    }, [visible, onClose]);

    function onInputKey(e) {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIdx((i) => Math.min(matches.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIdx((i) => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const target = matches[highlightIdx];
            if (target) {
                setSelected(target);
            }
        }
    }

    function selectRow(p) {
        setSelected(p);
    }

    function effectiveDistance() {
        if (customActive) {
            const n = Number(customDistance);
            return Number.isFinite(n) && n > 0 ? n : null;
        }
        return distance;
    }

    function handleZoom() {
        if (!selected) return;
        const d = effectiveDistance();
        if (d == null) return;
        onZoom(selected, d);
        onClose();
    }

    if (!visible) return null;

    return createPortal(
        <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label="Zoom to point"
            style={{
                position: 'fixed',
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                width: `${POP_WIDTH}px`,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
                zIndex: 10002,
                padding: '14px 16px',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
            }}
        >
            <style>{`
                .ztp-input {
                    width: 100%;
                    box-sizing: border-box;
                    background: var(--bg-dark);
                    color: var(--text-main);
                    border: 1px solid var(--border-subtle);
                    border-radius: 6px;
                    padding: 8px 10px;
                    font-size: 13px;
                    font-family: inherit;
                    transition: border-color 0.15s ease;
                }
                .ztp-input:focus {
                    outline: none;
                    border-color: var(--brand-teal-light);
                }
                .ztp-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 6px 10px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                }
                .ztp-row:hover { background: rgba(255,255,255,0.04); }
                .ztp-row.active {
                    background: rgba(13, 79, 79, 0.35);
                    color: var(--text-main);
                }
                .ztp-pid {
                    color: var(--brand-amber);
                    font-weight: 700;
                    font-family: 'JetBrains Mono', monospace;
                }
                .ztp-code {
                    color: var(--text-muted);
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 11px;
                }
                .ztp-preset {
                    padding: 6px 10px;
                    border-radius: 6px;
                    border: 1px solid var(--border-subtle);
                    background: var(--bg-dark);
                    color: var(--text-main);
                    cursor: pointer;
                    font-family: 'JetBrains Mono', monospace;
                    font-size: 12px;
                    transition: all 0.12s ease;
                }
                .ztp-preset:hover {
                    border-color: var(--brand-teal-light);
                    color: var(--brand-teal-light);
                }
                .ztp-preset.active {
                    background: var(--brand-teal);
                    border-color: var(--brand-teal);
                    color: #fff;
                }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                    <Locate size={14} color="var(--brand-teal-light)" /> Zoom to point
                </h4>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'inline-flex',
                        alignItems: 'center',
                    }}
                >
                    <X size={14} />
                </button>
            </div>

            <input
                ref={inputRef}
                type="text"
                className="ztp-input"
                placeholder="Point ID or feature code"
                value={query}
                onChange={(e) => {
                    setQuery(e.target.value);
                    setHighlightIdx(0);
                    setSelected(null);
                }}
                onKeyDown={onInputKey}
            />

            <div
                style={{
                    marginTop: '10px',
                    maxHeight: '170px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '6px',
                    background: 'var(--bg-dark)',
                }}
            >
                {matches.length === 0 ? (
                    <div style={{ padding: '14px', color: 'var(--text-muted)', fontSize: '12.5px', textAlign: 'center' }}>
                        No matches.
                    </div>
                ) : (
                    matches.map((p, i) => (
                        <div
                            key={p.id}
                            className={`ztp-row ${selected?.id === p.id ? 'active' : i === highlightIdx ? 'active' : ''}`}
                            onMouseEnter={() => setHighlightIdx(i)}
                            onClick={() => selectRow(p)}
                        >
                            <span className="ztp-pid">{p.point_id || '—'}</span>
                            <span className="ztp-code">{p.feature_code || ''}</span>
                        </div>
                    ))
                )}
            </div>

            {selected && (
                <div
                    style={{
                        marginTop: '12px',
                        padding: '10px 12px',
                        background: 'var(--bg-dark)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '6px',
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: '11.5px',
                        color: 'var(--text-main)',
                    }}
                >
                    <div style={{ color: 'var(--brand-amber)', fontWeight: 700, fontSize: '13px' }}>
                        {selected.point_id}
                    </div>
                    {selected.feature_code && (
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px', marginBottom: '4px' }}>
                            {selected.feature_code}
                        </div>
                    )}
                    <div>N {Number(selected.northing).toFixed(3)}</div>
                    <div>E {Number(selected.easting).toFixed(3)}</div>
                    {selected.elevation != null && (
                        <div>Z {Number(selected.elevation).toFixed(3)}</div>
                    )}
                </div>
            )}

            <div style={{ marginTop: '12px' }}>
                <div
                    style={{
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        letterSpacing: '0.5px',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        marginBottom: '6px',
                    }}
                >
                    Zoom distance
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {DISTANCE_PRESETS.map((d) => (
                        <button
                            key={d}
                            type="button"
                            className={`ztp-preset ${!customActive && distance === d ? 'active' : ''}`}
                            onClick={() => { setDistance(d); setCustomActive(false); }}
                        >
                            {d} ft
                        </button>
                    ))}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span
                            onClick={() => setCustomActive(true)}
                            style={{
                                color: customActive ? 'var(--brand-teal-light)' : 'var(--text-muted)',
                                fontSize: '11.5px',
                                cursor: 'pointer',
                            }}
                        >
                            Custom:
                        </span>
                        <input
                            type="number"
                            min="1"
                            step="1"
                            value={customDistance}
                            onChange={(e) => { setCustomDistance(e.target.value); setCustomActive(true); }}
                            placeholder="ft"
                            style={{
                                width: '64px',
                                background: 'var(--bg-dark)',
                                border: `1px solid ${customActive ? 'var(--brand-teal-light)' : 'var(--border-subtle)'}`,
                                color: 'var(--text-main)',
                                borderRadius: '6px',
                                padding: '5px 8px',
                                fontSize: '12px',
                                fontFamily: "'JetBrains Mono', monospace",
                            }}
                        />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' }}>
                <button
                    type="button"
                    onClick={onClose}
                    style={{
                        background: 'transparent',
                        border: '1px solid var(--border-subtle)',
                        color: 'var(--text-main)',
                        padding: '7px 14px',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: '12.5px',
                    }}
                >
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={handleZoom}
                    disabled={!selected || effectiveDistance() == null}
                    style={{
                        background: 'var(--brand-teal)',
                        border: '1px solid var(--brand-teal)',
                        color: '#fff',
                        padding: '7px 14px',
                        borderRadius: '6px',
                        cursor: !selected || effectiveDistance() == null ? 'not-allowed' : 'pointer',
                        opacity: !selected || effectiveDistance() == null ? 0.5 : 1,
                        fontFamily: 'inherit',
                        fontSize: '12.5px',
                        fontWeight: 600,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                    }}
                >
                    <Locate size={13} /> Zoom
                </button>
            </div>
        </div>,
        document.body,
    );
}
