// ============================================================================
// src/lib/sosMatcher.js
// SurveyOS stakeout matcher (Stage 10.2).
//
// Consumes parsed SOS codes + observed coordinates and an assignment's
// design context, and emits a row-ready object for insertion into
// stakeout_qc_points. Dispatches on parsed.type across the four SOS
// grammar forms plus parse_error passthrough.
//
// This module is pure. No React, no Supabase, no I/O, no network. It
// does not fetch or mutate anything — the caller (sosProcessRun.js)
// assembles the AssignmentContext and writes the rows.
//
// ── Conventions ────────────────────────────────────────────────────
//
// actual_offset_direction is stored as free text after migration 16:
//
//   • point_stake / check_shot / control_check — decimal-degree
//     bearing from design point to observed point, measured clockwise
//     from north. Example: "45.2", "270.0". Null when the observation
//     sits on top of the design point (sub-0.001ft horizontal).
//   • line_stake — the literal string "perpendicular". Line-stake
//     matching is side-agnostic in MVP (see CLAUDE_JOURNAL.md, Stage
//     10 product decisions).
//
// h_status values produced by the matcher:
//   • in_tol / out_of_tol — point_stake and line_stake
//   • check_pass / check_fail — check_shot and control_check (matched)
//   • unmatched — unmatched_bonus + parse_error
//   • unmatched_check — control_check with 0 or >1 spatial matches
//   • parse_error — rows that entered with parsed.type === 'parse_error'
//
// v_status values produced by the matcher:
//   • in_tol / out_of_tol — point_stake and line_stake (when elevations
//     are available on both design and observed)
//   • check_pass / check_fail — check_shot and control_check (matched)
//   • null — parse_error, unmatched_bonus, unmatched_check, or any
//     row without a usable observed/design elevation pair
//
// Tolerance resolution chain (horizontal or vertical, same order):
//     assignment-point override → assignment default → library default
//
// The library defaults are H_TOLERANCE_DEFAULT and V_TOLERANCE_DEFAULT
// (0.060 ft and 0.030 ft), which mirror migration 13's firm defaults.
// ============================================================================

export const H_TOLERANCE_DEFAULT = 0.060; // feet
export const V_TOLERANCE_DEFAULT = 0.030; // feet
export const CONTROL_CHECK_RADIUS = 2.0;  // feet — CP-CHK matching radius


// ── Shape definitions (JSDoc) ─────────────────────────────────────────────
/**
 * @typedef {Object} ParsedStake
 * @property {'point_stake'|'line_stake'|'check_shot'|'control_check'|'parse_error'} type
 * @property {string[]} design_refs
 * @property {number|null} offset
 * @property {string|null} stake
 * @property {string} raw
 * @property {string} [error]
 */

/**
 * @typedef {Object} ObservedPoint
 * @property {string} observed_point_id
 * @property {number} observed_northing
 * @property {number} observed_easting
 * @property {number|null} observed_elevation
 * @property {string|null} [observed_at]
 * @property {string} raw_code
 */

/**
 * @typedef {Object} DesignPointRow
 * @property {string} id               // uuid
 * @property {string} point_id         // user-facing text identifier
 * @property {string|null} feature_code
 * @property {number} northing
 * @property {number} easting
 * @property {number|null} elevation
 * @property {number|null} [tolerance_h_override]
 * @property {number|null} [tolerance_v_override]
 */

/**
 * @typedef {Object} AssignmentPointRow
 * @property {string} design_point_id
 * @property {number|null} [override_offset_distance]
 * @property {string|null} [override_offset_direction]
 * @property {string|null} [override_stake_type]
 * @property {number|null} [override_tolerance_h]
 * @property {number|null} [override_tolerance_v]
 */

/**
 * @typedef {Object} AssignmentDefaults
 * @property {number|null} [default_offset_distance]
 * @property {string|null} [default_offset_direction]
 * @property {string|null} [default_stake_type]
 * @property {number|null} [default_tolerance_h]
 * @property {number|null} [default_tolerance_v]
 */

/**
 * @typedef {Object} PriorObservation
 * @property {string} observed_point_id
 * @property {number} observed_northing
 * @property {number} observed_easting
 * @property {number|null} observed_elevation
 * @property {string} [run_id]
 */

