import React, { useState } from 'react';
import { FlaskConical, X, Loader } from 'lucide-react';
import { parseStakeCode } from '../utils/stakeoutQC.js';

// Feature flag: this component renders nothing in a production build.
// Vite replaces import.meta.env.DEV with a boolean at build time so the
// seeder, its modal, and its Supabase writes are tree-shaken out of the
// production bundle entirely.
const SHOW_SEEDER = import.meta.env.DEV;

const DISTRIBUTIONS = {
    realistic: { label: 'Realistic mix (70% in tol · 20% out · 10% field fit)' },
    perfect: { label: 'Perfect (100% in tol)' },
    worst: { label: 'Worst case (100% out of tol)' },
};

// Pick an h_status for the i-th point given the distribution mode and a
// seeded random. Kept deterministic-ish via sequential selection so users
// don't have to run it twice to see a visible out-of-tol point.
function pickStatus(mode, i, total) {
    if (mode === 'perfect') return 'in_tol';
    if (mode === 'worst') return 'out_of_tol';
    // realistic: bucket by fraction
    const frac = i / Math.max(total, 1);
    if (frac < 0.7) return 'in_tol';
    if (frac < 0.9) return 'out_of_tol';
    return 'field_fit';
}

function randomOffset(magnitude) {
    const angle = Math.random() * 2 * Math.PI;
    return {
        dN: Math.cos(angle) * magnitude,
        dE: Math.sin(angle) * magnitude,
    };
}

function magnitudeForStatus(status, toleranceH) {
    const tol = Number.isFinite(toleranceH) && toleranceH > 0 ? toleranceH : 0.06;
    if (status === 'in_tol') return Math.random() * tol * 0.8;
    if (status === 'out_of_tol') return tol * (1.5 + Math.random() * 2.5);
    // field_fit: moderate offset, field-applied state
    return 0.3 + Math.random() * 1.2;
}

const FIELD_FIT_REASONS = ['adjacent_line', 'utility_conflict', 'design_math_error', 'grade_adjustment'];

function shufflePick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

