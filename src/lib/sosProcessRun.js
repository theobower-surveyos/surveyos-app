// ============================================================================
// src/lib/sosProcessRun.js
// Batch processor for SurveyOS stakeout QC (Stage 10.2).
//
// Glues the parser + matcher to Supabase. Given an assignment id and
// a batch of observation rows, it:
//
//   1. Fetches the assignment's design context (design points,
//      per-point overrides, defaults, project controls).
//   2. Parses each observation's raw_code via sosParser.
//   3. Deduplicates within the batch — same design_refs key keeps the
//      most recent observation (by observed_at, or insertion order
//      when observed_at is null). Earlier duplicates are dropped
//      before matching.
//   4. Matches each surviving row via sosMatcher.
//   5. Deletes prior runs (and their qc_points via CASCADE) for the
//      assignment — re-upload is complete overwrite semantics.
//   6. Inserts a fresh stakeout_qc_runs row and the computed
//      stakeout_qc_points rows that reference it.
//   7. Returns a summary counts object the upload UI (Stage 10.3)
//      can render directly.
//
// This module is async and touches Supabase. The matcher itself is
// pure and lives in sosMatcher.js. Pure tests live alongside the
// matcher; this file is exercised through the dev tester commit path.
// ============================================================================

import { parseStakeCode } from './sosParser.js';
import { matchStake } from './sosMatcher.js';
import { triggerNarrativeGeneration } from './qcNarrative.js';

/**
 * @typedef {Object} RawRow
 * @property {string} rawCode
 * @property {string} observed_point_id
 * @property {number} N
 * @property {number} E
 * @property {number|null} Z
 * @property {string|null} [observedAt]
 */

/**
 * @typedef {Object} ProcessRunSummary
 * @property {string} run_id
 * @property {number} total_rows
 * @property {number} matched
 * @property {number} unmatched
 * @property {number} check_pass
 * @property {number} check_fail
 * @property {number} out_of_tol
 * @property {number} parse_errors
 * @property {number} duplicates_dropped
 */


// ── Helpers ───────────────────────────────────────────────────────────────

function dedupeRowKey(parsed) {
    if (!parsed || !Array.isArray(parsed.design_refs) || parsed.design_refs.length === 0) {
        // Rows without design_refs (control_check, parse_error) can't
        // share a key meaningfully; keep them all.
        return null;
    }
    return `${parsed.type}::${parsed.design_refs.join(':')}`;
}

function observedAtRank(observedAt, fallbackIndex) {
    if (!observedAt) return { ts: null, idx: fallbackIndex };
    const t = Date.parse(observedAt);
    return { ts: Number.isFinite(t) ? t : null, idx: fallbackIndex };
}

/**
 * Keep most-recent-wins per dedupe key. Rows whose key is null are
 * always kept. Returns { survivors, dropped }.
 */
function dedupe(rows) {
    const byKey = new Map(); // key → { row, rank }
    const keyless = [];
    let dropped = 0;

    rows.forEach((entry, idx) => {
        const key = dedupeRowKey(entry.parsed);
        if (key == null) {
            keyless.push(entry);
            return;
        }
        const rank = observedAtRank(entry.raw.observedAt, idx);
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { entry, rank });
            return;
        }
        // Prefer newer timestamp; fall back to later insertion index.
        const beatsByTs = rank.ts != null && existing.rank.ts != null && rank.ts > existing.rank.ts;
        const beatsByIdx = (rank.ts ?? 0) === (existing.rank.ts ?? 0) && rank.idx > existing.rank.idx;
        if (beatsByTs || beatsByIdx) {
            byKey.set(key, { entry, rank });
        }
        dropped += 1;
    });

    const survivors = [...keyless, ...[...byKey.values()].map((v) => v.entry)];
    return { survivors, dropped };
}

function toObservedInput(raw) {
    return {
        observed_point_id: String(raw.observed_point_id ?? ''),
        observed_northing: Number(raw.N),
        observed_easting:  Number(raw.E),
        observed_elevation: raw.Z == null || raw.Z === '' ? null : Number(raw.Z),
        raw_code: String(raw.rawCode ?? ''),
        observed_at: raw.observedAt ?? null,
    };
}

/**
 * Best-effort uuid generator: prefers crypto.randomUUID when
 * available (modern browsers + Node >= 14.17), falls back to a
 * RFC4122 v4 string assembled from Math.random. Supabase will
 * accept either.
 */
function makeUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // RFC4122 v4 fallback
    const hex = '0123456789abcdef';
    let out = '';
    for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) { out += '-'; continue; }
        if (i === 14) { out += '4'; continue; }
        let r = Math.floor(Math.random() * 16);
        if (i === 19) r = (r & 0x3) | 0x8;
        out += hex[r];
    }
    return out;
}


// ── Context fetch ─────────────────────────────────────────────────────────

