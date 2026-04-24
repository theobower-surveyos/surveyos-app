// ============================================================================
// src/lib/sosMatcher.test.js
// Self-contained test suite for sosMatcher.js. Exports runMatcherTests()
// so the in-browser dev tester (SosParserTester.jsx) can invoke it and
// show a live pass/fail count. Data-driven: every case describes a
// parsed+observed+context triple and a set of expected fields on the
// returned QcRow.
//
// Not wired to Vitest — matches the sosParser.test.js pattern. A future
// Stage 13 polish can add a Vitest wrapper that consumes TEST_CASES.
// ============================================================================

import { matchStake, H_TOLERANCE_DEFAULT, V_TOLERANCE_DEFAULT, CONTROL_CHECK_RADIUS } from './sosMatcher.js';

// ── Shared synthetic fixtures ─────────────────────────────────────────────
// Three design points at round coordinates so the expected deltas are
// easy to reason about. Elevations deliberately clean.
const DP_4007 = {
    id: 'uuid-dp-4007',
    point_id: '4007',
    feature_code: 'TBC',
    northing: 1000.000,
    easting:  2000.000,
    elevation:  50.000,
};
const DP_4003 = {
    id: 'uuid-dp-4003',
    point_id: '4003',
    feature_code: 'CL',
    northing: 1000.000,
    easting:  2000.000,
    elevation:  50.000,
};
const DP_4002 = {
    id: 'uuid-dp-4002',
    point_id: '4002',
    feature_code: 'CL',
    northing: 1000.000,
    easting:  2100.000,  // 100ft east of 4003
    elevation:  60.000,
};
const DP_4010 = {
    id: 'uuid-dp-4010',
    point_id: '4010',
    feature_code: 'EP',
    northing: 2000.000,
    easting:  3000.000,
    elevation:  null,     // no elevation
};

// Control points for CP-CHK matching.
const CP_PRI = {
    id: 'uuid-cp-pri',
    point_id: 'CP_PRI',
    feature_code: 'CP',
    northing: 5000.000,
    easting:  6000.000,
    elevation: 100.000,
};
const CP_SEC = {
    id: 'uuid-cp-sec',
    point_id: 'CP_SEC',
    feature_code: 'CP',
    northing: 5000.500,
    easting:  6000.500,
    elevation: 100.100,
};

const PRIOR_OBS = {
    observed_point_id: 'prior-123',
    observed_northing: 7000.000,
    observed_easting:  8000.000,
    observed_elevation: 30.000,
    run_id: 'uuid-run-old',
};

// Default assignment context.
function makeContext(overrides = {}) {
    return {
        assignmentId: 'uuid-asg-1',
        designPoints: [DP_4007, DP_4003, DP_4002, DP_4010],
        assignmentPoints: [],
        defaults: {},
        projectControls: [CP_PRI, CP_SEC],
        priorObservations: [PRIOR_OBS],
        ...overrides,
    };
}

function obs({ id = 'obs1', n, e, z = null, raw = '' } = {}) {
    return {
        observed_point_id: id,
        observed_northing: n,
        observed_easting: e,
        observed_elevation: z,
        raw_code: raw,
        observed_at: '2026-04-24T10:00:00Z',
    };
}

// ── Test cases ────────────────────────────────────────────────────────────

