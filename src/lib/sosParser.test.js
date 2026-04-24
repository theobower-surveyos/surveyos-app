// ============================================================================
// src/lib/sosParser.test.js
// Self-contained test suite for sosParser.js. Exports runTests() so the
// in-browser dev tester (SosParserTester.jsx) can invoke it and show a
// live pass/fail count. Data-driven: every case is a row in TEST_CASES.
//
// Not yet wired to Vitest — `npm run test` will scan this file but find
// no describe/it/test calls, which is a benign "no tests" warning. A
// future polish pass can add a Vitest wrapper that consumes TEST_CASES.
// ============================================================================

import { parseStakeCode } from './sosParser.js';

/**
 * Each case is:
 *   {
 *     name: string,
 *     input: any (usually a string, sometimes null/undefined for error cases),
 *     expect: {
 *       type: ...,
 *       design_refs?: string[],
 *       offset?: number|null,
 *       stake?: string|null,
 *       errorContains?: string,   // substring match on the error message
 *     }
 *   }
 */
export const TEST_CASES = [
    // ── point_stake successes ────────────────────────────────────
    {
        name: 'basic point stake',
        input: '4007-5-HUB',
        expect: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB' },
    },
    {
        name: 'zero offset',
        input: '4007-0-PAINT',
        expect: { type: 'point_stake', design_refs: ['4007'], offset: 0, stake: 'PAINT' },
    },
    {
        name: 'decimal offset',
        input: '4007-5.5-HUB',
        expect: { type: 'point_stake', design_refs: ['4007'], offset: 5.5, stake: 'HUB' },
    },
    {
        name: 'lowercase stake type normalized',
        input: '4007-5-hub',
        expect: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB' },
    },
    {
        name: 'mixed case stake type',
        input: '4007-5-Hub',
        expect: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB' },
    },
    {
        name: 'leading and trailing whitespace tolerated',
        input: '  4007-5-HUB  ',
        expect: { type: 'point_stake', design_refs: ['4007'], offset: 5, stake: 'HUB' },
    },
    {
        name: 'alphanumeric design ID with underscore',
        input: 'CP_PRI-2.5-NAIL',
        expect: { type: 'point_stake', design_refs: ['CP_PRI'], offset: 2.5, stake: 'NAIL' },
    },
    {
        name: 'each stake type round-trip — LATHE',
        input: '4007-5-LATHE',
        expect: { type: 'point_stake', stake: 'LATHE' },
    },
    {
        name: 'each stake type round-trip — PK',
        input: '4007-5-PK',
        expect: { type: 'point_stake', stake: 'PK' },
    },
    {
        name: 'each stake type round-trip — MAG',
        input: '4007-5-MAG',
        expect: { type: 'point_stake', stake: 'MAG' },
    },
    {
        name: 'each stake type round-trip — CP',
        input: '4007-5-CP',
        expect: { type: 'point_stake', stake: 'CP' },
    },
    {
        name: 'each stake type round-trip — WHISKER',
        input: '4007-5-WHISKER',
        expect: { type: 'point_stake', stake: 'WHISKER' },
    },

    // ── line_stake successes ─────────────────────────────────────
    {
        name: 'basic line stake',
        input: '4003:4002-11-NAIL',
        expect: { type: 'line_stake', design_refs: ['4003', '4002'], offset: 11, stake: 'NAIL' },
    },
    {
        name: 'line stake with decimal offset',
        input: '4003:4002-11.25-NAIL',
        expect: { type: 'line_stake', design_refs: ['4003', '4002'], offset: 11.25, stake: 'NAIL' },
    },
    {
        name: 'line stake lowercase stake',
        input: '4003:4002-11-nail',
        expect: { type: 'line_stake', design_refs: ['4003', '4002'], offset: 11, stake: 'NAIL' },
    },
    {
        name: 'line stake with alphanumeric IDs',
        input: 'A1:B2-5-LATHE',
        expect: { type: 'line_stake', design_refs: ['A1', 'B2'], offset: 5, stake: 'LATHE' },
    },

    // ── check_shot successes ─────────────────────────────────────
    {
        name: 'basic check shot',
        input: '4007-CHK',
        expect: { type: 'check_shot', design_refs: ['4007'], offset: null, stake: null },
    },
    {
        name: 'check shot lowercase chk',
        input: '4007-chk',
        expect: { type: 'check_shot', design_refs: ['4007'], offset: null, stake: null },
    },
    {
        name: 'check shot alphanumeric design ID',
        input: 'CP_1-CHK',
        expect: { type: 'check_shot', design_refs: ['CP_1'] },
    },

    // ── control_check successes ──────────────────────────────────
    {
        name: 'basic control check',
        input: 'CP-CHK',
        expect: { type: 'control_check', design_refs: [], offset: null, stake: null },
    },
    {
        name: 'control check lowercase',
        input: 'cp-chk',
        expect: { type: 'control_check', design_refs: [] },
    },
    {
        name: 'control check mixed case',
        input: 'Cp-Chk',
        expect: { type: 'control_check', design_refs: [] },
    },

    // ── parse_error: empty / null / undefined ────────────────────
    {
        name: 'empty string',
        input: '',
        expect: { type: 'parse_error', errorContains: 'Empty input' },
    },
    {
        name: 'whitespace only',
        input: '   ',
        expect: { type: 'parse_error', errorContains: 'Empty input' },
    },
    {
        name: 'null input',
        input: null,
        expect: { type: 'parse_error', errorContains: 'Empty input' },
    },
    {
        name: 'undefined input',
        input: undefined,
        expect: { type: 'parse_error', errorContains: 'Empty input' },
    },

    // ── parse_error: legacy format tells ─────────────────────────
    {
        name: 'legacy FT suffix',
        input: '4007-5FT-HUB',
        expect: { type: 'parse_error', errorContains: 'Legacy FT suffix' },
    },
    {
        name: 'legacy format with internal spaces',
        input: '4003 - 4002 - 11FT LUP',
        expect: { type: 'parse_error', errorContains: 'Legacy format' },
    },
    {
        name: 'spaces around dashes',
        input: '4007 - 5 - HUB',
        expect: { type: 'parse_error', errorContains: 'Legacy format' },
    },
    {
        name: 'non-code free text',
        input: 'hello world',
        expect: { type: 'parse_error', errorContains: 'Legacy format' },
    },

    // ── parse_error: structural ──────────────────────────────────
    {
        name: 'double dash (empty middle segment)',
        input: '4007--5-HUB',
        expect: { type: 'parse_error' },
    },
    {
        name: 'leading dash',
        input: '-5-HUB',
        expect: { type: 'parse_error' },
    },
    {
        name: 'trailing dash',
        input: '4007-5-HUB-',
        expect: { type: 'parse_error' },
    },
    {
        name: 'too few dashes',
        input: '4007-5',
        expect: { type: 'parse_error', errorContains: 'Malformed' },
    },
    {
        name: 'too many dashes',
        input: '4007-5-HUB-EXTRA',
        expect: { type: 'parse_error', errorContains: 'Malformed' },
    },
    {
        name: 'single token',
        input: '4007',
        expect: { type: 'parse_error', errorContains: 'Malformed' },
    },

    // ── parse_error: invalid offset ──────────────────────────────
    {
        name: 'non-numeric offset',
        input: '4007-ABC-HUB',
        expect: { type: 'parse_error', errorContains: 'offset' },
    },
    {
        name: 'offset with unit suffix',
        input: '4007-5ft-HUB',
        expect: { type: 'parse_error', errorContains: 'Legacy FT' },
    },

    // ── parse_error: invalid stake type ──────────────────────────
    {
        name: 'unknown stake type FOO',
        input: '4007-5-FOO',
        expect: { type: 'parse_error', errorContains: "Unknown stake type 'FOO'" },
    },
    {
        name: 'unknown stake type XYZ',
        input: '4007-5-XYZ',
        expect: { type: 'parse_error', errorContains: 'Unknown stake type' },
    },

    // ── parse_error: invalid design IDs ──────────────────────────
    {
        name: 'design ID with invalid char (period)',
        input: '40.07-5-HUB',
        expect: { type: 'parse_error', errorContains: 'Invalid design ID' },
    },
    {
        name: 'empty design ID in line stake',
        input: ':4002-11-NAIL',
        expect: { type: 'parse_error', errorContains: 'Empty design ID' },
    },
    {
        name: 'empty second design ID in line stake',
        input: '4003:-11-NAIL',
        expect: { type: 'parse_error', errorContains: 'Empty design ID' },
    },
    {
        name: 'three IDs in line stake prefix',
        input: '4003:4002:4001-11-NAIL',
        expect: { type: 'parse_error', errorContains: 'exactly two' },
    },

    // ── parse_error: malformed line stake ────────────────────────
    {
        name: 'line stake too few parts',
        input: '4003:4002-11',
        expect: { type: 'parse_error', errorContains: 'Malformed line stake' },
    },
    {
        name: 'line stake unknown stake type',
        input: '4003:4002-11-FOO',
        expect: { type: 'parse_error', errorContains: 'Unknown stake type' },
    },
];

