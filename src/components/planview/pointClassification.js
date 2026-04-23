// ============================================================================
// src/components/planview/pointClassification.js
// Partitions a point list into 'control' (monuments, benchmarks, section
// corners — reference geometry) and 'staking' (the actual work). Extracted
// from DesignPointsPlanView so the classification logic is testable in
// isolation and the plan-view component stays under the file-size cap.
// ============================================================================

// Two flavors of match, both case-insensitive after trim + uppercase.
//
// 1. CONTROL_PREFIXES: startsWith match. Every point whose feature code
//    begins with one of these is classified as control, regardless of
//    what follows. In real field data these prefixes are used with wide
//    and firm-specific variations — Theo's test import included codes
//    like "CP_PRI RBCC" (Control Point, Primary, Rebar with Cap) and
//    "BM_SITE" that a strict "CP followed by digits" or "BM exactly"
//    regex silently misses. Loosening to startsWith catches the normal
//    CP / CP1 / CP101 cases plus CP_PRI / CP-MAIN / CPBASE / CP MAIN
//    and anything else firms invent, at the small cost of occasionally
//    flagging an unusual "BMP"-style code as control. That tradeoff is
//    correct: the cost of a misclassified control is cosmetic (muted
//    triangle instead of teal circle, non-selectable), whereas the cost
//    of a missed control is a site that auto-fits across 2 miles of
//    section corners and makes the work zone unreadable.
//    TBM is listed separately from BM because "TBM1" doesn't startWith
//    "BM" — they're independent prefix buckets.
//
// 2. CONTROL_CODES_EXACT: anchored match. Domain-standard control codes
//    whose meaning is fixed and whose common variants don't extend
//    them. If we ever see "SECCOR_NW" in the wild we'll promote SECCOR
//    to the prefix list.
const CONTROL_PREFIXES = ['CP', 'BM', 'TBM'];
const CONTROL_CODES_EXACT = new Set([
    'SM',
    'CORNER',
    'CM',
    'MON',
    'SECTION',
    'SECCOR',
    'QUARTER',
    'PLSS',
    'REBAR',
    'BRASS',
    'BCC',
    'SCS',
    'WC',       // Witness Corner feature code (distinct from the WC stake-type letter)
    'WIT',
    'PROP',     // Property corner
]);

// Spatial-outlier threshold: points farther than OUTLIER_DISTANCE_MULTIPLIER
// × the median distance from the centroid are treated as control even if
// their feature code doesn't match our patterns.
const OUTLIER_DISTANCE_MULTIPLIER = 5;

/**
 * @param {string} code
 * @returns {boolean}
 */
export function controlCodeMatches(code) {
    if (typeof code !== 'string') return false;
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return false;
    for (const prefix of CONTROL_PREFIXES) {
        if (trimmed.startsWith(prefix)) return true;
    }
    return CONTROL_CODES_EXACT.has(trimmed);
}

/**
 * Partition points into 'control' and 'staking'. Three-pass rule:
 *   1. Feature-code match — canonical control identifiers.
 *   2. Spatial outlier fallback — median distance from centroid,
 *      5× multiplier flags outliers as control.
 *   3. If every point would be control (pure control-network survey),
 *      demote everyone back to staking so the canvas isn't empty.
 *
 * @param {Array<{id:string, feature_code?:string, raw_code?:string,
 *                northing?:number, easting?:number}>} points
 * @returns {Map<string, 'control'|'staking'>}
 */
export function classifyPoints(points) {
    const classification = new Map();
    const list = Array.isArray(points) ? points : [];

    // Rule 1 — feature-code match
    for (const p of list) {
        const code = p.feature_code || p.raw_code || '';
        if (controlCodeMatches(code)) classification.set(p.id, 'control');
    }

    // Rule 2 — spatial outliers among the remainder
    const remainder = list.filter(
        (p) =>
            !classification.has(p.id) &&
            typeof p.northing === 'number' &&
            typeof p.easting === 'number',
    );
    if (remainder.length >= 4) {
        let cx = 0;
        let cy = 0;
        for (const p of remainder) {
            cx += p.easting;
            cy += p.northing;
        }
        cx /= remainder.length;
        cy /= remainder.length;
        const distances = remainder.map((p) => {
            const dx = p.easting - cx;
            const dy = p.northing - cy;
            return Math.sqrt(dx * dx + dy * dy);
        });
        const sorted = [...distances].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)] || 1;
        const threshold = median * OUTLIER_DISTANCE_MULTIPLIER;
        for (let i = 0; i < remainder.length; i++) {
            if (distances[i] > threshold) {
                classification.set(remainder[i].id, 'control');
            }
        }
    }

    // Rule 3 — backfill staking for every id not yet classified
    for (const p of list) {
        if (!classification.has(p.id)) classification.set(p.id, 'staking');
    }

    // Edge case — if every point ended up as control, demote them all so
    // the user has something to work with on a pure control-network job.
    const values = [...classification.values()];
    if (values.length > 0 && values.every((v) => v === 'control')) {
        for (const key of classification.keys()) classification.set(key, 'staking');
    }

    return classification;
}
