// ============================================================================
// src/lib/csvParser.js
// PNEZD CSV parser for as-staked observation files.
//
// Reads the Trimble-Access-style PNEZD format and normalizes each row
// into the RawRow shape sosProcessRun expects:
//   { observed_point_id, N, E, Z, rawCode }
//
// Five columns per row, no headers, comma-separated:
//
//   point_id, northing, easting, elevation, description
//
// Tolerances: BOM, leading/trailing whitespace per cell, blank rows,
// an optional header row (auto-detected when the first content row's
// N or E is non-numeric).
//
// Pure module. Never throws — all error conditions are captured in
// the returned { errors } array.
// ============================================================================

/**
 * @typedef {Object} CsvRow
 * @property {string} observed_point_id
 * @property {number} N
 * @property {number} E
 * @property {number|null} Z
 * @property {string} rawCode
 */

/**
 * @typedef {Object} CsvError
 * @property {number} lineNumber
 * @property {string} raw
 * @property {string} message
 */

/**
 * Parse PNEZD CSV text. Always returns an object — never throws.
 *
 * @param {string} text
 * @returns {{ rows: CsvRow[], errors: CsvError[] }}
 */
export function parsePnezdCsv(text) {
    const rows = [];
    const errors = [];

    if (typeof text !== 'string' || text.length === 0) {
        errors.push({ lineNumber: 0, raw: '', message: 'Empty or invalid input.' });
        return { rows, errors };
    }

    // Strip BOM and normalize line endings.
    const lines = text.replace(/^﻿/, '').split(/\r\n|\r|\n/);

    let lineNumber = 0;
    let firstContentRowChecked = false;

    for (const line of lines) {
        lineNumber += 1;
        const trimmed = line.trim();
        if (!trimmed) continue; // blank rows are silent

        const cells = trimmed.split(',').map((c) => c.trim());
        if (cells.length !== 5) {
            errors.push({
                lineNumber,
                raw: trimmed,
                message: `Expected 5 columns, got ${cells.length}.`,
            });
            continue;
        }

        const [pointId, nStr, eStr, zStr, description] = cells;
        const northing = Number(nStr);
        const easting = Number(eStr);
        const elevation = zStr === '' ? null : Number(zStr);

        // Header-row auto-detection: if the first content row has a
        // non-numeric N or E, assume it's a header and skip it
        // silently. This applies only to the first content row;
        // subsequent non-numeric coords are reported as errors.
        if (!firstContentRowChecked) {
            firstContentRowChecked = true;
            if (!Number.isFinite(northing) || !Number.isFinite(easting)) {
                continue;
            }
        }

        if (!pointId) {
            errors.push({ lineNumber, raw: trimmed, message: 'Missing point_id.' });
            continue;
        }
        if (!Number.isFinite(northing) || !Number.isFinite(easting)) {
            errors.push({ lineNumber, raw: trimmed, message: 'Northing or Easting not numeric.' });
            continue;
        }
        if (zStr !== '' && !Number.isFinite(elevation)) {
            errors.push({ lineNumber, raw: trimmed, message: 'Elevation present but not numeric.' });
            continue;
        }
        if (!description) {
            errors.push({ lineNumber, raw: trimmed, message: 'Missing description (raw_code).' });
            continue;
        }

        rows.push({
            observed_point_id: pointId,
            N: northing,
            E: easting,
            Z: elevation,
            rawCode: description,
        });
    }

    return { rows, errors };
}