/**
 * Pull the assignment context needed to run the matcher. Returns
 * both the matcher-shaped context and the assignment row itself
 * (caller needs project_id and party_chief_id to create the run).
 */
async function fetchAssignmentContext(assignmentId, supabase) {
    const { data: assignment, error: aErr } = await supabase
        .from('stakeout_assignments')
        .select('id, project_id, party_chief_id, default_offset_distance, default_offset_direction, default_stake_type, default_tolerance_h, default_tolerance_v')
        .eq('id', assignmentId)
        .single();
    if (aErr || !assignment) {
        throw new Error(`Could not load assignment ${assignmentId}: ${aErr?.message || 'not found'}`);
    }

    const { data: aps, error: apErr } = await supabase
        .from('stakeout_assignment_points')
        .select('design_point_id, override_offset_distance, override_offset_direction, override_stake_type, override_tolerance_h, override_tolerance_v')
        .eq('assignment_id', assignmentId);
    if (apErr) throw new Error(`Could not load assignment points: ${apErr.message}`);
    const assignmentPoints = aps || [];

    // Pull all design points for the project (the assignment may
    // reference points outside its own assignment_points rows when the
    // chief does check shots against neighbouring work).
    const { data: dps, error: dpErr } = await supabase
        .from('stakeout_design_points')
        .select('id, point_id, feature_code, northing, easting, elevation, tolerance_h_override, tolerance_v_override')
        .eq('project_id', assignment.project_id);
    if (dpErr) throw new Error(`Could not load design points: ${dpErr.message}`);
    const allProjectPoints = (dps || []).map((d) => ({
        ...d,
        northing: Number(d.northing),
        easting: Number(d.easting),
        elevation: d.elevation == null ? null : Number(d.elevation),
    }));

    // Assignment design points = intersection of project points and
    // the assignment_points FKs.
    const apIds = new Set(assignmentPoints.map((ap) => ap.design_point_id));
    const designPoints = allProjectPoints.filter((p) => apIds.has(p.id));

    // Project controls = any design point whose feature_code looks
    // like a control (CP/BM/TBM/CM/MON/...) — mirrors the loose
    // convention used by pointClassification.js without importing it
    // here (keep this module dependency-light).
    const CONTROL_PREFIXES = /^(CP|BM|TBM|SECCOR|CM|MON|REBAR|BRASS|BCC|SM|CORNER|SECTION|QUARTER|PLSS|SCS|PROP|WIT)/i;
    const projectControls = allProjectPoints.filter((p) => p.feature_code && CONTROL_PREFIXES.test(p.feature_code));

    // Prior observations = any qc_points from earlier runs in this
    // project. Not assignment-scoped, since a check can reference a
    // stake set on a different day's assignment.
    const projectAssignmentIds = new Set();
    {
        const { data: projAsg, error: projAsgErr } = await supabase
            .from('stakeout_assignments')
            .select('id')
            .eq('project_id', assignment.project_id);
        if (projAsgErr) throw new Error(`Could not load project assignments: ${projAsgErr.message}`);
        for (const a of projAsg || []) projectAssignmentIds.add(a.id);
    }
    let priorObservations = [];
    if (projectAssignmentIds.size > 0) {
        const ids = [...projectAssignmentIds].filter((id) => id !== assignmentId);
        if (ids.length > 0) {
            const { data: priors, error: pErr } = await supabase
                .from('stakeout_qc_points')
                .select('observed_point_id, observed_northing, observed_easting, observed_elevation, run_id')
                .in('assignment_id', ids);
            if (pErr) throw new Error(`Could not load prior observations: ${pErr.message}`);
            priorObservations = (priors || []).map((p) => ({
                observed_point_id: p.observed_point_id,
                observed_northing: Number(p.observed_northing),
                observed_easting: Number(p.observed_easting),
                observed_elevation: p.observed_elevation == null ? null : Number(p.observed_elevation),
                run_id: p.run_id,
            }));
        }
    }

    const matcherContext = {
        assignmentId,
        designPoints,
        assignmentPoints,
        defaults: {
            default_offset_distance:  assignment.default_offset_distance,
            default_offset_direction: assignment.default_offset_direction,
            default_stake_type:       assignment.default_stake_type,
            default_tolerance_h:      assignment.default_tolerance_h,
            default_tolerance_v:      assignment.default_tolerance_v,
        },
        projectControls,
        priorObservations,
    };

    return { assignment, matcherContext };
}


// ── Public API ────────────────────────────────────────────────────────────

/**
 * Run the full parse → match → persist pipeline for an assignment.
 *
 * @param {{ assignmentId: string, rows: RawRow[] }} input
 * @param {object} supabase
 * @returns {Promise<ProcessRunSummary>}
 */
