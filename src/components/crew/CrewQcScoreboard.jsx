import React, { useMemo, useState } from 'react';
import CrewQcPointSheet from './CrewQcPointSheet.jsx';

// ─── CrewQcScoreboard ────────────────────────────────────────────────
// Chief-facing QC scoreboard. Renders four regions, top to bottom:
//   1. Status headline (one phrase visible from across the cab)
//   2. Counts row (status chips)
//   3. Per-point list (sorted: out-of-tol first, then field-fit, etc.)
//   4. Tap-row → CrewQcPointSheet (bottom sheet with detail + flag UI)
//
// Field-fit overlay
// ─────────────────
// Migration 12 ships an UPDATE trigger that forbids field roles from
// touching h_status. Stage 10.4 cannot reclassify a row's h_status,
// only mutate the field_fit_reason / field_fit_note columns the
// trigger allows. To represent "this out-of-tol shot was a justified
// field-fit", we encode the new SOS reason code (OB/AC/SA/CF/OT) as
// a "[CODE] note" prefix in field_fit_note, then derive an effective
// status in the UI.
//
// effectiveStatus(p) returns 'field_fit' whenever a recognised reason
// prefix is present; otherwise it returns the underlying h_status.

export const FIELD_FIT_CODES = {
    OB: 'Obstruction',
    AC: 'Access issue',
    SA: 'Safety',
    CF: 'Conflict (existing infrastructure)',
    OT: 'Other',
};

export function extractFieldFitCode(note) {
    if (!note || typeof note !== 'string') return null;
    const m = note.match(/^\[(OB|AC|SA|CF|OT)\]/);
    return m ? m[1] : null;
}

export function extractFieldFitNote(note) {
    if (!note || typeof note !== 'string') return '';
    const m = note.match(/^\[[A-Z]{2}\]\s*(.*)$/s);
    return m ? m[1].trim() : '';
}

export function effectiveStatus(point) {
    if (!point) return 'pending';
    if (extractFieldFitCode(point.field_fit_note)) return 'field_fit';
    return point.h_status || 'pending';
}

export function isStakeShot(point) {
    return point && (point.shot_type === 'point_stake' || point.shot_type === 'line_stake');
}

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

const SORT_ORDER = [
    'out_of_tol',
    'field_fit',
    'check_fail',
    'in_tol',
    'check_pass',
    'unmatched',
    'unmatched_check',
    'parse_error',
    'built_on',
    'pending',
];

const FILTER_KEYS = ['in_tol', 'out_of_tol', 'field_fit', 'check', 'unmatched'];

export default function CrewQcScoreboard({ points, onPointUpdate }) {
    const [filter, setFilter] = useState(null);
    const [openPoint, setOpenPoint] = useState(null);

    const counts = useMemo(() => {
        const c = {
            stakes: 0,
            in_tol: 0,
            out_of_tol: 0,
            field_fit: 0,
            check_pass: 0,
            check_fail: 0,
            unmatched: 0,
            unmatched_check: 0,
            parse_error: 0,
        };
        for (const p of points || []) {
            if (isStakeShot(p)) c.stakes += 1;
            const eff = effectiveStatus(p);
            if (eff in c) c[eff] += 1;
        }
        return c;
    }, [points]);

    const headline = useMemo(() => deriveHeadline(points || [], counts), [points, counts]);

    const sortedPoints = useMemo(() => {
        const list = [...(points || [])];
        list.sort((a, b) => {
            const ai = SORT_ORDER.indexOf(effectiveStatus(a));
            const bi = SORT_ORDER.indexOf(effectiveStatus(b));
            if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
            return String(a.observed_point_id || '').localeCompare(String(b.observed_point_id || ''));
        });
        return list;
    }, [points]);

    const visiblePoints = useMemo(() => {
        if (!filter) return sortedPoints;
        return sortedPoints.filter((p) => {
            const eff = effectiveStatus(p);
            if (filter === 'check') return eff === 'check_pass' || eff === 'check_fail';
            if (filter === 'unmatched') return eff === 'unmatched' || eff === 'unmatched_check';
            return eff === filter;
        });
    }, [sortedPoints, filter]);

    if (!points || points.length === 0) return null;

    return (
        <div style={{ marginBottom: '20px' }}>
            <Headline {...headline} />

            <div style={{
                display: 'flex',
                gap: '8px',
                flexWrap: 'wrap',
                marginBottom: '14px',
            }}>
                {FILTER_KEYS.map((key) => {
                    const display = chipDisplayFor(key, counts);
                    if (display.hidden) return null;
                    const active = filter === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => setFilter(active ? null : key)}
                            style={{
                                padding: '6px 12px',
                                background: active ? display.color : 'rgba(255,255,255,0.04)',
                                color: active ? '#0a1a16' : display.color,
                                border: `1px solid ${display.color}`,
                                borderRadius: '999px',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                            }}
                        >
                            <span style={{ fontWeight: 700, marginRight: '6px' }}>{display.value}</span>
                            {display.label}
                        </button>
                    );
                })}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {visiblePoints.length === 0 ? (
                    <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                    }}>
                        No observations match this filter.
                    </div>
                ) : (
                    visiblePoints.map((p) => (
                        <PointRow
                            key={p.id || p.observed_point_id}
                            point={p}
                            onClick={() => setOpenPoint(p)}
                        />
                    ))
                )}
            </div>

            {openPoint && (
                <CrewQcPointSheet
                    point={openPoint}
                    onClose={() => setOpenPoint(null)}
                    onUpdated={() => {
                        setOpenPoint(null);
                        onPointUpdate?.();
                    }}
                />
            )}
        </div>
    );
}