/**
 * @typedef {Object} AssignmentContext
 * @property {string} assignmentId
 * @property {DesignPointRow[]} designPoints
 * @property {AssignmentPointRow[]} assignmentPoints
 * @property {AssignmentDefaults} defaults
 * @property {DesignPointRow[]} [projectControls]
 * @property {PriorObservation[]} [priorObservations]
 */

/**
 * Row shape returned by every matcher. Caller fills run_id and
 * assignment_id before insert.
 *
 * @typedef {Object} QcRow
 * @property {string|null} design_point_id
 * @property {string|null} design_point_id_b
 * @property {string} observed_point_id
 * @property {number} observed_northing
 * @property {number} observed_easting
 * @property {number|null} observed_elevation
 * @property {string} raw_code
 * @property {string|null} parsed_feature
 * @property {number|null} parsed_offset_distance
 * @property {string|null} parsed_stake_type
 * @property {number|null} declared_offset_distance
 * @property {string|null} declared_offset_direction
 * @property {string|null} declared_stake_type
 * @property {number|null} actual_offset_distance
 * @property {string|null} actual_offset_direction
 * @property {number|null} offset_variance
 * @property {number|null} delta_n
 * @property {number|null} delta_e
 * @property {number|null} delta_z
 * @property {number|null} delta_h
 * @property {number|null} effective_tolerance_h
 * @property {number|null} effective_tolerance_v
 * @property {string} h_status
 * @property {string|null} v_status
 * @property {string|null} field_fit_note
 * @property {string|null} observed_at
 * @property {string} shot_type
 */


// ── Helpers ───────────────────────────────────────────────────────────────