export const TEST_CASES = [
    // ── POINT STAKE ───────────────────────────────────────────────
    {
        name: 'point stake in tolerance (tight 0.030ft miss, default 0.060 tol)',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB', raw: '4007-5-HUB' },
        observed: obs({ n: 1005.030, e: 2000.000, z: 50.010, raw: '4007-5-HUB' }),
        context: makeContext(),
        expect: {
            shot_type: 'point_stake',
            h_status: 'in_tol',
            v_status: 'in_tol',
            design_point_id: 'uuid-dp-4007',
            declared_offset_distance: 5,
            // observed 5.03ft north of design → actual offset 5.030, variance +0.030, deltaH 0.030
            approx: { actual_offset_distance: 5.030, offset_variance: 0.030, delta_h: 0.030 },
            effective_tolerance_h: 0.060,
            effective_tolerance_v: 0.030,
        },
    },
    {
        name: 'point stake out of tolerance (0.100ft variance on 5ft offset)',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB', raw: '4007-5-HUB' },
        observed: obs({ n: 1005.100, e: 2000.000, z: 50.000, raw: '4007-5-HUB' }),
        context: makeContext(),
        expect: {
            shot_type: 'point_stake',
            h_status: 'out_of_tol',
            v_status: 'in_tol',
            approx: { delta_h: 0.100 },
        },
    },
    {
        name: 'point stake — design point missing → unmatched_bonus',
        parsed: { type: 'point_stake', design_refs: ['9999'], offset: 5, stake: 'HUB', raw: '9999-5-HUB' },
        observed: obs({ n: 1005, e: 2000, z: 50, raw: '9999-5-HUB' }),
        context: makeContext(),
        expect: {
            shot_type: 'unmatched_bonus',
            h_status: 'unmatched',
            design_point_id: null,
            v_status: null,
        },
    },
    {
        name: 'point stake — per-point override tolerance wins over default',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB', raw: '4007-5-HUB' },
        observed: obs({ n: 1005.040, e: 2000.000, z: 50.000, raw: '4007-5-HUB' }),
        context: makeContext({
            assignmentPoints: [
                { design_point_id: 'uuid-dp-4007', override_tolerance_h: 0.020 },
            ],
        }),
        expect: {
            h_status: 'out_of_tol',  // 0.040 > 0.020 override
            effective_tolerance_h: 0.020,
        },
    },
    {
        name: 'point stake — assignment default tolerance used when no override',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB', raw: '4007-5-HUB' },
        observed: obs({ n: 1005.090, e: 2000.000, z: 50.000, raw: '4007-5-HUB' }),
        context: makeContext({ defaults: { default_tolerance_h: 0.100 } }),
        expect: {
            h_status: 'in_tol',  // 0.090 < 0.100 assignment default
            effective_tolerance_h: 0.100,
        },
    },
    {
        name: 'point stake with zero offset (stake on design point)',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 0, stake: 'PAINT', raw: '4007-0-PAINT' },
        observed: obs({ n: 1000.020, e: 2000.010, z: 50.005, raw: '4007-0-PAINT' }),
        context: makeContext(),
        expect: {
            shot_type: 'point_stake',
            h_status: 'in_tol',
            parsed_stake_type: 'PAINT',
        },
    },
    {
        name: 'point stake with no elevation on observation → v_status null',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 0, stake: 'PAINT', raw: '4007-0-PAINT' },
        observed: obs({ n: 1000.010, e: 2000.010, z: null, raw: '4007-0-PAINT' }),
        context: makeContext(),
        expect: { v_status: null, h_status: 'in_tol' },
    },
    {
        name: 'point stake with no elevation on design point → v_status null',
        parsed: { type: 'point_stake', design_refs: ['4010'], offset: 0, stake: 'PAINT', raw: '4010-0-PAINT' },
        observed: obs({ n: 2000.010, e: 3000.010, z: 42.0, raw: '4010-0-PAINT' }),
        context: makeContext(),
        expect: { v_status: null, h_status: 'in_tol' },
    },

    // ── LINE STAKE ────────────────────────────────────────────────
    {
        name: 'line stake on the perpendicular, in tol (A:B span 100ft east, offset 11, hit at (11, 1.000))',
        parsed: { type: 'line_stake', design_refs: ['4003', '4002'], offset: 11, stake: 'NAIL', raw: '4003:4002-11-NAIL' },
        // A=(1000,2000), B=(1000,2100). At t=0.11, foot of perpendicular = (1000, 2011).
        // Observed 0.040ft north of the foot → actualOffset 0.040, declaredOffset 11.
        // offsetVariance = 0.040 - 11 = -10.960, deltaH = 10.960 → out of tol.
        // Whoops — declaredOffset for a line stake is actually parsed.offset = 11,
        // which represents the perpendicular distance the chief reported. That is
        // compared directly to actualOffset = perpendicular distance. So for an
        // on-line staked point we expect actualOffset ~0, |variance| ≈ 11 → OOT.
        // This case actually exercises "chief typed offset of 11 but staked ON the
        // line" — that is the out-of-tol case. See next case for proper in-tol.
        observed: obs({ n: 1000.040, e: 2011.000, z: 50.000, raw: '4003:4002-11-NAIL' }),
        context: makeContext(),
        expect: {
            shot_type: 'line_stake',
            h_status: 'out_of_tol',
            declared_offset_distance: 11,
            approx: { actual_offset_distance: 0.040, offset_variance: -10.960, delta_h: 10.960 },
            design_point_id: 'uuid-dp-4003',
            design_point_id_b: 'uuid-dp-4002',
        },
    },
    {
        name: 'line stake — perpendicular offset 11ft hits the declared offset → in tol',
        parsed: { type: 'line_stake', design_refs: ['4003', '4002'], offset: 11, stake: 'NAIL', raw: '4003:4002-11-NAIL' },
        // Observed 11ft north of the line (on the perpendicular at station 50ft).
        observed: obs({ n: 1011.000, e: 2050.000, z: 55.030, raw: '4003:4002-11-NAIL' }),
        context: makeContext(),
        expect: {
            shot_type: 'line_stake',
            h_status: 'in_tol',
            approx: { actual_offset_distance: 11.000, offset_variance: 0, delta_h: 0 },
        },
    },
    {
        name: 'line stake — elevation interpolates at t=0.5',
        parsed: { type: 'line_stake', design_refs: ['4003', '4002'], offset: 11, stake: 'NAIL', raw: '4003:4002-11-NAIL' },
        // At t=0.5 along 4003→4002, elevation interp = 55. Observed Z = 55.020 → in tol on V.
        observed: obs({ n: 1011.000, e: 2050.000, z: 55.020, raw: '4003:4002-11-NAIL' }),
        context: makeContext(),
        expect: { v_status: 'in_tol' },
    },
    {
        name: 'line stake — projection off-segment flags note but still computes QC',
        parsed: { type: 'line_stake', design_refs: ['4003', '4002'], offset: 11, stake: 'NAIL', raw: '4003:4002-11-NAIL' },
        observed: obs({ n: 1011.000, e: 1990.000, z: 50.000, raw: '4003:4002-11-NAIL' }),  // 10ft west of A
        context: makeContext(),
        expect: {
            shot_type: 'line_stake',
            h_status: 'in_tol',  // perpendicular distance from infinite line = 11ft, matches declared
            fieldFitNoteContains: 'outside line segment endpoints',
        },
    },
    {
        name: 'line stake — missing endpoint A → unmatched_bonus',
        parsed: { type: 'line_stake', design_refs: ['9999', '4002'], offset: 11, stake: 'NAIL', raw: '9999:4002-11-NAIL' },
        observed: obs({ n: 1011, e: 2050, z: 55, raw: '9999:4002-11-NAIL' }),
        context: makeContext(),
        expect: { shot_type: 'unmatched_bonus', h_status: 'unmatched' },
    },
    {
        name: 'line stake — missing endpoint B → unmatched_bonus',
        parsed: { type: 'line_stake', design_refs: ['4003', '9999'], offset: 11, stake: 'NAIL', raw: '4003:9999-11-NAIL' },
        observed: obs({ n: 1011, e: 2050, z: 55, raw: '4003:9999-11-NAIL' }),
        context: makeContext(),
        expect: { shot_type: 'unmatched_bonus', h_status: 'unmatched' },
    },
    {
        name: 'line stake — endpoint elevations null → v_status null',
        parsed: { type: 'line_stake', design_refs: ['4010', '4010'], offset: 0, stake: 'HUB', raw: '4010:4010-0-HUB' },
        // Degenerate: endpoint A==B makes the segment a point; the matcher still runs and returns perpendicular distance from that point.
        observed: obs({ n: 2000.010, e: 3000.020, z: 40, raw: '4010:4010-0-HUB' }),
        context: makeContext(),
        expect: {
            shot_type: 'line_stake',
            v_status: null,  // neither endpoint has elevation
        },
    },

    // ── CHECK SHOT ────────────────────────────────────────────────
    {
        name: 'check shot passes (within 0.060ft default)',
        parsed: { type: 'check_shot', design_refs: ['4007'], offset: null, stake: null, raw: '4007-CHK' },
        observed: obs({ n: 1000.030, e: 2000.020, z: 50.010, raw: '4007-CHK' }),
        context: makeContext(),
        expect: { shot_type: 'check_shot', h_status: 'check_pass', v_status: 'check_pass' },
    },
    {
        name: 'check shot fails horizontally',
        parsed: { type: 'check_shot', design_refs: ['4007'], offset: null, stake: null, raw: '4007-CHK' },
        observed: obs({ n: 1000.300, e: 2000.200, z: 50.010, raw: '4007-CHK' }),
        context: makeContext(),
        expect: { h_status: 'check_fail', v_status: 'check_pass' },
    },
    {
        name: 'check shot fails vertically',
        parsed: { type: 'check_shot', design_refs: ['4007'], offset: null, stake: null, raw: '4007-CHK' },
        observed: obs({ n: 1000.010, e: 2000.010, z: 50.200, raw: '4007-CHK' }),
        context: makeContext(),
        expect: { h_status: 'check_pass', v_status: 'check_fail' },
    },
    {
        name: 'check shot — design point only in project controls (outside assignment)',
        parsed: { type: 'check_shot', design_refs: ['CP_PRI'], offset: null, stake: null, raw: 'CP_PRI-CHK' },
        observed: obs({ n: 5000.020, e: 6000.020, z: 100.010, raw: 'CP_PRI-CHK' }),
        context: makeContext(),
        expect: { shot_type: 'check_shot', h_status: 'check_pass' },
    },
    {
        name: 'check shot — design point not in project at all → unmatched_check',
        parsed: { type: 'check_shot', design_refs: ['NOPE'], offset: null, stake: null, raw: 'NOPE-CHK' },
        observed: obs({ n: 1000, e: 2000, z: 50, raw: 'NOPE-CHK' }),
        context: makeContext(),
        expect: { shot_type: 'unmatched_check', h_status: 'unmatched_check' },
    },

    // ── CONTROL CHECK (CP-CHK) ────────────────────────────────────
    {
        name: 'CP-CHK — unique control within 2ft → check_pass',
        parsed: { type: 'control_check', design_refs: [], offset: null, stake: null, raw: 'CP-CHK' },
        observed: obs({ n: 5000.030, e: 6000.020, z: 100.010, raw: 'CP-CHK' }),
        // Distance to CP_PRI = ~0.036; to CP_SEC = ~0.68. Both within 2ft → MULTIPLE.
        context: makeContext({ projectControls: [CP_PRI] }),  // override to just one
        expect: { shot_type: 'control_check', h_status: 'check_pass', design_point_id: 'uuid-cp-pri' },
    },
    {
        name: 'CP-CHK — no candidates within radius → unmatched_check',
        parsed: { type: 'control_check', design_refs: [], offset: null, stake: null, raw: 'CP-CHK' },
        observed: obs({ n: 0, e: 0, z: 0, raw: 'CP-CHK' }),
        context: makeContext(),
        expect: {
            shot_type: 'unmatched_check',
            h_status: 'unmatched_check',
            fieldFitNoteContains: `within ${CONTROL_CHECK_RADIUS.toFixed(1)}ft`,
        },
    },
    {
        name: 'CP-CHK — multiple candidates within radius → unmatched_check',
        parsed: { type: 'control_check', design_refs: [], offset: null, stake: null, raw: 'CP-CHK' },
        observed: obs({ n: 5000.100, e: 6000.100, z: 100.000, raw: 'CP-CHK' }),
        // Both CP_PRI and CP_SEC live at ~5000,6000 — observer is within 2ft of both.
        context: makeContext(),
        expect: {
            shot_type: 'unmatched_check',
            h_status: 'unmatched_check',
            fieldFitNoteContains: 'Multiple candidates',
        },
    },
    {
        name: 'CP-CHK — matches a prior observation (not a control)',
        parsed: { type: 'control_check', design_refs: [], offset: null, stake: null, raw: 'CP-CHK' },
        observed: obs({ n: 7000.020, e: 8000.010, z: 30.005, raw: 'CP-CHK' }),
        // No project controls are near 7000,8000 — only the prior observation is.
        context: makeContext({ projectControls: [] }),
        expect: {
            shot_type: 'control_check',
            h_status: 'check_pass',
            design_point_id: null,  // prior observations don't carry a design_point_id
            fieldFitNoteContains: 'prior observation',
        },
    },

    // ── PARSE ERROR PASSTHROUGH ──────────────────────────────────
    {
        name: 'parse_error passthrough writes raw_code + error note',
        parsed: { type: 'parse_error', design_refs: [], offset: null, stake: null, raw: '4007 - 5 - HUB', error: 'Legacy format.' },
        observed: obs({ n: 1000.000, e: 2000.000, z: 50, raw: '4007 - 5 - HUB' }),
        context: makeContext(),
        expect: {
            shot_type: 'parse_error',
            h_status: 'parse_error',
            fieldFitNoteContains: 'Legacy format',
            design_point_id: null,
            v_status: null,
        },
    },

    // ── TOLERANCE FALLBACK CHAIN ─────────────────────────────────
    {
        name: 'tolerance fallback — all three layers present, per-point wins',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 0, stake: 'PAINT', raw: '4007-0-PAINT' },
        observed: obs({ n: 1000.010, e: 2000.010, z: 50.000, raw: '4007-0-PAINT' }),
        context: makeContext({
            defaults: { default_tolerance_h: 0.100, default_tolerance_v: 0.050 },
            assignmentPoints: [
                { design_point_id: 'uuid-dp-4007', override_tolerance_h: 0.025, override_tolerance_v: 0.015 },
            ],
        }),
        expect: { effective_tolerance_h: 0.025, effective_tolerance_v: 0.015 },
    },
    {
        name: 'tolerance fallback — no override, no default → library default',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 0, stake: 'PAINT', raw: '4007-0-PAINT' },
        observed: obs({ n: 1000.010, e: 2000.010, z: 50.000, raw: '4007-0-PAINT' }),
        context: makeContext(),
        expect: {
            effective_tolerance_h: H_TOLERANCE_DEFAULT,
            effective_tolerance_v: V_TOLERANCE_DEFAULT,
        },
    },
    {
        name: 'tolerance fallback — assignment default fills in when only V override missing',
        parsed: { type: 'point_stake', design_refs: ['4007'], offset: 0, stake: 'PAINT', raw: '4007-0-PAINT' },
        observed: obs({ n: 1000.010, e: 2000.010, z: 50.000, raw: '4007-0-PAINT' }),
        context: makeContext({
            defaults: { default_tolerance_v: 0.012 },
            assignmentPoints: [
                { design_point_id: 'uuid-dp-4007', override_tolerance_h: 0.025 },
            ],
        }),
        expect: { effective_tolerance_h: 0.025, effective_tolerance_v: 0.012 },
    },
];