// ── Headline ──────────────────────────────────────────────────────────

function deriveHeadline(points, counts) {
    if (counts.stakes === 0) {
        return {
            text: `${points.length} observation${points.length === 1 ? '' : 's'} processed`,
            tone: 'neutral',
        };
    }
    if (counts.out_of_tol === 0) {
        return { text: 'All stakes in tolerance', tone: 'success', glyph: '✓' };
    }
    if (counts.out_of_tol < counts.stakes / 2) {
        return {
            text: `${counts.out_of_tol} of ${counts.stakes} stakes need review`,
            tone: 'warning',
        };
    }
    return {
        text: `${counts.out_of_tol} stake${counts.out_of_tol === 1 ? '' : 's'} out of tolerance`,
        tone: 'error',
    };
}

function Headline({ text, tone, glyph }) {
    const colors = {
        success: 'var(--success)',
        warning: 'var(--brand-amber)',
        error: 'var(--error)',
        neutral: 'var(--text-main)',
    };
    return (
        <div style={{
            padding: '18px 4px 14px',
            color: colors[tone] || 'var(--text-main)',
            fontSize: '22px',
            fontWeight: 700,
            lineHeight: 1.25,
            display: 'flex',
            alignItems: 'baseline',
            gap: '8px',
            flexWrap: 'wrap',
        }}>
            <span>{text}</span>
            {glyph && <span aria-hidden style={{ fontSize: '20px' }}>{glyph}</span>}
        </div>
    );
}

// ── Counts row ────────────────────────────────────────────────────────

function chipDisplayFor(key, counts) {
    if (key === 'in_tol') {
        return {
            label: 'In tol',
            value: counts.in_tol,
            color: STATUS_COLORS.in_tol,
            hidden: false,
        };
    }
    if (key === 'out_of_tol') {
        return {
            label: 'Out of tol',
            value: counts.out_of_tol,
            color: STATUS_COLORS.out_of_tol,
            hidden: false,
        };
    }
    if (key === 'field_fit') {
        return {
            label: 'Field-fit',
            value: counts.field_fit,
            color: STATUS_COLORS.field_fit,
            hidden: counts.field_fit === 0,
        };
    }
    if (key === 'check') {
        const total = counts.check_pass + counts.check_fail;
        return {
            label: 'Checks',
            value: total,
            color: STATUS_COLORS.check_pass,
            hidden: total === 0,
        };
    }
    if (key === 'unmatched') {
        const total = counts.unmatched + counts.unmatched_check + counts.parse_error;
        return {
            label: 'Unmatched',
            value: total,
            color: STATUS_COLORS.unmatched,
            hidden: total === 0,
        };
    }
    return { hidden: true };
}