function toNum(v) {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function distance2d(n1, e1, n2, e2) {
    const dn = n1 - n2;
    const de = e1 - e2;
    return Math.sqrt(dn * dn + de * de);
}

/**
 * Compass bearing in decimal degrees from A to B, measured clockwise
 * from north. Returns null when A and B are sub-0.001ft apart.
 */
function bearingDeg(fromN, fromE, toN, toE) {
    const dn = toN - fromN;
    const de = toE - fromE;
    if (Math.abs(dn) < 1e-6 && Math.abs(de) < 1e-6) return null;
    // atan2(de, dn) gives angle from north-axis, CCW positive in a
    // math sense. We want clockwise from north (compass convention),
    // so we leave sign flipping out: atan2(de, dn) already yields
    // positive when point is east of north, which is the compass
    // direction we want. Normalize into [0, 360).
    let deg = (Math.atan2(de, dn) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
}

function fmtBearing(deg) {
    if (deg == null) return null;
    return deg.toFixed(1);
}

function findDesignPoint(points, pointIdText) {
    if (!Array.isArray(points) || !pointIdText) return null;
    const target = String(pointIdText);
    for (const dp of points) {
        if (dp && String(dp.point_id) === target) return dp;
    }
    return null;
}

function findAssignmentPoint(assignmentPoints, designPointId) {
    if (!Array.isArray(assignmentPoints) || !designPointId) return null;
    for (const ap of assignmentPoints) {
        if (ap && ap.design_point_id === designPointId) return ap;
    }
    return null;
}

/**
 * Resolve an effective horizontal tolerance via the override chain.
 * Per-point override → assignment default → library default.
 */
function resolveToleranceH(ap, defaults) {
    const apVal = toNum(ap?.override_tolerance_h);
    if (apVal != null) return apVal;
    const defVal = toNum(defaults?.default_tolerance_h);
    if (defVal != null) return defVal;
    return H_TOLERANCE_DEFAULT;
}

function resolveToleranceV(ap, defaults) {
    const apVal = toNum(ap?.override_tolerance_v);
    if (apVal != null) return apVal;
    const defVal = toNum(defaults?.default_tolerance_v);
    if (defVal != null) return defVal;
    return V_TOLERANCE_DEFAULT;
}

/**
 * Resolve the declared offset distance. Per-point override wins over
 * assignment default. If neither is set, the parsed offset from the
 * SOS code is what the chief declared was intended — falls through.
 */
function resolveDeclaredOffset(ap, defaults, parsed) {
    const apVal = toNum(ap?.override_offset_distance);
    if (apVal != null) return apVal;
    const defVal = toNum(defaults?.default_offset_distance);
    if (defVal != null) return defVal;
    return toNum(parsed?.offset);
}

function resolveDeclaredOffsetDirection(ap, defaults) {
    if (ap?.override_offset_direction) return ap.override_offset_direction;
    if (defaults?.default_offset_direction) return defaults.default_offset_direction;
    return null;
}

function resolveDeclaredStakeType(ap, defaults, parsed) {
    if (ap?.override_stake_type) return ap.override_stake_type;
    if (defaults?.default_stake_type) return defaults.default_stake_type;
    return parsed?.stake || null;
}

function baseRowFromObservation(observed) {
    return {
        design_point_id: null,
        design_point_id_b: null,
        observed_point_id: observed.observed_point_id,
        observed_northing: observed.observed_northing,
        observed_easting: observed.observed_easting,
        observed_elevation: observed.observed_elevation ?? null,
        raw_code: observed.raw_code,
        parsed_feature: null,
        parsed_offset_distance: null,
        parsed_stake_type: null,
        declared_offset_distance: null,
        declared_offset_direction: null,
        declared_stake_type: null,
        actual_offset_distance: null,
        actual_offset_direction: null,
        offset_variance: null,
        delta_n: null,
        delta_e: null,
        delta_z: null,
        delta_h: null,
        effective_tolerance_h: null,
        effective_tolerance_v: null,
        h_status: 'pending',
        v_status: null,
        field_fit_note: null,
        observed_at: observed.observed_at ?? null,
        shot_type: 'unmatched_bonus',
    };
}


// ── Matchers ──────────────────────────────────────────────────────────────

function matchPointStake(parsed, observed, ctx) {
    const designId = parsed.design_refs?.[0];
    const dp = findDesignPoint(ctx.designPoints, designId);
    if (!dp) {
        return buildUnmatchedBonus(parsed, observed, `Design point '${designId}' not in assignment.`);
    }

    const ap = findAssignmentPoint(ctx.assignmentPoints, dp.id);
    const declaredOffset = resolveDeclaredOffset(ap, ctx.defaults, parsed);
    const declaredDir = resolveDeclaredOffsetDirection(ap, ctx.defaults);
    const declaredStake = resolveDeclaredStakeType(ap, ctx.defaults, parsed);
    const tolH = resolveToleranceH(ap, ctx.defaults);
    const tolV = resolveToleranceV(ap, ctx.defaults);

    const obsN = toNum(observed.observed_northing);
    const obsE = toNum(observed.observed_easting);
    const obsZ = toNum(observed.observed_elevation);
    const dN = toNum(dp.northing);
    const dE = toNum(dp.easting);
    const dZ = toNum(dp.elevation);

    const actualOffset = distance2d(obsN, obsE, dN, dE);
    const offsetVariance = declaredOffset != null ? actualOffset - declaredOffset : null;
    const deltaH = offsetVariance != null ? Math.abs(offsetVariance) : actualOffset;
    const deltaN = obsN - dN;
    const deltaE = obsE - dE;
    const deltaZ = (obsZ != null && dZ != null) ? (obsZ - dZ) : null;

    const hStatus = deltaH <= tolH ? 'in_tol' : 'out_of_tol';
    const vStatus = deltaZ != null ? (Math.abs(deltaZ) <= tolV ? 'in_tol' : 'out_of_tol') : null;

    return {
        ...baseRowFromObservation(observed),
        design_point_id: dp.id,
        parsed_feature: dp.feature_code || null,
        parsed_offset_distance: toNum(parsed.offset),
        parsed_stake_type: parsed.stake || null,
        declared_offset_distance: declaredOffset,
        declared_offset_direction: declaredDir,
        declared_stake_type: declaredStake,
        actual_offset_distance: actualOffset,
        actual_offset_direction: fmtBearing(bearingDeg(dN, dE, obsN, obsE)),
        offset_variance: offsetVariance,
        delta_n: deltaN,
        delta_e: deltaE,
        delta_z: deltaZ,
        delta_h: deltaH,
        effective_tolerance_h: tolH,
        effective_tolerance_v: tolV,
        h_status: hStatus,
        v_status: vStatus,
        shot_type: 'point_stake',
    };
}

function matchLineStake(parsed, observed, ctx) {
    const idA = parsed.design_refs?.[0];
    const idB = parsed.design_refs?.[1];
    const dpA = findDesignPoint(ctx.designPoints, idA);
    const dpB = findDesignPoint(ctx.designPoints, idB);
    if (!dpA || !dpB) {
        const missing = !dpA ? idA : idB;
        return buildUnmatchedBonus(parsed, observed, `Line-stake endpoint '${missing}' not in assignment.`);
    }

    // Tolerance comes from endpoint A's assignment-point override if
    // present, else assignment default, else library default. Line
    // stakes don't have their own assignment_points row; treating A
    // as the representative point matches how PMs author these.
    const apA = findAssignmentPoint(ctx.assignmentPoints, dpA.id);
    const tolH = resolveToleranceH(apA, ctx.defaults);
    const tolV = resolveToleranceV(apA, ctx.defaults);
    const declaredStake = parsed.stake || resolveDeclaredStakeType(apA, ctx.defaults, parsed);

    const obsN = toNum(observed.observed_northing);
    const obsE = toNum(observed.observed_easting);
    const obsZ = toNum(observed.observed_elevation);
    const aN = toNum(dpA.northing);
    const aE = toNum(dpA.easting);
    const bN = toNum(dpB.northing);
    const bE = toNum(dpB.easting);

    // Parametric projection onto segment AB. `t` in [0,1] means the
    // foot of the perpendicular lies between A and B.
    const abN = bN - aN;
    const abE = bE - aE;
    const abLenSq = abN * abN + abE * abE;

    let t = 0;
    let projN = aN;
    let projE = aE;
    if (abLenSq > 1e-9) {
        const apN = obsN - aN;
        const apE = obsE - aE;
        t = (apN * abN + apE * abE) / abLenSq;
        projN = aN + t * abN;
        projE = aE + t * abE;
    }

    const actualOffset = distance2d(obsN, obsE, projN, projE);
    const declaredOffset = toNum(parsed.offset);
    const offsetVariance = declaredOffset != null ? actualOffset - declaredOffset : null;
    const deltaH = offsetVariance != null ? Math.abs(offsetVariance) : actualOffset;
    const deltaN = obsN - projN;
    const deltaE = obsE - projE;

    // Interpolated elevation along the line when both endpoints carry one.
    const aZ = toNum(dpA.elevation);
    const bZ = toNum(dpB.elevation);
    let designZ = null;
    if (aZ != null && bZ != null) {
        designZ = aZ + t * (bZ - aZ);
    }
    const deltaZ = (obsZ != null && designZ != null) ? (obsZ - designZ) : null;

    const hStatus = deltaH <= tolH ? 'in_tol' : 'out_of_tol';
    const vStatus = deltaZ != null ? (Math.abs(deltaZ) <= tolV ? 'in_tol' : 'out_of_tol') : null;

    const offSegment = t < 0 || t > 1;
    const note = offSegment
        ? `Observation projects outside line segment endpoints (t=${t.toFixed(2)}). QC computed anyway; review needed.`
        : null;

    return {
        ...baseRowFromObservation(observed),
        design_point_id: dpA.id,
        design_point_id_b: dpB.id,
        parsed_feature: dpA.feature_code || null,
        parsed_offset_distance: toNum(parsed.offset),
        parsed_stake_type: parsed.stake || null,
        declared_offset_distance: declaredOffset,
        declared_offset_direction: 'perpendicular',
        declared_stake_type: declaredStake,
        actual_offset_distance: actualOffset,
        actual_offset_direction: 'perpendicular',
        offset_variance: offsetVariance,
        delta_n: deltaN,
        delta_e: deltaE,
        delta_z: deltaZ,
        delta_h: deltaH,
        effective_tolerance_h: tolH,
        effective_tolerance_v: tolV,
        h_status: hStatus,
        v_status: vStatus,
        field_fit_note: note,
        shot_type: 'line_stake',
    };
}

function matchCheckShot(parsed, observed, ctx) {
    const designId = parsed.design_refs?.[0];
    // Check shots may reference any point the chief has staked or any
    // control in the project. Search assignment points first; if not
    // found, fall back to project-wide controls so a chief can check
    // against a neighbouring assignment's control monument.
    let dp = findDesignPoint(ctx.designPoints, designId);
    if (!dp && Array.isArray(ctx.projectControls)) {
        dp = findDesignPoint(ctx.projectControls, designId);
    }
    if (!dp) {
        return {
            ...baseRowFromObservation(observed),
            parsed_feature: null,
            parsed_stake_type: null,
            h_status: 'unmatched_check',
            shot_type: 'unmatched_check',
            field_fit_note: `Check-shot reference '${designId}' not found in assignment or project controls.`,
        };
    }

    const ap = findAssignmentPoint(ctx.assignmentPoints, dp.id);
    const tolH = resolveToleranceH(ap, ctx.defaults);
    const tolV = resolveToleranceV(ap, ctx.defaults);

    const obsN = toNum(observed.observed_northing);
    const obsE = toNum(observed.observed_easting);
    const obsZ = toNum(observed.observed_elevation);
    const dN = toNum(dp.northing);
    const dE = toNum(dp.easting);
    const dZ = toNum(dp.elevation);

    const deltaN = obsN - dN;
    const deltaE = obsE - dE;
    const deltaH = distance2d(obsN, obsE, dN, dE);
    const deltaZ = (obsZ != null && dZ != null) ? (obsZ - dZ) : null;

    const hStatus = deltaH <= tolH ? 'check_pass' : 'check_fail';
    const vStatus = deltaZ != null ? (Math.abs(deltaZ) <= tolV ? 'check_pass' : 'check_fail') : null;

    return {
        ...baseRowFromObservation(observed),
        design_point_id: dp.id,
        parsed_feature: dp.feature_code || null,
        parsed_stake_type: null,
        declared_offset_distance: null,
        declared_offset_direction: null,
        declared_stake_type: null,
        actual_offset_distance: null,
        actual_offset_direction: fmtBearing(bearingDeg(dN, dE, obsN, obsE)),
        offset_variance: null,
        delta_n: deltaN,
        delta_e: deltaE,
        delta_z: deltaZ,
        delta_h: deltaH,
        effective_tolerance_h: tolH,
        effective_tolerance_v: tolV,
        h_status: hStatus,
        v_status: vStatus,
        shot_type: 'check_shot',
    };
}

function matchControlCheck(parsed, observed, ctx) {
    const obsN = toNum(observed.observed_northing);
    const obsE = toNum(observed.observed_easting);
    const obsZ = toNum(observed.observed_elevation);

    // Candidate pool: project controls + prior observations (any
    // point the chief may have set on earlier days). Both are tagged
    // with a `kind` so field_fit_note can disambiguate the match.
    const candidates = [];
    if (Array.isArray(ctx.projectControls)) {
        for (const dp of ctx.projectControls) {
            const d = distance2d(obsN, obsE, toNum(dp.northing), toNum(dp.easting));
            if (d <= CONTROL_CHECK_RADIUS) {
                candidates.push({ kind: 'control', ref: dp, distance: d });
            }
        }
    }
    if (Array.isArray(ctx.priorObservations)) {
        for (const po of ctx.priorObservations) {
            const d = distance2d(obsN, obsE, toNum(po.observed_northing), toNum(po.observed_easting));
            if (d <= CONTROL_CHECK_RADIUS) {
                candidates.push({ kind: 'prior', ref: po, distance: d });
            }
        }
    }

    if (candidates.length === 0) {
        return {
            ...baseRowFromObservation(observed),
            h_status: 'unmatched_check',
            shot_type: 'unmatched_check',
            field_fit_note: `No control point or prior observation within ${CONTROL_CHECK_RADIUS.toFixed(1)}ft.`,
        };
    }

    if (candidates.length > 1) {
        candidates.sort((a, b) => a.distance - b.distance);
        const list = candidates.map((c) => {
            if (c.kind === 'control') return `${c.ref.point_id} (${c.distance.toFixed(2)}ft)`;
            return `obs ${c.ref.observed_point_id} (${c.distance.toFixed(2)}ft)`;
        }).join(', ');
        return {
            ...baseRowFromObservation(observed),
            h_status: 'unmatched_check',
            shot_type: 'unmatched_check',
            field_fit_note: `Multiple candidates within ${CONTROL_CHECK_RADIUS.toFixed(1)}ft: ${list}. PM resolution needed.`,
        };
    }

    const match = candidates[0];
    const matchN = match.kind === 'control' ? toNum(match.ref.northing) : toNum(match.ref.observed_northing);
    const matchE = match.kind === 'control' ? toNum(match.ref.easting) : toNum(match.ref.observed_easting);
    const matchZ = match.kind === 'control' ? toNum(match.ref.elevation) : toNum(match.ref.observed_elevation);

    // No per-point override for spatial matches; use library defaults
    // (firm-level tolerance is applied at the view/reporting layer).
    const tolH = resolveToleranceH(null, ctx.defaults);
    const tolV = resolveToleranceV(null, ctx.defaults);

    const deltaN = obsN - matchN;
    const deltaE = obsE - matchE;
    const deltaH = distance2d(obsN, obsE, matchN, matchE);
    const deltaZ = (obsZ != null && matchZ != null) ? (obsZ - matchZ) : null;

    const hStatus = deltaH <= tolH ? 'check_pass' : 'check_fail';
    const vStatus = deltaZ != null ? (Math.abs(deltaZ) <= tolV ? 'check_pass' : 'check_fail') : null;

    const note = match.kind === 'prior'
        ? `Matched to prior observation ${match.ref.observed_point_id}${match.ref.run_id ? ` from run ${match.ref.run_id}` : ''}.`
        : null;

    return {
        ...baseRowFromObservation(observed),
        design_point_id: match.kind === 'control' ? match.ref.id : null,
        parsed_feature: match.kind === 'control' ? (match.ref.feature_code || null) : null,
        parsed_stake_type: null,
        declared_offset_distance: null,
        declared_offset_direction: null,
        declared_stake_type: null,
        actual_offset_distance: null,
        actual_offset_direction: fmtBearing(bearingDeg(matchN, matchE, obsN, obsE)),
        offset_variance: null,
        delta_n: deltaN,
        delta_e: deltaE,
        delta_z: deltaZ,
        delta_h: deltaH,
        effective_tolerance_h: tolH,
        effective_tolerance_v: tolV,
        h_status: hStatus,
        v_status: vStatus,
        field_fit_note: note,
        shot_type: 'control_check',
    };
}

function buildUnmatchedBonus(parsed, observed, reason) {
    return {
        ...baseRowFromObservation(observed),
        parsed_feature: null,
        parsed_offset_distance: toNum(parsed.offset),
        parsed_stake_type: parsed.stake || null,
        h_status: 'unmatched',
        v_status: null,
        shot_type: 'unmatched_bonus',
        field_fit_note: reason || null,
    };
}

function buildParseErrorRow(parsed, observed) {
    return {
        ...baseRowFromObservation(observed),
        h_status: 'parse_error',
        v_status: null,
        shot_type: 'parse_error',
        field_fit_note: parsed?.error || 'Parse error.',
    };
}


// ── Public API ────────────────────────────────────────────────────────────

/**
 * Dispatch a single parsed+observed pair to the right matcher. Returns
 * a row-ready object for stakeout_qc_points insertion. run_id and
 * assignment_id are the caller's responsibility to attach.
 *
 * @param {ParsedStake} parsed
 * @param {ObservedPoint} observed
 * @param {AssignmentContext} assignmentContext
 * @returns {QcRow}
 */
export function matchStake(parsed, observed, assignmentContext) {
    const ctx = assignmentContext || { designPoints: [], assignmentPoints: [], defaults: {} };
    const p = parsed || { type: 'parse_error', error: 'Missing parsed input.' };

    switch (p.type) {
        case 'point_stake':    return matchPointStake(p, observed, ctx);
        case 'line_stake':     return matchLineStake(p, observed, ctx);
        case 'check_shot':     return matchCheckShot(p, observed, ctx);
        case 'control_check':  return matchControlCheck(p, observed, ctx);
        case 'parse_error':    return buildParseErrorRow(p, observed);
        default:
            return buildParseErrorRow({ ...p, error: `Unknown parsed type: ${p.type}` }, observed);
    }
}
