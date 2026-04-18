// ============================================================================
// src/utils/stakeoutQC.js
// Pure utilities for the Stakeout QC pillar: code parsing, CSV / JXL ingest,
// delta computation, and observation-to-design matching. No React, no
// Supabase, no I/O at module load. All functions are deterministic.
// ============================================================================

const OFFSET_DIRECTIONS = new Set(['N', 'S', 'E', 'W']);
const STAKE_TYPES = new Set(['N', 'H', 'L', 'P', 'S', 'F']);
const OFFSET_REGEX = /^(\d+(?:\.\d+)?)([NSEW])?$/;

function round3(n) {
    return Math.round(n * 1000) / 1000;
}

/**
 * Parses a SurveyOS feature code string into structured parts.
 *
 * Grammar: FEATURE[-OFFSET[-STAKETYPE]]
 *   FEATURE   — uppercase token (e.g. TBC, SSMH)
 *   OFFSET    — number + optional cardinal letter ("2", "2N", "2.5W")
 *   STAKETYPE — single letter from N/H/L/P/S/F
 *
 * @param {string} raw
 * @returns {{
 *   feature: string | null,
 *   offset_distance: number | null,
 *   offset_direction: 'N'|'S'|'E'|'W' | null,
 *   stake_type: 'N'|'H'|'L'|'P'|'S'|'F' | null,
 *   raw: string,
 *   parse_error: string | null
 * }}
 */
export function parseStakeCode(raw) {
    const rawOut = typeof raw === 'string' ? raw : '';

    if (typeof raw !== 'string' || raw.trim() === '') {
        return {
            feature: null,
            offset_distance: null,
            offset_direction: null,
            stake_type: null,
            raw: rawOut,
            parse_error: 'empty',
        };
    }

    const normalized = raw.trim().toUpperCase().replace(/\s+/g, '');
    const parts = normalized.split('-');
    const feature = parts[0] || null;

    if (!feature) {
        return {
            feature: null,
            offset_distance: null,
            offset_direction: null,
            stake_type: null,
            raw: rawOut,
            parse_error: 'empty',
        };
    }

    let offset_distance = null;
    let offset_direction = null;
    let stake_type = null;

    if (parts.length >= 2) {
        const m = OFFSET_REGEX.exec(parts[1]);
        if (!m) {
            return {
                feature,
                offset_distance: null,
                offset_direction: null,
                stake_type: null,
                raw: rawOut,
                parse_error: 'bad_offset',
            };
        }
        offset_distance = Number.parseFloat(m[1]);
        offset_direction = m[2] && OFFSET_DIRECTIONS.has(m[2]) ? m[2] : null;
    }

    if (parts.length >= 3) {
        const st = parts[2];
        if (!STAKE_TYPES.has(st)) {
            return {
                feature,
                offset_distance,
                offset_direction,
                stake_type: null,
                raw: rawOut,
                parse_error: 'bad_staketype',
            };
        }
        stake_type = st;
    }

    return {
        feature,
        offset_distance,
        offset_direction,
        stake_type,
        raw: rawOut,
        parse_error: null,
    };
}

/**
 * Auto-detects the most likely column mapping for an as-staked CSV based on
 * the first data row. Best-guess heuristic — UI lets users override.
 *
 * @param {string[]} firstRow
 * @returns {{
 *   point_id: number,
 *   n: number,
 *   e: number,
 *   z: number | null,
 *   code: number | null
 * } | null}
 */
export function detectCSVColumns(firstRow) {
    if (!Array.isArray(firstRow) || firstRow.length < 3) return null;

    const numericCols = [];
    const nonNumericCols = [];
    for (let i = 0; i < firstRow.length; i++) {
        const v = firstRow[i];
        const s = v == null ? '' : String(v).trim();
        const n = Number.parseFloat(s);
        if (s !== '' && !Number.isNaN(n) && /^-?\d+(\.\d+)?$/.test(s)) {
            numericCols.push(i);
        } else {
            nonNumericCols.push(i);
        }
    }

    if (numericCols.length < 2) return null;

    // Point id = first non-numeric column, falling back to the first column
    const point_id = nonNumericCols.length > 0 ? nonNumericCols[0] : 0;
    const n = numericCols[0];
    const e = numericCols[1];
    const z = numericCols.length >= 3 ? numericCols[2] : null;

    // Code = first non-numeric column that appears AFTER the last numeric we took
    const lastNumeric = z != null ? z : e;
    let code = null;
    for (const idx of nonNumericCols) {
        if (idx > lastNumeric && idx !== point_id) {
            code = idx;
            break;
        }
    }

    return { point_id, n, e, z, code };
}

/**
 * Parses an as-staked CSV file (or raw CSV string) with a supplied column
 * mapping. Filters rows with non-numeric N/E or empty point_id.
 *
 * @param {File|Blob|string} file
 * @param {{
 *   point_id: number,
 *   n: number,
 *   e: number,
 *   z?: number | null,
 *   code?: number | null
 * }} columnMapping
 * @returns {Promise<Array<{
 *   point_id: string,
 *   n: number,
 *   e: number,
 *   z: number | null,
 *   code: string | null,
 *   raw_row: number
 * }>>}
 */