export default function AssignmentTestDataSeeder({
    supabase,
    profile,
    assignment,
    designPoints,
    onSeeded,
    onToast,
}) {
    const [open, setOpen] = useState(false);
    const [count, setCount] = useState(designPoints?.length || 0);
    const [mode, setMode] = useState('realistic');
    const [busy, setBusy] = useState(false);

    if (!SHOW_SEEDER) return null;

    function openModal() {
        setCount(designPoints?.length || 0);
        setMode('realistic');
        setOpen(true);
    }

    async function seed() {
        if (busy) return;
        if (!assignment?.id) {
            if (onToast) onToast('error', 'No assignment context available for seeder.');
            return;
        }
        const pool = (designPoints || []).slice(0, Math.max(0, Number(count) || 0));
        if (pool.length === 0) {
            if (onToast) onToast('error', 'No design points to seed observations for.');
            return;
        }
        setBusy(true);

        const toleranceH = Number(assignment.default_tolerance_h) || 0.06;

        try {
            // 1) Wipe any existing QC for this assignment. qc_points cascades
            //    via the run_id FK, so deleting runs is enough.
            const { error: delErr } = await supabase
                .from('stakeout_qc_runs')
                .delete()
                .eq('assignment_id', assignment.id);
            if (delErr) throw delErr;

            // 2) Insert a fresh run row.
            const chiefId = assignment.party_chief_id || profile?.id || null;
            const { data: runRow, error: runErr } = await supabase
                .from('stakeout_qc_runs')
                .insert({
                    assignment_id: assignment.id,
                    party_chief_id: chiefId,
                    instrument: 'Seeded test data',
                    weather_notes: 'Synthetic observations — dev-only seeder',
                    submitted_at: new Date().toISOString(),
                    submitted_from: 'office',
                })
                .select('id')
                .single();
            if (runErr) throw runErr;

            // 3) Build fake observation rows for each selected design point.
            const now = new Date();
            const pointRows = pool.map((dp, i) => {
                const status = pickStatus(mode, i, pool.length);
                const mag = magnitudeForStatus(status, toleranceH);
                const { dN, dE } = randomOffset(mag);
                const dZ = (Math.random() - 0.5) * 0.3;
                const observed_n = Number(dp.northing) + dN;
                const observed_e = Number(dp.easting) + dE;
                const observed_z = dp.elevation != null ? Number(dp.elevation) + dZ : null;

                const rawCode = dp.feature_code || 'TBC';
                const parsed = parseStakeCode(rawCode);

                const delta_h = Math.sqrt(dN * dN + dE * dE);
                const row = {
                    run_id: runRow.id,
                    assignment_id: assignment.id,
                    design_point_id: dp.id,
                    observed_point_id: `OBS-${i + 1}`,
                    observed_northing: round3(observed_n),
                    observed_easting: round3(observed_e),
                    observed_elevation: observed_z != null ? round3(observed_z) : null,
                    raw_code: rawCode,
                    parsed_feature: parsed.feature || null,
                    parsed_offset_distance: parsed.offset_distance,
                    parsed_offset_direction: parsed.offset_direction,
                    parsed_stake_type: parsed.stake_type,
                    declared_offset_distance: null,
                    declared_offset_direction: null,
                    declared_stake_type: null,
                    actual_offset_distance: round3(delta_h),
                    actual_offset_direction: pickDirection(dN, dE),
                    offset_variance: null,
                    delta_n: round3(dN),
                    delta_e: round3(dE),
                    delta_z: observed_z != null ? round3(dZ) : null,
                    delta_h: round3(delta_h),
                    effective_tolerance_h: toleranceH,
                    h_status: status,
                    field_fit_reason: status === 'field_fit' ? shufflePick(FIELD_FIT_REASONS) : null,
                    field_fit_note: status === 'field_fit' ? 'Seeded: stake shifted per site condition' : null,
                    built_on_status: null,
                    observed_at: now.toISOString(),
                };
                return row;
            });

            // 4) Insert all observation rows in a single batch.
            const { error: ptsErr } = await supabase
                .from('stakeout_qc_points')
                .insert(pointRows);
            if (ptsErr) throw ptsErr;

            if (onToast)
                onToast(
                    'success',
                    `Seeded ${pool.length} observation${pool.length === 1 ? '' : 's'} (${mode}).`,
                );
            setOpen(false);
            if (onSeeded) onSeeded();
        } catch (err) {
            console.error('[Seeder] failed:', err);
            if (onToast)
                onToast('error', `Seed failed${err?.code ? ` (code ${err.code})` : ''}. Check console.`);
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            <button type="button" onClick={openModal} style={floatingBtn} title="Dev-only seeder">
                <FlaskConical size={14} /> Seed test QC data
            </button>

            {open && (
                <div style={backdrop} onClick={() => (busy ? null : setOpen(false))}>
                    <div style={modalCard} onClick={(e) => e.stopPropagation()}>
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginBottom: '12px',
                            }}
                        >
                            <h3 style={{ margin: 0, color: 'var(--text-main)', fontSize: '16px' }}>
                                Seed test QC data
                            </h3>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={busy}
                                style={closeBtn}
                                aria-label="Close"
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <p
                            style={{
                                color: 'var(--error)',
                                fontSize: '12.5px',
                                margin: '0 0 14px 0',
                                lineHeight: 1.5,
                            }}
                        >
                            This will delete any existing QC data for this assignment and generate
                            fresh test data. Dev-only tool.
                        </p>

                        <label style={labelStyle} htmlFor="seeder-count">
                            How many points
                        </label>
                        <input
                            id="seeder-count"
                            type="number"
                            min="0"
                            max={designPoints.length}
                            value={count}
                            onChange={(e) => setCount(e.target.value)}
                            style={inputStyle}
                            disabled={busy}
                        />
                        <div
                            style={{
                                fontSize: '11px',
                                color: 'var(--text-muted)',
                                marginTop: '4px',
                                marginBottom: '14px',
                            }}
                        >
                            Max {designPoints.length} in this assignment.
                        </div>

                        <label style={labelStyle}>Distribution</label>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '18px' }}>
                            {Object.entries(DISTRIBUTIONS).map(([k, v]) => (
                                <label
                                    key={k}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        color: 'var(--text-main)',
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="seeder-mode"
                                        value={k}
                                        checked={mode === k}
                                        onChange={() => setMode(k)}
                                        disabled={busy}
                                    />
                                    {v.label}
                                </label>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={busy}
                                style={secondaryBtn(busy)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={seed}
                                disabled={busy || !count}
                                style={primaryBtn(busy || !count)}
                            >
                                {busy ? (
                                    <>
                                        <Loader size={14} className="spinning" /> Seeding…
                                    </>
                                ) : (
                                    <>
                                        <FlaskConical size={14} /> Seed data
                                    </>
                                )}
                            </button>
                        </div>
                        <style>{`
                            @keyframes spin { 100% { transform: rotate(360deg); } }
                            .spinning { animation: spin 1s linear infinite; }
                        `}</style>
                    </div>
                </div>
            )}
        </>
    );
}

function round3(n) {
    return Math.round(n * 1000) / 1000;
}

function pickDirection(dN, dE) {
    if (Math.abs(dN) >= Math.abs(dE)) return dN >= 0 ? 'N' : 'S';
    return dE >= 0 ? 'E' : 'W';
}

// ── Styles ─────────────────────────────────────────────────────────────

const floatingBtn = {
    position: 'absolute',
    top: '20px',
    right: '20px',
    zIndex: 20,
    backgroundColor: 'var(--brand-amber)',
    color: '#fff',
    border: 'none',
    padding: '8px 14px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '12.5px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'inherit',
    boxShadow: '0 4px 14px rgba(0,0,0,0.4)',
};

const backdrop = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(3px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
};

const modalCard = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '22px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
};

const closeBtn = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'inline-flex',
    alignItems: 'center',
};

const labelStyle = {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: '12px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: '6px',
};

const inputStyle = {
    backgroundColor: 'var(--bg-dark)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    padding: '8px 10px',
    fontSize: '14px',
    width: '100%',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
};

function primaryBtn(disabled) {
    return {
        backgroundColor: 'var(--brand-teal)',
        color: '#fff',
        border: '1px solid var(--brand-teal)',
        padding: '9px 16px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
        fontSize: '13px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'inherit',
    };
}

function secondaryBtn(disabled) {
    return {
        backgroundColor: 'transparent',
        color: 'var(--text-main)',
        border: '1px solid var(--border-subtle)',
        padding: '9px 16px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 500,
        fontSize: '13px',
        fontFamily: 'inherit',
    };
}
