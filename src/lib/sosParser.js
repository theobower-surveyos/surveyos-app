// ============================================================================
// src/lib/sosParser.js
// SurveyOS Stake Code parser (SOS v1).
//
// Parses as-staked description codes returned from the field into
// structured, QC-ready data. SOS is a canonical stake-code grammar
// that crews adopt for SurveyOS compatibility — see
// docs/sos-stake-code-standard.md for the authoritative specification.
//
// This module is pure. No React, no Supabase, no I/O. Deterministic.
// The function never throws — invalid input always produces a
// parse_error result with an actionable error message.
//
// Distinct from src/utils/stakeoutQC.js#parseStakeCode, which parses
// the SurveyOS DESIGN feature-code grammar (TBC-5-H) — a separate
// domain (design intent vs. as-staked description).
// ============================================================================

export const VALID_STAKE_TYPES = [
    'HUB',
    'LATHE',
    'NAIL',
    'PK',
    'MAG',
    'PAINT',
    'CP',
    'WHISKER',
];

const VALID_STAKE_SET = new Set(VALID_STAKE_TYPES);

// Design IDs are alphanumeric plus underscores. No dashes (dashes are
// the field separator), no colons (colon separates line-stake endpoints).
const DESIGN_ID_REGEX = /^[A-Za-z0-9_]+$/;

// Legacy detection — the FT suffix was common in pre-SOS codes.
const LEGACY_FT_REGEX = /\d+FT\b/i;

/**
 * @typedef {Object} ParsedStake
 * @property {'point_stake'|'line_stake'|'check_shot'|'control_check'|'parse_error'} type
 * @property {string[]} design_refs
 * @property {number|null} offset
 * @property {string|null} stake
 * @property {string} raw
 * @property {string} [error]
 */

function parseError(raw, message) {
    return {
        type: 'parse_error',
        design_refs: [],
        offset: null,
        stake: null,
        raw,
        error: message,
    };
}

function validateDesignId(id) {
    if (!id) return 'Empty design ID';
    if (!DESIGN_ID_REGEX.test(id)) {
        return `Invalid design ID '${id}' — only letters, numbers, and underscores allowed.`;
    }
    return null;
}

function validateStakeType(raw) {
    const upper = raw.toUpperCase();
    if (!VALID_STAKE_SET.has(upper)) {
        return {
            error: `Unknown stake type '${raw}'. Valid: ${VALID_STAKE_TYPES.join(', ')}.`,
        };
    }
    return { value: upper };
}

function validateOffset(raw) {
    if (raw === '' || raw == null) {
        return { error: 'Missing offset' };
    }
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
        return { error: `Invalid offset '${raw}' — expected a non-negative number (e.g., 0, 5, 11.5).` };
    }
    if (n < 0) {
        return { error: `Negative offset '${raw}' — offsets must be non-negative.` };
    }
    // Guard against trailing junk after the number (e.g., '5FT' would parse to 5).
    // parseFloat is lenient; verify the string is a clean numeric literal.
    if (!/^\d+(\.\d+)?$/.test(raw)) {
        return { error: `Invalid offset '${raw}' — expected a plain number without units.` };
    }
    return { value: n };
}

/**
 * Parse a single SOS code string. Never throws.
 *
 * @param {string} raw
 * @returns {ParsedStake}
 */
export function parseStakeCode(raw) {
    const rawOut = typeof raw === 'string' ? raw : '';

    if (typeof raw !== 'string') {
        return parseError(rawOut, 'Empty input.');
    }

    const trimmed = raw.trim();
    if (trimmed === '') {
        return parseError(rawOut, 'Empty input.');
    }

    // Internal whitespace is a legacy-format tell (e.g., "4003 - 4002 - 11FT LUP").
    if (/\s/.test(trimmed)) {
        return parseError(
            rawOut,
            'Legacy format: SOS codes cannot contain spaces. Expected format like 4007-5-HUB or 4003:4002-11-NAIL.',
        );
    }

    // Legacy FT suffix on the offset.
    if (LEGACY_FT_REGEX.test(trimmed)) {
        return parseError(
            rawOut,
            "Legacy FT suffix not supported. Omit 'FT' — SOS offsets are always in feet.",
        );
    }

    // ── Control check: CP-CHK (case-insensitive, exact) ────────────
    if (trimmed.toUpperCase() === 'CP-CHK') {
        return {
            type: 'control_check',
            design_refs: [],
            offset: null,
            stake: null,
            raw: rawOut,
        };
    }

    // ── Check shot: <design_id>-CHK (case-insensitive suffix) ──────
    if (/-CHK$/i.test(trimmed)) {
        const designId = trimmed.slice(0, trimmed.length - 4); // strip '-CHK'
        const idError = validateDesignId(designId);
        if (idError) {
            return parseError(rawOut, idError);
        }
        return {
            type: 'check_shot',
            design_refs: [designId],
            offset: null,
            stake: null,
            raw: rawOut,
        };
    }

    // ── Line stake: first segment contains ':' ─────────────────────
    const parts = trimmed.split('-');
    const firstSegmentHasColon = parts[0] && parts[0].includes(':');

    if (firstSegmentHasColon) {
        if (parts.length !== 3) {
            return parseError(
                rawOut,
                `Malformed line stake '${trimmed}'. Expected format: <id1>:<id2>-<offset>-<stake>.`,
            );
        }
        const endpoints = parts[0].split(':');
        if (endpoints.length !== 2) {
            return parseError(
                rawOut,
                `Line stake must have exactly two design IDs separated by ':'. Got '${parts[0]}'.`,
            );
        }
        for (const id of endpoints) {
            const err = validateDesignId(id);
            if (err) return parseError(rawOut, err);
        }
        const offsetResult = validateOffset(parts[1]);
        if (offsetResult.error) return parseError(rawOut, offsetResult.error);
        const stakeResult = validateStakeType(parts[2]);
        if (stakeResult.error) return parseError(rawOut, stakeResult.error);
        return {
            type: 'line_stake',
            design_refs: endpoints,
            offset: offsetResult.value,
            stake: stakeResult.value,
            raw: rawOut,
        };
    }

    // ── Point stake: exactly 3 parts, no colons ────────────────────
    if (parts.length !== 3) {
        return parseError(
            rawOut,
            `Malformed code '${trimmed}'. Expected format: <design_id>-<offset>-<stake>.`,
        );
    }
    // Guard against empty segments (e.g., "4007--5-HUB" splits into ['4007', '', '5', 'HUB']
    // but that's a 4-part split — already caught above. "-5-HUB" would give ['','5','HUB'].)
    if (parts.some((p) => p === '')) {
        return parseError(
            rawOut,
            `Malformed code '${trimmed}' — empty segment between dashes.`,
        );
    }
    const idErr = validateDesignId(parts[0]);
    if (idErr) return parseError(rawOut, idErr);
    const offsetResult = validateOffset(parts[1]);
    if (offsetResult.error) return parseError(rawOut, offsetResult.error);
    const stakeResult = validateStakeType(parts[2]);
    if (stakeResult.error) return parseError(rawOut, stakeResult.error);

    return {
        type: 'point_stake',
        design_refs: [parts[0]],
        offset: offsetResult.value,
        stake: stakeResult.value,
        raw: rawOut,
    };
}

/**
 * Batch parse — convenience for CSV row arrays.
 * @param {string[]} rawList
 * @returns {ParsedStake[]}
 */
export function parseStakeCodes(rawList) {
    if (!Array.isArray(rawList)) return [];
    return rawList.map(parseStakeCode);
}