export async function parseAsStakedCSV(file, columnMapping) {
    const Papa = (await import('papaparse')).default;

    let text;
    if (typeof file === 'string') {
        text = file;
    } else if (file && typeof file.text === 'function') {
        text = await file.text();
    } else {
        throw new Error('parseAsStakedCSV: unsupported input');
    }

    // Empty input is a normal outcome (e.g. user uploads a header-only file
    // or the Blob is empty). Short-circuit before papaparse, which would
    // otherwise reject with "UndetectableDelimiter". Malformed but non-empty
    // CSVs still reach the error path below.
    if (typeof text !== 'string' || text.trim() === '') {
        return [];
    }

    return new Promise((resolve, reject) => {
        Papa.parse(text, {
            header: false,
            skipEmptyLines: true,
            complete: (result) => {
                if (result.errors && result.errors.length > 0) {
                    const fatal = result.errors.find((e) => e.type === 'Delimiter' || e.code === 'UndetectableDelimiter');
                    if (fatal) {
                        reject(fatal);
                        return;
                    }
                }

                const rows = Array.isArray(result.data) ? result.data : [];
                const out = [];
                const pidIdx = columnMapping.point_id;
                const nIdx = columnMapping.n;
                const eIdx = columnMapping.e;
                const zIdx = columnMapping.z == null ? null : columnMapping.z;
                const codeIdx = columnMapping.code == null ? null : columnMapping.code;

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    if (!Array.isArray(row)) continue;

                    const pidRaw = row[pidIdx];
                    const point_id = pidRaw == null ? '' : String(pidRaw).trim();
                    if (point_id === '') continue;

                    const n = Number.parseFloat(row[nIdx]);
                    const e = Number.parseFloat(row[eIdx]);
                    if (Number.isNaN(n) || Number.isNaN(e)) continue;

                    let z = null;
                    if (zIdx != null) {
                        const zv = Number.parseFloat(row[zIdx]);
                        z = Number.isNaN(zv) ? null : zv;
                    }

                    let code = null;
                    if (codeIdx != null) {
                        const cv = row[codeIdx];
                        code = cv == null ? null : String(cv).trim() || null;
                    }

                    out.push({ point_id, n, e, z, code, raw_row: i });
                }

                resolve(out);
            },
            error: (err) => reject(err),
        });
    });
}

/**
 * Extracts point records from a Trimble JobXML (.jxl) file. Only points are
 * returned — other JXL content is ignored. Returns [] on unmatched structure.
 *
 * @param {File|Blob|string} file
 * @returns {Promise<Array<{
 *   point_id: string,
 *   n: number,
 *   e: number,
 *   z: number | null,
 *   code: string | null,
 *   raw_row: null
 * }>>}
 */
export async function parseJXLPoints(file) {
    const { XMLParser } = await import('fast-xml-parser');

    let xml;
    if (typeof file === 'string') {
        xml = file;
    } else if (file && typeof file.text === 'function') {
        xml = await file.text();
    } else {
        return [];
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
    });

    let parsed;
    try {
        parsed = parser.parse(xml);
    } catch {
        return [];
    }
    if (!parsed || typeof parsed !== 'object') return [];

    const job = parsed.JOBFile;
    if (!job) return [];

    // JXL shape varies: FieldBook may be an object or an array of objects.
    let fieldBook = job.FieldBook;
    if (Array.isArray(fieldBook)) fieldBook = fieldBook[0];
    if (!fieldBook) return [];

    let recs = fieldBook.PointRecord;
    if (!recs) return [];
    if (!Array.isArray(recs)) recs = [recs];

    const out = [];
    for (const rec of recs) {
        if (!rec || typeof rec !== 'object') continue;
        const grid = rec.Grid;
        if (!grid || typeof grid !== 'object') continue;

        const pidRaw = rec['@_Name'] ?? rec['@_ID'] ?? null;
        const point_id = pidRaw == null ? '' : String(pidRaw).trim();
        if (point_id === '') continue;

        const n = Number.parseFloat(grid.North);
        const e = Number.parseFloat(grid.East);
        if (Number.isNaN(n) || Number.isNaN(e)) continue;

        const zRaw = grid.Elevation;
        const zParsed = zRaw == null ? NaN : Number.parseFloat(zRaw);
        const z = Number.isNaN(zParsed) ? null : zParsed;

        let code = null;
        if (rec.Code != null) {
            const c = String(rec.Code).trim();
            code = c === '' ? null : c;
        }

        out.push({ point_id, n, e, z, code, raw_row: null });
    }
    return out;
}