function matches(actual, expected) {
    if (actual.type !== expected.type) return false;
    if (expected.design_refs !== undefined) {
        if (!Array.isArray(actual.design_refs)) return false;
        if (actual.design_refs.length !== expected.design_refs.length) return false;
        for (let i = 0; i < expected.design_refs.length; i++) {
            if (actual.design_refs[i] !== expected.design_refs[i]) return false;
        }
    }
    if (expected.offset !== undefined && actual.offset !== expected.offset) return false;
    if (expected.stake !== undefined && actual.stake !== expected.stake) return false;
    if (expected.errorContains !== undefined) {
        if (typeof actual.error !== 'string') return false;
        if (!actual.error.includes(expected.errorContains)) return false;
    }
    return true;
}

/**
 * Run all test cases. Returns a summary suitable for UI display.
 *
 * @returns {{
 *   passed: number,
 *   failed: number,
 *   total: number,
 *   results: Array<{ name: string, input: any, expected: object, actual: object, pass: boolean }>,
 * }}
 */
export function runTests() {
    const results = [];
    let passed = 0;
    let failed = 0;
    for (const tc of TEST_CASES) {
        const actual = parseStakeCode(tc.input);
        const pass = matches(actual, tc.expect);
        if (pass) passed++;
        else failed++;
        results.push({
            name: tc.name,
            input: tc.input,
            expected: tc.expect,
            actual,
            pass,
        });
    }
    return { passed, failed, total: TEST_CASES.length, results };
}
