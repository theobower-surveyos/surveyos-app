import React, { useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { REASON_LABELS } from './CrewQcScoreboard.jsx';

// ─── CrewQcPointSheet ─────────────────────────────────────────────────
// Bottom sheet that slides up from the bottom of the viewport. Renders
// full point detail (top), then a status-conditional action footer:
//   • out_of_tol  → "Mark as field-fit" → opens reason picker
//   • field_fit    → reason summary + "Remove field-fit flag"
//   • everything else → no action button (read-only)
//
// Migration 17 (Stage 10.4.5) lets chiefs write h_status='field_fit'
// directly and accepts the SOS reason codes (OB/AC/SA/CF/OT) in
// field_fit_reason, so the prefix-encoded workaround from Stage 10.4
// is no longer needed. Removing a flag re-derives h_status from the
// underlying delta_h vs. effective_tolerance_h so the row reverts to
// either 'in_tol' or 'out_of_tol' as the math demands.

const STATUS_LABELS = {
    in_tol: 'In tolerance',
    out_of_tol: 'Out of tolerance',
    field_fit: 'Field-fit',
    check_pass: 'Check passed',
    check_fail: 'Check failed',
    unmatched: 'Unmatched',
    unmatched_check: 'Unresolved check',
    parse_error: 'Parse error',
    built_on: 'Built on',
    pending: 'Pending',
};

const STATUS_COLORS = {
    in_tol: 'var(--success)',
    out_of_tol: 'var(--error)',
    field_fit: 'var(--brand-amber)',
    check_pass: '#5DCAA5',
    check_fail: 'var(--error)',
    unmatched: 'var(--text-muted)',
    unmatched_check: 'var(--text-muted)',
    parse_error: 'var(--text-muted)',
    built_on: 'rgba(201, 116, 242, 1)',
    pending: 'var(--text-muted)',
};

const REASON_ORDER = ['OB', 'AC', 'SA', 'CF', 'OT'];

const SOS_REASON_SET = new Set(['OB', 'AC', 'SA', 'CF', 'OT']);

export default function CrewQcPointSheet({ point, onClose, onUpdated }) {
    const eff = point.h_status || 'pending';
    const existingCode = SOS_REASON_SET.has(point.field_fit_reason) ? point.field_fit_reason : null;
    const existingNote = point.field_fit_note || '';

    const [view, setView] = useState('detail'); // detail | reason | other_text
    const [otherText, setOtherText] = useState(existingCode === 'OT' ? existingNote : '');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    async function applyFieldFit(code, note) {
        setBusy(true);
        setError(null);
        const { error: updErr } = await supabase
            .from('stakeout_qc_points')
            .update({
                h_status: 'field_fit',
                field_fit_reason: code,
                field_fit_note: note ? note : null,
            })
            .eq('id', point.id);
        setBusy(false);
        if (updErr) {
            setError(`Could not save field-fit flag: ${updErr.message}`);
            return;
        }
        onUpdated?.();
    }

    async function clearFieldFit() {
        setBusy(true);
        setError(null);
        const dh = Number(point.delta_h);
        const tolH = Number(point.effective_tolerance_h);
        const reverted = (Number.isFinite(dh) && Number.isFinite(tolH) && Math.abs(dh) <= tolH)
            ? 'in_tol'
            : 'out_of_tol';
        const { error: updErr } = await supabase
            .from('stakeout_qc_points')
            .update({
                h_status: reverted,
                field_fit_reason: null,
                field_fit_note: null,
            })
            .eq('id', point.id);
        setBusy(false);
        if (updErr) {
            setError(`Could not remove flag: ${updErr.message}`);
            return;
        }
        onUpdated?.();
    }

    function pickReason(code) {
        if (code === 'OT') {
            setView('other_text');
            return;
        }
        applyFieldFit(code, '');
    }

    return (
        <>
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.55)',
                    zIndex: 9990,
                }}
            />
            <div
                role="dialog"
                aria-modal="true"
                style={{
                    position: 'fixed',
                    bottom: 0,
                    left: 0,
                    right: 0,
                    maxHeight: '85vh',
                    background: 'var(--bg-dark)',
                    borderTopLeftRadius: '18px',
                    borderTopRightRadius: '18px',
                    border: '1px solid var(--border-subtle)',
                    color: 'var(--text-main)',
                    boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                    display: 'flex',
                    flexDirection: 'column',
                    zIndex: 9991,
                    paddingBottom: 'env(safe-area-inset-bottom)',
                }}
            >
                <Header point={point} eff={eff} onClose={onClose} />

                <div style={{ overflowY: 'auto', padding: '0 18px 18px' }}>
                    {view === 'detail' && (
                        <DetailView point={point} existingCode={existingCode} existingNote={existingNote} />
                    )}
                    {view === 'reason' && (
                        <ReasonView onPick={pickReason} onCancel={() => setView('detail')} />
                    )}
                    {view === 'other_text' && (
                        <OtherTextView
                            value={otherText}
                            onChange={setOtherText}
                            onConfirm={() => applyFieldFit('OT', otherText.trim())}
                            onBack={() => setView('reason')}
                            busy={busy}
                        />
                    )}

                    {error && (
                        <div style={{
                            margin: '12px 0',
                            padding: '10px 12px',
                            color: 'var(--error)',
                            background: 'rgba(220, 38, 38, 0.10)',
                            border: '1px solid rgba(220, 38, 38, 0.40)',
                            borderRadius: '8px',
                            fontSize: '13px',
                        }}>
                            {error}
                        </div>
                    )}
                </div>

                {view === 'detail' && (
                    <Footer
                        eff={eff}
                        existingCode={existingCode}
                        existingNote={existingNote}
                        busy={busy}
                        onMarkClick={() => setView('reason')}
                        onRemove={clearFieldFit}
                    />
                )}
            </div>
        </>
    );
}