// ── Runner ────────────────────────────────────────────────────────────────

function approxEq(actual, expected, eps = 0.001) {
    if (actual == null || expected == null) return actual === expected;
    return Math.abs(actual - expected) <= eps;
}

function fail(message) {
    return { ok: false, reason: message };
}

function evaluate(row, expect) {
    const checks = [
        'shot_type', 'h_status', 'v_status',
        'design_point_id', 'design_point_id_b',
        'declared_offset_distance', 'parsed_stake_type',
        'effective_tolerance_h', 'effective_tolerance_v',
    ];
    for (const key of checks) {
        if (Object.prototype.hasOwnProperty.call(expect, key)) {
            const a = row[key];
            const b = expect[key];
            if (typeof b === 'number' && typeof a === 'number') {
                if (!approxEq(a, b)) return fail(`${key}: expected ${b}, got ${a}`);
            } else if (a !== b) {
                return fail(`${key}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
            }
        }
    }
    if (expect.approx) {
        for (const [key, val] of Object.entries(expect.approx)) {
            if (!approxEq(row[key], val)) {
                return fail(`${key}: expected ≈${val}, got ${row[key]}`);
            }
        }
    }
    if (expect.fieldFitNoteContains !== undefined) {
        if (typeof row.field_fit_note !== 'string' || !row.field_fit_note.includes(expect.fieldFitNoteContains)) {
            return fail(`field_fit_note missing substring "${expect.fieldFitNoteContains}"; got ${JSON.stringify(row.field_fit_note)}`);
        }
    }
    return { ok: true };
}

/**
 * Run all matcher test cases. Returns summary + per-case results.
 *
 * @returns {{
 *   passed: number,
 *   failed: number,
 *   total: number,
 *   results: Array<{ name: string, pass: boolean, reason?: string, row?: object }>,
 * }}
 */
export function runMatcherTests() {
    const results = [];
    let passed = 0;
    let failed = 0;

    for (const tc of TEST_CASES) {
        let row = null;
        let verdict;
        try {
            row = matchStake(tc.parsed, tc.observed, tc.context);
            verdict = evaluate(row, tc.expect);
        } catch (err) {
            verdict = { ok: false, reason: `Threw: ${err && err.message ? err.message : String(err)}` };
        }
        if (verdict.ok) {
            passed++;
            results.push({ name: tc.name, pass: true, row });
        } else {
            failed++;
            results.push({ name: tc.name, pass: false, reason: verdict.reason, row });
        }
    }

    return { passed, failed, total: TEST_CASES.length, results };
}
