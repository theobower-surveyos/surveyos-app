// ============================================================================
// src/components/planview/featureCodeStyles.js
// Canonical feature-code → visual style mapping for DesignPointsPlanView.
// Colors are grouped by utility family (water = blue, storm = teal, etc.)
// so a PM can read a site plan by glance. Shapes further differentiate
// point types within a family (circle = line, square = node, plus = fixture,
// octagon = meter). Stage 13 will wrap this with firm-level custom code
// libraries (FIRM_OVERRIDES map on top of FEATURE_CODE_STYLES).
//
// Not included: control-point codes (CP, BM, TBM, SECCOR, …). Those are
// caught by the classification layer (pointClassification.js) and rendered
// as muted triangles, so they never flow through resolveFeatureStyle.
// ============================================================================

// Palette notes — colors not in the existing CSS-var palette are spelled
// out as hex below with the intended future var name in a comment.
// TODO(stage-13): Promote each color group into a CSS custom property
// (e.g. --feature-water, --feature-storm) so theming can live in one file.

export const FEATURE_CODE_STYLES = Object.freeze({
    // ── Water — deep blue ──
    WL:   { color: '#2563EB', shape: 'circle',   radiusMultiplier: 1.0 }, // water line
    WV:   { color: '#2563EB', shape: 'square',   radiusMultiplier: 1.0 }, // water valve
    FH:   { color: '#2563EB', shape: 'plus',     radiusMultiplier: 1.0 }, // fire hydrant
    WM:   { color: '#2563EB', shape: 'octagon',  radiusMultiplier: 1.0 }, // water meter

    // ── Storm — teal ──
    SD:   { color: '#14B8A6', shape: 'circle',   radiusMultiplier: 1.0 },
    SDMH: { color: '#14B8A6', shape: 'circle',   radiusMultiplier: 1.5 }, // storm manhole
    SDI:  { color: '#14B8A6', shape: 'square',   radiusMultiplier: 1.0 }, // storm inlet
    SCB:  { color: '#14B8A6', shape: 'square',   radiusMultiplier: 1.3 }, // storm catch basin

    // ── Sanitary — green ──
    SS:   { color: '#16A34A', shape: 'circle',   radiusMultiplier: 1.0 },
    SSMH: { color: '#16A34A', shape: 'circle',   radiusMultiplier: 1.5 }, // sanitary manhole
    SCO:  { color: '#16A34A', shape: 'square',   radiusMultiplier: 1.0 }, // cleanout

    // ── Gas — yellow ──
    GL:   { color: '#EAB308', shape: 'circle',   radiusMultiplier: 1.0 },
    GV:   { color: '#EAB308', shape: 'square',   radiusMultiplier: 1.0 },
    GM:   { color: '#EAB308', shape: 'octagon',  radiusMultiplier: 1.0 }, // gas meter

    // ── Electric — red ──
    EL:   { color: '#DC2626', shape: 'circle',   radiusMultiplier: 1.0 },
    ET:   { color: '#DC2626', shape: 'square',   radiusMultiplier: 1.0 }, // electric transformer
    EV:   { color: '#DC2626', shape: 'square',   radiusMultiplier: 1.3 }, // electric vault

    // ── Telecom — purple ──
    TPED: { color: '#9333EA', shape: 'square',   radiusMultiplier: 1.0 }, // telephone pedestal
    TL:   { color: '#9333EA', shape: 'circle',   radiusMultiplier: 1.0 }, // telecom line
    FO:   { color: '#9333EA', shape: 'plus',     radiusMultiplier: 1.0 }, // fiber optic

    // ── Lighting / Signage — amber (--brand-amber) ──
    LP:   { color: '#D4912A', shape: 'plus',     radiusMultiplier: 1.0 }, // light pole
    SP:   { color: '#D4912A', shape: 'square',   radiusMultiplier: 1.0 }, // sign post

    // ── Curb / Concrete — monochrome with orange CL spine ──
    TBC:  { color: '#FFFFFF', shape: 'circle',   radiusMultiplier: 1.0 }, // top back of curb
    EP:   { color: '#9CA3AF', shape: 'circle',   radiusMultiplier: 1.0 }, // edge of pavement
    EW:   { color: '#9CA3AF', shape: 'circle',   radiusMultiplier: 1.0 }, // edge of walk
    CL:   { color: '#F97316', shape: 'circle',   radiusMultiplier: 1.0 }, // centerline (project spine)
    BC:   { color: '#6B7280', shape: 'circle',   radiusMultiplier: 1.0 }, // back of curb
    CR:   { color: '#6B7280', shape: 'circle',   radiusMultiplier: 1.0 }, // curb return
    WC:   { color: '#C026D3', shape: 'square',   radiusMultiplier: 1.0 }, // walk corner (magenta)

    // ── Grading — earth tones ──
    FG:   { color: '#D4B896', shape: 'circle',   radiusMultiplier: 1.0 }, // finish grade
    RG:   { color: '#92725F', shape: 'circle',   radiusMultiplier: 1.0 }, // rough grade
    SG:   { color: '#6B4E3D', shape: 'circle',   radiusMultiplier: 1.0 }, // subgrade

    // ── Trees — green family ──
    CTR:  { color: '#15803D', shape: 'circle',   radiusMultiplier: 1.0 }, // coniferous tree
    DTR:  { color: '#22C55E', shape: 'circle',   radiusMultiplier: 1.0 }, // deciduous tree
    TR:   { color: '#86EFAC', shape: 'circle',   radiusMultiplier: 1.0 }, // generic tree

    // ── Structures ──
    BLD:  { color: '#1F2937', shape: 'square',   radiusMultiplier: 1.0 }, // building
    COL:  { color: '#1F2937', shape: 'circle',   radiusMultiplier: 1.0 }, // column
});

// Neutral fallback for codes we haven't mapped yet. Slightly more
// saturated than the EP/EW light-gray so a PM can tell "unknown code"
// apart from "edge of pavement" at a glance. The `unknown: true`
// sentinel lets consumers tell "got a canonical style" from "got the
// fallback" without a reference-identity comparison.
const UNKNOWN_STYLE = Object.freeze({
    color: '#6B7280',
    shape: 'circle',
    radiusMultiplier: 1.0,
    unknown: true,
});

/**
 * Resolve a feature-code string to its visual style. Matches the exact
 * code first (case-insensitive, trimmed), then falls back to the first
 * token before any separator — so "TBC-2N-H" resolves through "TBC" and
 * still gets the white-curb glyph. Unknown codes return UNKNOWN_STYLE.
 *
 * @param {string | null | undefined} featureCode
 * @returns {{color: string, shape: 'circle'|'square'|'triangle'|'plus'|'octagon', radiusMultiplier: number}}
 */
export function resolveFeatureStyle(featureCode) {
    if (typeof featureCode !== 'string') return UNKNOWN_STYLE;
    const trimmed = featureCode.trim().toUpperCase();
    if (!trimmed) return UNKNOWN_STYLE;
    if (FEATURE_CODE_STYLES[trimmed]) return FEATURE_CODE_STYLES[trimmed];
    // Second chance: first token before separator. Catches codes like
    // "TBC-2N-H" (parsed raw code), "SSMH_01", "TBC 2N", etc.
    const firstToken = trimmed.split(/[\s\-_]/)[0];
    if (firstToken && FEATURE_CODE_STYLES[firstToken]) {
        return FEATURE_CODE_STYLES[firstToken];
    }
    return UNKNOWN_STYLE;
}
