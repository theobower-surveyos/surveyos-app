// ============================================================================
// src/components/planview/featureCodeGroups.js
// Feature-code → grouping used by the canvas filter chips and the legend
// panel. Canonical order — don't re-sort. `codes: null` is a sentinel that
// pulls from a different source: the 'control' group uses classification
// output, and 'unknown' uses the featureCodeStyles unknown-fallback flag.
// ============================================================================

export const FEATURE_GROUPS = Object.freeze([
    { id: 'control',    label: 'Control',    codes: null,                                              isControl: true },
    { id: 'water',      label: 'Water',      codes: ['WL', 'WV', 'FH', 'WM'] },
    { id: 'storm',      label: 'Storm',      codes: ['SD', 'SDMH', 'SDI', 'SCB'] },
    { id: 'sanitary',   label: 'Sanitary',   codes: ['SS', 'SSMH', 'SCO'] },
    { id: 'gas',        label: 'Gas',        codes: ['GL', 'GV', 'GM'] },
    { id: 'electric',   label: 'Electric',   codes: ['EL', 'ET', 'EV'] },
    { id: 'telecom',    label: 'Telecom',    codes: ['TPED', 'TL', 'FO'] },
    { id: 'lighting',   label: 'Lighting',   codes: ['LP', 'SP'] },
    { id: 'curb',       label: 'Curb',       codes: ['TBC', 'EP', 'EW', 'CL', 'BC', 'CR', 'WC'] },
    { id: 'grading',    label: 'Grading',    codes: ['FG', 'RG', 'SG'] },
    { id: 'trees',      label: 'Trees',      codes: ['CTR', 'DTR', 'TR'] },
    { id: 'structures', label: 'Structures', codes: ['BLD', 'COL'] },
    { id: 'unknown',    label: 'Unknown',    codes: null,                                              isUnknown: true },
]);

// Lookup: feature code → group id. Built once at module load.
const CODE_TO_GROUP = (() => {
    const out = {};
    for (const g of FEATURE_GROUPS) {
        if (Array.isArray(g.codes)) {
            for (const c of g.codes) out[c] = g.id;
        }
    }
    return out;
})();

/**
 * Resolve a point to its FEATURE_GROUPS.id. Control classification wins
 * when present; otherwise feature_code is matched exactly, then via the
 * first-token split ("TBC-2N-H" → "TBC"); falls back to 'unknown'.
 *
 * @param {{id:string, feature_code?:string}} point
 * @param {Map<string,'control'|'staking'>} classification
 * @returns {string} one of FEATURE_GROUPS[].id
 */
export function classifyPointToGroup(point, classification) {
    if (classification && classification.get(point.id) === 'control') return 'control';
    const raw = (point.feature_code || '').trim().toUpperCase();
    if (!raw) return 'unknown';
    if (CODE_TO_GROUP[raw]) return CODE_TO_GROUP[raw];
    const firstToken = raw.split(/[\s\-_]/)[0];
    if (firstToken && CODE_TO_GROUP[firstToken]) return CODE_TO_GROUP[firstToken];
    return 'unknown';
}

// Helper exported for the FeatureLegend panel so it can iterate the
// ordered list alongside the code-style lookup.
export const FEATURE_GROUP_IDS = FEATURE_GROUPS.map((g) => g.id);