// ── Per-point row ─────────────────────────────────────────────────────

function PointRow({ point, onClick }) {
    const eff = effectiveStatus(point);
    const accent = (eff === 'out_of_tol' || eff === 'check_fail')
        ? STATUS_COLORS.out_of_tol
        : eff === 'field_fit'
            ? STATUS_COLORS.field_fit
            : null;

    const designLabel = displayDesignRef(point);
    const deltaH = formatNum(point.delta_h);
    const tolH = formatNum(point.effective_tolerance_h);
    const deltaZ = point.delta_z != null ? formatNum(point.delta_z) : null;

    return (
        <button
            type="button"
            onClick={onClick}
            style={{
                width: '100%',
                textAlign: 'left',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderLeft: accent ? `4px solid ${accent}` : '1px solid var(--border-subtle)',
                borderRadius: '10px',
                padding: '12px 14px',
                cursor: 'pointer',
                color: 'var(--text-main)',
                fontFamily: 'inherit',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
            }}
        >
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '8px',
            }}>
                <span style={{
                    fontSize: '17px',
                    fontWeight: 700,
                    color: 'var(--brand-amber)',
                }}>
                    {designLabel}
                </span>
                <StatusPill status={eff} />
            </div>
            {point.raw_code && (
                <div style={{
                    fontSize: '12px',
                    color: 'var(--text-muted)',
                    fontFamily: "'JetBrains Mono', monospace",
                }}>
                    {point.raw_code}
                </div>
            )}
            <div style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: '14px',
                flexWrap: 'wrap',
                marginTop: '2px',
            }}>
                <DeltaCell label="ΔH" value={deltaH} tol={tolH} status={eff} axis="h" />
                {deltaZ != null && (
                    <DeltaCell
                        label="ΔV"
                        value={deltaZ}
                        tol={formatNum(point.effective_tolerance_v)}
                        status={point.v_status || 'pending'}
                        axis="v"
                    />
                )}
            </div>
        </button>
    );
}

function DeltaCell({ label, value, tol, status, axis }) {
    const color = status === 'in_tol' || status === 'check_pass'
        ? 'var(--success)'
        : status === 'out_of_tol' || status === 'check_fail'
            ? 'var(--error)'
            : 'var(--text-main)';
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', letterSpacing: '0.5px' }}>{label}</span>
                <span
                    className="coordinate-data"
                    style={{ fontSize: '17px', fontWeight: 600, color }}
                >
                    {value == null ? '—' : value}
                </span>
            </div>
            {tol != null && (
                <span style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginLeft: '24px' }}>
                    tol {tol}
                </span>
            )}
        </div>
    );
}

function StatusPill({ status }) {
    const color = STATUS_COLORS[status] || 'var(--text-muted)';
    const label = STATUS_LABELS[status] || status;
    return (
        <span style={{
            display: 'inline-block',
            padding: '3px 10px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${color}`,
            color,
            fontSize: '11px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
        }}>
            {label}
        </span>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatNum(v) {
    if (v == null) return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return n.toFixed(3);
}

function displayDesignRef(p) {
    if (p.shot_type === 'control_check') return 'CP-CHK';
    if (p.shot_type === 'parse_error') return 'Parse error';
    if (p.shot_type === 'unmatched_bonus') return p.observed_point_id;
    // Fall back to observed_point_id when we don't have a useful design ref.
    if (p.shot_type === 'check_shot' && p.raw_code) {
        const m = p.raw_code.match(/^([A-Za-z0-9_]+)-CHK$/i);
        if (m) return m[1];
    }
    if (p.shot_type === 'point_stake' && p.raw_code) {
        const m = p.raw_code.match(/^([A-Za-z0-9_]+)-/);
        if (m) return m[1];
    }
    if (p.shot_type === 'line_stake' && p.raw_code) {
        const m = p.raw_code.match(/^([A-Za-z0-9_]+:[A-Za-z0-9_]+)-/);
        if (m) return m[1];
    }
    return p.observed_point_id || '—';
}
