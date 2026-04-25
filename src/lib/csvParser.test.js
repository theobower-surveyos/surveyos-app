// ============================================================================
// src/lib/csvParser.test.js
// Self-contained tests for csvParser.js. Hand-rolled harness in the
// sosParser.test.js style, exposed via runCsvParserTests() so the dev
// tester can render a pass/fail summary in-browser.
// ============================================================================

import { parsePnezdCsv } from './csvParser.js';

const BOM = '﻿';

export const TEST_CASES = [
    {
        name: 'three valid rows',
        input: 'p1,1000.000,2000.000,50.000,4007-5-HUB\np2,1005.500,2000.000,50.010,4007-CHK\np3,1000.000,2050.000,55.000,4003:4002-11-NAIL',
        expect: { rowCount: 3, errorCount: 0, firstRow: { observed_point_id: 'p1', N: 1000.0, E: 2000.0, Z: 50.0, rawCode: '4007-5-HUB' } },
    },
    {
        name: 'BOM prefix tolerated',
        input: BOM + 'p1,1000.000,2000.000,50.000,4007-5-HUB',
        expect: { rowCount: 1, errorCount: 0, firstRow: { observed_point_id: 'p1' } },
    },
    {
        name: 'header row auto-skipped (non-numeric coords on first content row)',
        input: 'point,N,E,Z,desc\np1,1000.000,2000.000,50.000,4007-5-HUB',
        expect: { rowCount: 1, errorCount: 0, firstRow: { observed_point_id: 'p1' } },
    },
    {
        name: 'blank rows skipped silently',
        input: '\np1,1000.000,2000.000,50.000,4007-5-HUB\n\n\np2,1005.500,2000.000,50.010,4007-CHK\n',
        expect: { rowCount: 2, errorCount: 0 },
    },
    {
        name: 'CRLF line endings tolerated',
        input: 'p1,1000.000,2000.000,50.000,4007-5-HUB\r\np2,1005.500,2000.000,50.010,4007-CHK\r\n',
        expect: { rowCount: 2, errorCount: 0 },
    },
    {
        name: 'wrong column count flagged',
        input: 'p1,1000.000,2000.000,50.000\np2,1005.500,2000.000,50.010,4007-CHK',
        expect: { rowCount: 1, errorCount: 1, errorMessageContains: 'Expected 5 columns' },
    },
    {
        name: 'non-numeric coord (after a valid row) flagged',
        input: 'p1,1000.000,2000.000,50.000,4007-5-HUB\np2,abc,xyz,50.010,4007-CHK',
        expect: { rowCount: 1, errorCount: 1, errorMessageContains: 'not numeric' },
    },
    {
        name: 'missing point_id flagged',
        input: 'p1,1000.000,2000.000,50.000,4007-5-HUB\n,1005.500,2000.000,50.010,4007-CHK',
        expect: { rowCount: 1, errorCount: 1, errorMessageContains: 'Missing point_id' },
    },
    {
        name: 'missing description flagged',
        input: 'p1,1000.000,2000.000,50.000,4007-5-HUB\np2,1005.500,2000.000,50.010,',
        expect: { rowCount: 1, errorCount: 1, errorMessageContains: 'Missing description' },
    },
    {
        name: 'empty elevation accepted as null',
        input: 'p1,1000.000,2000.000,,4007-5-HUB',
        expect: { rowCount: 1, errorCount: 0, firstRow: { Z: null } },
    },
    {
        name: 'invalid elevation flagged',
        input: 'p1,1000.000,2000.000,abc,4007-5-HUB',
        expect: { rowCount: 0, errorCount: 1, errorMessageContains: 'Elevation' },
    },
    {
        name: 'whitespace within cells trimmed',
        input: '  p1 , 1000.000 , 2000.000 , 50.000 , 4007-5-HUB ',
        expect: { rowCount: 1, errorCount: 0, firstRow: { observed_point_id: 'p1', rawCode: '4007-5-HUB' } },
    },
    {
        name: 'empty string input → 1 error, 0 rows',
        input: '',
        expect: { rowCount: 0, errorCount: 1 },
    },
];

function evaluateRow(row, expected) {
    if (!expected) return null;
    for (const key of Object.keys(expected)) {
        const a = row[key];
        const b = expected[key];
        if (typeof b === 'number' && typeof a === 'number') {
            if (Math.abs(a - b) > 0.0005) return `${key}: expected ${b}, got ${a}`;
        } else if (a !== b) {
            return `${key}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`;
        }
    }
    return null;
}

/**
 * @returns {{ passed: number, failed: number, total: number, results: Array }}
 */
export function runCsvParserTests() {
    const results = [];
    let passed = 0;
    let failed = 0;
    for (const tc of TEST_CASES) {
        const out = parsePnezdCsv(tc.input);
        let reason = null;
        if (out.rows.length !== tc.expect.rowCount) {
            reason = `rows: expected ${tc.expect.rowCount}, got ${out.rows.length}`;
        } else if (out.errors.length !== tc.expect.errorCount) {
            reason = `errors: expected ${tc.expect.errorCount}, got ${out.errors.length} (${out.errors.map(e => e.message).join('; ')})`;
        } else if (tc.expect.firstRow) {
            reason = evaluateRow(out.rows[0], tc.expect.firstRow);
        }
        if (!reason && tc.expect.errorMessageContains) {
            const firstErr = out.errors[0];
            if (!firstErr || !firstErr.message.includes(tc.expect.errorMessageContains)) {
                reason = `error message missing substring "${tc.expect.errorMessageContains}"; got ${JSON.stringify(firstErr?.message || null)}`;
            }
        }
        if (!reason) {
            passed++;
            results.push({ name: tc.name, pass: true });
        } else {
            failed++;
            results.push({ name: tc.name, pass: false, reason });
        }
    }
    return { passed, failed, total: TEST_CASES.length, results };
}