export async function processRun({ assignmentId, rows }, supabase) {
    if (!assignmentId) throw new Error('processRun: assignmentId is required.');
    if (!Array.isArray(rows)) throw new Error('processRun: rows must be an array.');

    const { assignment, matcherContext } = await fetchAssignmentContext(assignmentId, supabase);

    // ── 1. Parse ────────────────────────────────────────────────
    const parsedRows = rows.map((raw) => ({
        raw,
        parsed: parseStakeCode(raw.rawCode),
    }));

    // ── 2. Dedupe ───────────────────────────────────────────────
    const { survivors, dropped } = dedupe(parsedRows);

    // ── 3. Match ────────────────────────────────────────────────
    const matched = survivors.map(({ raw, parsed }) => {
        const observed = toObservedInput(raw);
        return matchStake(parsed, observed, matcherContext);
    });

    // ── 4. Overwrite prior runs for this assignment ────────────
    // CASCADE on stakeout_qc_points.run_id removes old observations.
    const { error: delErr } = await supabase
        .from('stakeout_qc_runs')
        .delete()
        .eq('assignment_id', assignmentId);
    if (delErr) throw new Error(`Could not delete prior runs: ${delErr.message}`);

    // ── 5. Create a fresh run row ──────────────────────────────
    const runId = makeUuid();
    const counts = summarize(matched);
    const { error: runErr } = await supabase
        .from('stakeout_qc_runs')
        .insert({
            id: runId,
            assignment_id: assignmentId,
            party_chief_id: assignment.party_chief_id,
            total_points: matched.length,
            points_in_tol: counts.in_tol,
            points_out_of_tol: counts.out_of_tol,
            points_field_fit: 0,
            points_built_on: 0,
            submitted_from: 'office',
        });
    if (runErr) throw new Error(`Could not insert run: ${runErr.message}`);

    // ── 6. Insert qc_points ────────────────────────────────────
    if (matched.length > 0) {
        const payload = matched.map((row) => ({
            ...row,
            run_id: runId,
            assignment_id: assignmentId,
        }));
        const { error: insErr } = await supabase
            .from('stakeout_qc_points')
            .insert(payload);
        if (insErr) throw new Error(`Could not insert qc_points: ${insErr.message}`);
    }

    // ── 7. Trigger narrative generation (fire-and-forget) ──────
    // Stage 11.1: ask the generate-qc-narrative Edge Function to
    // produce a Claude-written summary of this run. Errors land in
    // stakeout_qc_narratives.error so the UI can surface them; the
    // chief's submit flow never waits on this.
    triggerNarrativeGeneration({ runId });

    // ── 8. Summary ─────────────────────────────────────────────
    return {
        run_id: runId,
        total_rows: matched.length,
        matched: counts.matched,
        unmatched: counts.unmatched + counts.unmatched_check,
        check_pass: counts.check_pass,
        check_fail: counts.check_fail,
        out_of_tol: counts.out_of_tol,
        parse_errors: counts.parse_error,
        duplicates_dropped: dropped,
    };
}

/**
 * Preview-only (no DB writes). Useful for the dev tester's "preview"
 * button. Returns the matched QcRow[] and the summary counts.
 *
 * @param {{ assignmentId: string, rows: RawRow[] }} input
 * @param {object} supabase
 * @returns {Promise<{ rows: object[], summary: object, duplicates_dropped: number }>}
 */
export async function previewRun({ assignmentId, rows }, supabase) {
    const { matcherContext } = await fetchAssignmentContext(assignmentId, supabase);

    const parsedRows = rows.map((raw) => ({
        raw,
        parsed: parseStakeCode(raw.rawCode),
    }));

    const { survivors, dropped } = dedupe(parsedRows);

    const matched = survivors.map(({ raw, parsed }) => {
        const observed = toObservedInput(raw);
        return matchStake(parsed, observed, matcherContext);
    });

    const counts = summarize(matched);
    return {
        rows: matched,
        summary: counts,
        duplicates_dropped: dropped,
    };
}

function summarize(rows) {
    const counts = {
        total: rows.length,
        matched: 0,
        in_tol: 0,
        out_of_tol: 0,
        check_pass: 0,
        check_fail: 0,
        unmatched: 0,
        unmatched_check: 0,
        parse_error: 0,
    };
    for (const row of rows) {
        if (row.h_status === 'in_tol') { counts.in_tol += 1; counts.matched += 1; }
        else if (row.h_status === 'out_of_tol') { counts.out_of_tol += 1; counts.matched += 1; }
        else if (row.h_status === 'check_pass') { counts.check_pass += 1; counts.matched += 1; }
        else if (row.h_status === 'check_fail') { counts.check_fail += 1; counts.matched += 1; }
        else if (row.h_status === 'unmatched') counts.unmatched += 1;
        else if (row.h_status === 'unmatched_check') counts.unmatched_check += 1;
        else if (row.h_status === 'parse_error') counts.parse_error += 1;
    }
    return counts;
}