/**
 * Computes horizontal QC deltas for an observation against its design point.
 * Only distinguishes in_tol / out_of_tol for horizontals — field_fit /
 * built_on / pending are user-applied states, not computed here. Every shot
 * captures elevation data (delta_z), but crews do not routinely re-check
 * their own vertical in the field, so vertical pass/fail evaluation
 * requires check-shot data that Phase 1 does not yet ingest — v_status is
 * therefore always returned as null in Phase 1, regardless of stake type
 * or delta_z magnitude. For offset stakes the captured delta_z represents
 * cut/fill communicated to the contractor rather than a gradable target.
 *
 * @param {{
 *   design: { n: number, e: number, z: number | null },
 *   observed: { n: number, e: number, z: number | null },
 *   declared_offset_distance: number | null,
 *   declared_offset_direction: 'N'|'S'|'E'|'W' | null,
 *   tolerance_h: number,
 *   tolerance_v?: number
 * }} params
 * @returns {{
 *   delta_n: number,
 *   delta_e: number,
 *   delta_z: number | null,
 *   delta_h: number,
 *   actual_offset_distance: number,
 *   actual_offset_direction: 'N'|'S'|'E'|'W' | null,
 *   offset_variance: number | null,
 *   h_status: 'in_tol' | 'out_of_tol',
 *   v_status: null
 * }}
 */
export function computeQC(params) {
    const {
        design,
        observed,
        declared_offset_distance,
        tolerance_h,
        // eslint-disable-next-line no-unused-vars
        tolerance_v = 0.030,
    } = params;

    const delta_n_raw = observed.n - design.n;
    const delta_e_raw = observed.e - design.e;
    const delta_h_raw = Math.sqrt(delta_n_raw * delta_n_raw + delta_e_raw * delta_e_raw);

    let delta_z = null;
    if (design.z != null && observed.z != null) {
        delta_z = round3(observed.z - design.z);
    }

    let actual_offset_direction = null;
    if (delta_h_raw >= 0.01) {
        if (Math.abs(delta_n_raw) >= Math.abs(delta_e_raw)) {
            actual_offset_direction = delta_n_raw > 0 ? 'N' : 'S';
        } else {
            actual_offset_direction = delta_e_raw > 0 ? 'E' : 'W';
        }
    }

    const actual_offset_distance = round3(delta_h_raw);

    let offset_variance = null;
    let h_status;
    if (declared_offset_distance != null) {
        const variance = Math.abs(delta_h_raw - declared_offset_distance);
        offset_variance = round3(variance);
        h_status = variance <= tolerance_h ? 'in_tol' : 'out_of_tol';
    } else {
        h_status = delta_h_raw <= tolerance_h ? 'in_tol' : 'out_of_tol';
    }

    return {
        delta_n: round3(delta_n_raw),
        delta_e: round3(delta_e_raw),
        delta_z,
        delta_h: round3(delta_h_raw),
        actual_offset_distance,
        actual_offset_direction,
        offset_variance,
        h_status,
        // v_status is null in Phase 1 — check-shot workflow deferred.
        v_status: null,
    };
}

/**
 * Matches observed points to design points by exact point_id first, then
 * nearest-neighbor within maxDistance. Input arrays are not mutated.
 *
 * @template {{ point_id: string, n: number, e: number }} O
 * @param {Array<O>} observations
 * @param {Array<{ id: string, point_id: string, northing: number, easting: number }>} designPoints
 * @param {{ maxDistance?: number }} [options]
 * @returns {Array<O & {
 *   design_point_id: string | null,
 *   match_type: 'exact' | 'nearest' | 'none',
 *   match_distance: number | null
 * }>}
 */
export function matchObservationsToDesign(observations, designPoints, options) {
    const maxDistance = options && typeof options.maxDistance === 'number' ? options.maxDistance : 50;
    const obs = Array.isArray(observations) ? observations : [];
    const designs = Array.isArray(designPoints) ? designPoints : [];

    const byPointId = new Map();
    for (const d of designs) {
        if (d && typeof d.point_id === 'string') byPointId.set(d.point_id, d);
    }

    return obs.map((o) => {
        const result = { ...o, design_point_id: null, match_type: 'none', match_distance: null };

        if (!o || typeof o.point_id !== 'string') return result;

        const exact = byPointId.get(o.point_id);
        if (exact) {
            result.design_point_id = exact.id;
            result.match_type = 'exact';
            result.match_distance = null;
            return result;
        }

        let bestIdx = -1;
        let bestDist = Infinity;
        for (let i = 0; i < designs.length; i++) {
            const d = designs[i];
            if (!d || typeof d.northing !== 'number' || typeof d.easting !== 'number') continue;
            const dn = o.n - d.northing;
            const de = o.e - d.easting;
            const dist = Math.sqrt(dn * dn + de * de);
            if (dist < bestDist) {
                bestDist = dist;
                bestIdx = i;
            }
        }

        if (bestIdx >= 0 && bestDist <= maxDistance) {
            result.design_point_id = designs[bestIdx].id;
            result.match_type = 'nearest';
            result.match_distance = round3(bestDist);
        }
        return result;
    });
}