// ── Header ────────────────────────────────────────────────────────────

function Header({ point, eff, onClose }) {
    const color = STATUS_COLORS[eff] || 'var(--text-muted)';
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px 10px',
            borderBottom: '1px solid var(--border-subtle)',
            gap: '8px',
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                <span style={{
                    fontSize: '17px',
                    fontWeight: 700,
                    color: 'var(--brand-amber)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    {labelForPoint(point)}
                </span>
                <span style={{
                    padding: '3px 10px',
                    borderRadius: '999px',
                    background: 'rgba(255,255,255,0.04)',
                    border: `1px solid ${color}`,
                    color,
                    fontSize: '11px',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                }}>
                    {STATUS_LABELS[eff] || eff}
                </span>
            </div>
            <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                }}
            >
                <X size={18} />
            </button>
        </div>
    );
}

// ── Detail view ───────────────────────────────────────────────────────

function DetailView({ point, existingCode, existingNote }) {
    const skipDesign = point.shot_type === 'unmatched_bonus' || point.shot_type === 'parse_error';
    const skipOffset = point.shot_type === 'check_shot' || point.shot_type === 'control_check';

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '16px' }}>
            {point.raw_code && (
                <Field label="Raw code" mono>{point.raw_code}</Field>
            )}
            <Field label="Observed" mono>
                N {fmt(point.observed_northing)}, E {fmt(point.observed_easting)}
                {point.observed_elevation != null && `, Z ${fmt(point.observed_elevation)}`}
            </Field>
            {!skipDesign && (
                <Field label="Design point" mono>
                    {point.design_point_id ? `id ${shortId(point.design_point_id)}` : '—'}
                    {point.design_point_id_b ? ` → ${shortId(point.design_point_id_b)}` : ''}
                </Field>
            )}
            {!skipOffset && (
                <>
                    <Field label="Declared offset" mono>
                        {point.declared_offset_distance != null ? `${fmt(point.declared_offset_distance)} ft` : '—'}
                        {point.declared_offset_direction ? ` (${point.declared_offset_direction})` : ''}
                    </Field>
                    <Field label="Actual offset" mono>
                        {point.actual_offset_distance != null ? `${fmt(point.actual_offset_distance)} ft` : '—'}
                        {point.actual_offset_direction ? ` · bearing ${point.actual_offset_direction}` : ''}
                    </Field>
                </>
            )}
            <Field label="Tolerance" mono>
                H {fmt(point.effective_tolerance_h)} ft
                {point.effective_tolerance_v != null && ` · V ${fmt(point.effective_tolerance_v)} ft`}
            </Field>
            <Field label="Deltas" mono>
                <DeltaText label="ΔH" value={point.delta_h} status={point.h_status} />
                {point.delta_z != null && (
                    <>
                        {' · '}
                        <DeltaText label="ΔV" value={point.delta_z} status={point.v_status} />
                    </>
                )}
            </Field>
            {existingCode && (
                <Field label="Field-fit reason">
                    <span style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>
                        {existingCode} — {REASON_LABELS[existingCode] || 'Other'}
                    </span>
                    {existingNote && (
                        <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                            {existingNote}
                        </div>
                    )}
                </Field>
            )}
            {point.field_fit_note && !existingCode && (
                <Field label="Note">
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', whiteSpace: 'pre-wrap' }}>
                        {point.field_fit_note}
                    </div>
                </Field>
            )}
        </div>
    );
}

function Field({ label, mono, children }) {
    return (
        <div>
            <div style={{
                fontSize: '11px',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
                marginBottom: '4px',
            }}>
                {label}
            </div>
            <div
                className={mono ? 'coordinate-data' : undefined}
                style={{
                    fontSize: '14px',
                    fontFamily: mono ? "'JetBrains Mono', monospace" : 'inherit',
                    color: 'var(--text-main)',
                }}
            >
                {children}
            </div>
        </div>
    );
}

