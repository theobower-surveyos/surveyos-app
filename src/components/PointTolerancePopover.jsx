import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, RotateCcw } from 'lucide-react';

// ─── PointTolerancePopover ────────────────────────────────────────────
// Floating panel that lets a PM set per-point H / V tolerance overrides
// on a single stakeout_assignment_points row. Anchored to the table cell
// that opened it. Renders via portal so the overflow:auto on the table
// can't clip it. Smart-flips above the anchor when there isn't enough
// space below.

const POPOVER_WIDTH = 280;
const POPOVER_GAP = 6;
const ESTIMATED_HEIGHT = 280;

export default function PointTolerancePopover({
    supabase,
    assignmentPointId,
    pointId,
    currentOverrideH,
    currentOverrideV,
    defaultH,
    defaultV,
    anchorRect,
    onSaved,
    onCancelled,
    onToast,
}) {
    const cardRef = useRef(null);
    const firstInputRef = useRef(null);
    const [overrideH, setOverrideH] = useState(
        currentOverrideH != null ? String(currentOverrideH) : '',
    );
    const [overrideV, setOverrideV] = useState(
        currentOverrideV != null ? String(currentOverrideV) : '',
    );
    const [busy, setBusy] = useState(false);
    const [pos, setPos] = useState({ left: 0, top: 0, placement: 'below' });

    const hasExisting = currentOverrideH != null || currentOverrideV != null;

    // Compute initial position before paint to avoid a visible jump.
    useLayoutEffect(() => {
        if (!anchorRect) return;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 8;
        let left = Math.min(
            Math.max(margin, anchorRect.left),
            vw - POPOVER_WIDTH - margin,
        );
        const spaceBelow = vh - anchorRect.bottom;
        const spaceAbove = anchorRect.top;
        const fitsBelow = spaceBelow >= ESTIMATED_HEIGHT + POPOVER_GAP + margin;
        const placement = fitsBelow || spaceBelow >= spaceAbove ? 'below' : 'above';
        const top = placement === 'below'
            ? anchorRect.bottom + POPOVER_GAP
            : Math.max(margin, anchorRect.top - ESTIMATED_HEIGHT - POPOVER_GAP);
        setPos({ left, top, placement });
    }, [anchorRect]);

    // Initial focus + Escape / outside-click / Enter handling.
    useEffect(() => {
        if (firstInputRef.current) firstInputRef.current.focus();
        function onKey(e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCancelled();
            } else if (e.key === 'Enter' && !e.isComposing && cardRef.current?.contains(e.target)) {
                if (e.target.tagName === 'INPUT') {
                    e.preventDefault();
                    apply();
                }
            }
        }
        function onMouseDown(e) {
            if (cardRef.current && !cardRef.current.contains(e.target)) {
                onCancelled();
            }
        }
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('mousedown', onMouseDown);
        return () => {
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('mousedown', onMouseDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function parseTol(value) {
        if (value === '' || value == null) return null;
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0 || n >= 1) return undefined; // invalid
        return n;
    }

    async function apply() {
        if (busy) return;
        const h = parseTol(overrideH);
        const v = parseTol(overrideV);
        if (h === undefined) {
            onToast('error', 'Override H must be a positive number under 1.');
            return;
        }
        if (v === undefined) {
            onToast('error', 'Override V must be a positive number under 1.');
            return;
        }
        setBusy(true);
        try {
            const { data, error } = await supabase
                .from('stakeout_assignment_points')
                .update({
                    override_tolerance_h: h,
                    override_tolerance_v: v,
                })
                .eq('id', assignmentPointId)
                .select('id, override_tolerance_h, override_tolerance_v')
                .single();
            if (error) throw error;
            onToast('success', `Override applied for ${pointId}.`);
            onSaved(data);
        } catch (err) {
            console.error('[PointTolerancePopover] apply failed:', err);
            onToast('error', `Could not save override${err?.code ? ` (code ${err.code})` : ''}.`);
        } finally {
            setBusy(false);
        }
    }

    async function clearOverride() {
        if (busy) return;
        setBusy(true);
        try {
            const { data, error } = await supabase
                .from('stakeout_assignment_points')
                .update({
                    override_tolerance_h: null,
                    override_tolerance_v: null,
                })
                .eq('id', assignmentPointId)
                .select('id, override_tolerance_h, override_tolerance_v')
                .single();
            if (error) throw error;
            onToast('success', `Override cleared for ${pointId}.`);
            onSaved(data);
        } catch (err) {
            console.error('[PointTolerancePopover] clear failed:', err);
            onToast('error', `Could not clear override${err?.code ? ` (code ${err.code})` : ''}.`);
        } finally {
            setBusy(false);
        }
    }

    return createPortal(
        <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Override tolerance for ${pointId}`}
            style={{
                position: 'fixed',
                left: `${pos.left}px`,
                top: `${pos.top}px`,
                width: `${POPOVER_WIDTH}px`,
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '10px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.55)',
                zIndex: 10001,
                padding: '14px 16px',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
            }}
        >
            <style>{`
                .ptp-input {
                    background-color: var(--bg-dark);
                    color: var(--text-main);
                    border: 1px solid var(--border-subtle);
                    border-radius: 6px;
                    padding: 7px 9px;
                    font-size: 13px;
                    font-family: 'JetBrains Mono', monospace;
                    width: 100%;
                    box-sizing: border-box;
                    transition: border-color 0.15s ease;
                }
                .ptp-input:focus {
                    outline: none;
                    border-color: var(--brand-teal-light);
                }
                .ptp-label {
                    display: block;
                    color: var(--text-muted);
                    font-size: 11px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    font-weight: 600;
                    margin-bottom: 5px;
                }
            `}</style>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '4px',
                }}
            >
                <h4
                    style={{
                        margin: 0,
                        fontSize: '13px',
                        fontWeight: 600,
                        color: 'var(--text-main)',
                    }}
                >
                    Override tolerance for{' '}
                    <span style={{ color: 'var(--brand-amber)' }}>{pointId}</span>
                </h4>
                <button
                    type="button"
                    onClick={onCancelled}
                    aria-label="Close"
                    style={closeBtnStyle}
                >
                    <X size={14} />
                </button>
            </div>
            <div
                style={{
                    fontSize: '11.5px',
                    color: 'var(--text-muted)',
                    marginBottom: '14px',
                    fontFamily: "'JetBrains Mono', monospace",
                }}
            >
                Defaults: H {defaultH != null ? Number(defaultH).toFixed(3) : '—'} ·
                V {defaultV != null ? Number(defaultV).toFixed(3) : '—'}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                <div style={{ flex: 1 }}>
                    <label htmlFor="ptp-h" className="ptp-label">
                        Override H
                    </label>
                    <input
                        id="ptp-h"
                        ref={firstInputRef}
                        className="ptp-input"
                        type="number"
                        step="0.001"
                        min="0"
                        value={overrideH}
                        onChange={(e) => setOverrideH(e.target.value)}
                        placeholder="leave blank for default"
                        disabled={busy}
                    />
                </div>
                <div style={{ flex: 1 }}>
                    <label htmlFor="ptp-v" className="ptp-label">
                        Override V
                    </label>
                    <input
                        id="ptp-v"
                        className="ptp-input"
                        type="number"
                        step="0.001"
                        min="0"
                        value={overrideV}
                        onChange={(e) => setOverrideV(e.target.value)}
                        placeholder="leave blank for default"
                        disabled={busy}
                    />
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                }}
            >
                {hasExisting ? (
                    <button
                        type="button"
                        onClick={clearOverride}
                        disabled={busy}
                        style={secondaryBtn(busy)}
                        title="Revert to assignment / firm defaults"
                    >
                        <RotateCcw size={12} /> Clear
                    </button>
                ) : (
                    <span />
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={onCancelled}
                        disabled={busy}
                        style={secondaryBtn(busy)}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={apply}
                        disabled={busy}
                        style={primaryBtn(busy)}
                    >
                        <Check size={12} /> Apply
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}

const closeBtnStyle = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '2px',
    display: 'inline-flex',
    alignItems: 'center',
};

function primaryBtn(disabled) {
    return {
        backgroundColor: 'var(--brand-teal)',
        color: '#fff',
        border: '1px solid var(--brand-teal)',
        padding: '7px 12px',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
        fontSize: '12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: 'inherit',
    };
}

function secondaryBtn(disabled) {
    return {
        backgroundColor: 'transparent',
        color: 'var(--text-main)',
        border: '1px solid var(--border-subtle)',
        padding: '7px 12px',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 500,
        fontSize: '12px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontFamily: 'inherit',
    };
}