function DeltaText({ label, value, status }) {
    const color = status === 'in_tol' || status === 'check_pass'
        ? 'var(--success)'
        : status === 'out_of_tol' || status === 'check_fail'
            ? 'var(--error)'
            : 'var(--text-main)';
    return (
        <span style={{ color, fontWeight: 600 }}>
            {label} {fmt(value)}
        </span>
    );
}

// ── Reason picker ─────────────────────────────────────────────────────

function ReasonView({ onPick, onCancel }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '16px' }}>
            <div style={{
                fontSize: '14px',
                color: 'var(--text-muted)',
                marginBottom: '6px',
            }}>
                Why is this stake out of design tolerance?
            </div>
            {REASON_ORDER.map((code) => (
                <button
                    key={code}
                    type="button"
                    onClick={() => onPick(code)}
                    style={reasonButtonStyle}
                >
                    <strong style={{ color: 'var(--brand-amber)', marginRight: '10px' }}>{code}</strong>
                    {REASON_LABELS[code]}
                </button>
            ))}
            <button
                type="button"
                onClick={onCancel}
                style={{
                    ...reasonButtonStyle,
                    background: 'transparent',
                    color: 'var(--text-muted)',
                    border: '1px solid var(--border-subtle)',
                }}
            >
                Back
            </button>
        </div>
    );
}

const reasonButtonStyle = {
    width: '100%',
    minHeight: '52px',
    padding: '12px 14px',
    background: 'var(--bg-surface)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    fontSize: '15px',
    fontFamily: 'inherit',
    textAlign: 'left',
    cursor: 'pointer',
};

// ── Other-text input ──────────────────────────────────────────────────

function OtherTextView({ value, onChange, onConfirm, onBack, busy }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '16px' }}>
            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                Briefly describe the field condition.
            </div>
            <textarea
                value={value}
                onChange={(e) => onChange(e.target.value)}
                rows={4}
                style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    background: 'var(--bg-surface)',
                    color: 'var(--text-main)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    fontFamily: 'inherit',
                    fontSize: '14px',
                    resize: 'vertical',
                }}
                placeholder="e.g., Buried sprinkler line forced offset 0.20ft west."
            />
            <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={onBack} style={{ ...reasonButtonStyle, flex: '0 0 auto', width: 'auto' }}>
                    Back
                </button>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy || !value.trim()}
                    style={{
                        flex: 1,
                        padding: '12px 14px',
                        background: 'var(--brand-amber)',
                        color: '#0a1a16',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: busy || !value.trim() ? 'default' : 'pointer',
                        opacity: busy || !value.trim() ? 0.6 : 1,
                        fontFamily: 'inherit',
                    }}
                >
                    {busy ? 'Saving…' : 'Save field-fit flag'}
                </button>
            </div>
        </div>
    );
}

// ── Footer ────────────────────────────────────────────────────────────

function Footer({ eff, existingCode, existingNote, busy, onMarkClick, onRemove }) {
    if (eff === 'field_fit') {
        return (
            <div style={{
                padding: '12px 18px 14px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-dark)',
            }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    Field-fit flagged
                    {existingCode && (
                        <>
                            {' as '}
                            <strong style={{ color: 'var(--brand-amber)' }}>
                                {existingCode} — {REASON_LABELS[existingCode] || 'Other'}
                            </strong>
                        </>
                    )}
                    {existingNote && existingCode === 'OT' && '.'}
                </div>
                <button
                    type="button"
                    onClick={onRemove}
                    disabled={busy}
                    style={{
                        width: '100%',
                        padding: '12px 14px',
                        background: 'transparent',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: busy ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: busy ? 0.6 : 1,
                    }}
                >
                    {busy ? 'Removing…' : 'Remove field-fit flag'}
                </button>
            </div>
        );
    }
    if (eff === 'out_of_tol') {
        return (
            <div style={{
                padding: '12px 18px 14px',
                borderTop: '1px solid var(--border-subtle)',
                background: 'var(--bg-dark)',
            }}>
                <button
                    type="button"
                    onClick={onMarkClick}
                    disabled={busy}
                    style={{
                        width: '100%',
                        padding: '14px',
                        background: 'var(--brand-amber)',
                        color: '#0a1a16',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: 700,
                        cursor: busy ? 'default' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: busy ? 0.6 : 1,
                    }}
                >
                    Mark as field-fit
                </button>
            </div>
        );
    }
    return null;
}

// ── Helpers ───────────────────────────────────────────────────────────

function fmt(v) {
    if (v == null) return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(3);
}

function shortId(id) {
    if (typeof id !== 'string') return '—';
    return id.slice(0, 8);
}

function labelForPoint(p) {
    if (!p) return '';
    if (p.raw_code) return p.raw_code;
    return p.observed_point_id || '—';
}
