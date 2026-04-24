import React, { useEffect, useMemo, useState } from 'react';
import { parseStakeCode } from '../../lib/sosParser.js';
import { runTests } from '../../lib/sosParser.test.js';
import { runMatcherTests } from '../../lib/sosMatcher.test.js';
import { processRun, previewRun } from '../../lib/sosProcessRun.js';
import { supabase } from '../../supabaseClient';

// ─── SosParserTester ──────────────────────────────────────────────────
// Dev-only page for exercising the SOS parser + matcher. Two panels:
//   1. Parser: paste codes, click parse, inspect structured output.
//   2. Matcher playground: pick an assignment, paste observations,
//      preview or commit to the QC tables.
//
// Feature flag: Vite replaces import.meta.env.DEV with a boolean at
// build time. In production builds SHOW_TESTER is false, the component
// returns null, and the whole subtree tree-shakes out of the bundle.

const SHOW_TESTER = import.meta.env.DEV;

const SAMPLE = `4007-5-HUB
4007-0-PAINT
4003:4002-11-NAIL
4007-CHK
CP-CHK
4007-5.5-HUB
4007-5-hub
  4007-5-HUB
4007-5FT-HUB
4003 - 4002 - 11FT LUP
hello world
4007--5-HUB
4007-5-FOO`;

const MATCHER_SAMPLE = `obs1,1000000.00,2000000.00,50.00,4007-5-HUB
obs2,1000000.50,2000000.00,50.01,4007-0-PAINT
obs3,1000005.00,2000050.00,55.02,4003:4002-11-NAIL
obs4,1000000.04,2000000.03,50.01,4007-CHK
obs5,5000.10,6000.10,100.00,CP-CHK
obs6,1000005.00,2000000.00,50.00,4003 - 4002 - 11FT LUP`;

export default function SosParserTester() {
    const [input, setInput] = useState(SAMPLE);
    const [parsed, setParsed] = useState(null);
    const [testSummary, setTestSummary] = useState(null);

    // ── Matcher playground state ──
    const [assignments, setAssignments] = useState([]);
    const [assignmentLoading, setAssignmentLoading] = useState(true);
    const [assignmentError, setAssignmentError] = useState(null);
    const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
    const [matcherInput, setMatcherInput] = useState(MATCHER_SAMPLE);
    const [previewRows, setPreviewRows] = useState(null);
    const [previewSummary, setPreviewSummary] = useState(null);
    const [commitSummary, setCommitSummary] = useState(null);
    const [matcherTestSummary, setMatcherTestSummary] = useState(null);
    const [matcherBusy, setMatcherBusy] = useState(false);
    const [matcherError, setMatcherError] = useState(null);

    useEffect(() => {
        if (!SHOW_TESTER) return;
        let cancelled = false;
        (async () => {
            try {
                const { data, error } = await supabase
                    .from('stakeout_assignments')
                    .select('id, title, assignment_date, project_id')
                    .order('assignment_date', { ascending: false })
                    .limit(100);
                if (cancelled) return;
                if (error) { setAssignmentError(error.message); setAssignments([]); }
                else {
                    setAssignments(data || []);
                    if ((data || []).length > 0) setSelectedAssignmentId(data[0].id);
                }
            } catch (err) {
                if (!cancelled) setAssignmentError(err?.message || String(err));
            } finally {
                if (!cancelled) setAssignmentLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!SHOW_TESTER) return null;

    function handleParse() {
        const lines = input.split('\n');
        const rows = lines.map((line, i) => ({
            lineNum: i + 1,
            raw: line,
            result: parseStakeCode(line),
        }));
        setParsed(rows);
    }

    function handleRunTests() {
        setTestSummary(runTests());
    }

    function parseMatcherInput(text) {
        const rows = [];
        const lines = text.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            // Split on first four commas only so the raw_code (which
            // may itself contain dashes etc.) stays intact.
            const parts = trimmed.split(',');
            if (parts.length < 5) continue;
            const [observed_point_id, n, e, z, ...rest] = parts;
            rows.push({
                observed_point_id: observed_point_id.trim(),
                N: Number(n),
                E: Number(e),
                Z: z === '' ? null : Number(z),
                rawCode: rest.join(',').trim(),
            });
        }
        return rows;
    }

    async function handlePreview() {
        setMatcherError(null);
        setCommitSummary(null);
        if (!selectedAssignmentId) {
            setMatcherError('Pick an assignment first.');
            return;
        }
        setMatcherBusy(true);
        try {
            const rows = parseMatcherInput(matcherInput).map((r) => ({ ...r, rawCode: r.rawCode }));
            const result = await previewRun({ assignmentId: selectedAssignmentId, rows }, supabase);
            setPreviewRows(result.rows);
            setPreviewSummary({ ...result.summary, duplicates_dropped: result.duplicates_dropped });
        } catch (err) {
            setMatcherError(err?.message || String(err));
            setPreviewRows(null);
            setPreviewSummary(null);
        } finally {
            setMatcherBusy(false);
        }
    }

    async function handleCommit() {
        setMatcherError(null);
        if (!selectedAssignmentId) {
            setMatcherError('Pick an assignment first.');
            return;
        }
        if (!window.confirm('Commit to DB? This deletes existing qc_runs and qc_points for this assignment.')) return;
        setMatcherBusy(true);
        try {
            const rows = parseMatcherInput(matcherInput);
            const summary = await processRun({ assignmentId: selectedAssignmentId, rows }, supabase);
            setCommitSummary(summary);
        } catch (err) {
            setMatcherError(err?.message || String(err));
        } finally {
            setMatcherBusy(false);
        }
    }

    function handleRunMatcherTests() {
        setMatcherTestSummary(runMatcherTests());
    }

    const assignmentOptions = useMemo(() => {
        return (assignments || []).map((a) => ({
            id: a.id,
            label: `${a.title || 'Untitled'} — ${a.assignment_date || '?'}  (${a.id.slice(0, 8)}…)`,
        }));
    }, [assignments]);

    return (
        <div style={pageStyle}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>
                    SOS Parser Tester
                </h1>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Dev-only tool for validating SurveyOS Stake Code (SOS) strings and the Stage 10.2 matcher.
                    See <code style={codeStyle}>docs/sos-stake-code-standard.md</code> for the grammar.
                </div>
            </div>

            <section style={sectionStyle}>
                <h2 style={h2Style}>Parse codes</h2>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    rows={14}
                    style={textareaStyle}
                    spellCheck={false}
                />
                <div style={{ marginTop: '10px' }}>
                    <button type="button" onClick={handleParse} style={buttonStyle('teal')}>
                        Parse all
                    </button>
                </div>

                {parsed && (
                    <div style={{ marginTop: '20px', overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr>
                                    <th style={thStyle}>#</th>
                                    <th style={thStyle}>Raw</th>
                                    <th style={thStyle}>Type</th>
                                    <th style={thStyle}>Design refs</th>
                                    <th style={thStyle}>Offset</th>
                                    <th style={thStyle}>Stake</th>
                                    <th style={thStyle}>Status</th>
                                    <th style={thStyle}>Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsed.map((row) => {
                                    const r = row.result;
                                    const ok = r.type !== 'parse_error';
                                    return (
                                        <tr key={row.lineNum}>
                                            <td style={tdStyle}>{row.lineNum}</td>
                                            <td style={tdMono}>{JSON.stringify(row.raw)}</td>
                                            <td style={tdMono}>{r.type}</td>
                                            <td style={tdMono}>
                                                {r.design_refs.length ? r.design_refs.join(', ') : '—'}
                                            </td>
                                            <td style={tdMono}>{r.offset == null ? '—' : r.offset}</td>
                                            <td style={tdMono}>{r.stake || '—'}</td>
                                            <td style={{ ...tdStyle, color: ok ? 'var(--success)' : 'var(--error)', fontWeight: 700 }}>
                                                {ok ? 'OK' : 'ERR'}
                                            </td>
                                            <td style={{ ...tdStyle, color: 'var(--error)', maxWidth: '400px' }}>
                                                {r.error || ''}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section style={sectionStyle}>
                <h2 style={h2Style}>Parser test suite</h2>
                <button type="button" onClick={handleRunTests} style={buttonStyle('amber')}>
                    Run parser test suite
                </button>

                {testSummary && (
                    <div style={{ marginTop: '16px' }}>
                        <div style={{
                            fontSize: '16px',
                            fontWeight: 700,
                            marginBottom: '12px',
                            color: testSummary.failed === 0 ? 'var(--success)' : 'var(--error)',
                        }}>
                            {testSummary.passed}/{testSummary.total} passed
                            {testSummary.failed > 0 && ` — ${testSummary.failed} failed`}
                        </div>

                        {testSummary.failed > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>Test</th>
                                            <th style={thStyle}>Input</th>
                                            <th style={thStyle}>Expected</th>
                                            <th style={thStyle}>Actual</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {testSummary.results.filter((r) => !r.pass).map((r, i) => (
                                            <tr key={i}>
                                                <td style={tdStyle}>{r.name}</td>
                                                <td style={tdMono}>{JSON.stringify(r.input)}</td>
                                                <td style={tdMono}>{JSON.stringify(r.expected)}</td>
                                                <td style={tdMono}>{JSON.stringify(r.actual)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </section>

            <section style={sectionStyle}>
                <h2 style={h2Style}>Matcher playground</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: '12.5px', marginBottom: '12px' }}>
                    Paste one observation per line as <code style={codeStyle}>observed_point_id,N,E,Z,raw_code</code>.
                    Preview runs parser + matcher locally. Commit deletes prior qc_runs / qc_points for the selected
                    assignment and writes a fresh run.
                </div>

                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                        Assignment
                    </label>
                    <select
                        value={selectedAssignmentId}
                        onChange={(e) => setSelectedAssignmentId(e.target.value)}
                        disabled={assignmentLoading || assignmentOptions.length === 0}
                        style={selectStyle}
                    >
                        {assignmentLoading && <option value="">Loading…</option>}
                        {!assignmentLoading && assignmentOptions.length === 0 && (
                            <option value="">No assignments visible</option>
                        )}
                        {assignmentOptions.map((o) => (
                            <option key={o.id} value={o.id}>{o.label}</option>
                        ))}
                    </select>
                    {assignmentError && (
                        <div style={{ color: 'var(--error)', fontSize: '12px', marginTop: '4px' }}>
                            {assignmentError}
                        </div>
                    )}
                </div>

                <textarea
                    value={matcherInput}
                    onChange={(e) => setMatcherInput(e.target.value)}
                    rows={10}
                    style={textareaStyle}
                    spellCheck={false}
                />

                <div style={{ marginTop: '10px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button type="button" onClick={handlePreview} disabled={matcherBusy} style={buttonStyle('teal')}>
                        Run matcher (preview)
                    </button>
                    <button type="button" onClick={handleCommit} disabled={matcherBusy} style={buttonStyle('amber')}>
                        Run matcher (commit to DB)
                    </button>
                    <button type="button" onClick={handleRunMatcherTests} style={buttonStyle('teal')}>
                        Run matcher test suite
                    </button>
                </div>

                {matcherError && (
                    <div style={{ marginTop: '14px', color: 'var(--error)', fontSize: '13px', fontWeight: 600 }}>
                        {matcherError}
                    </div>
                )}

                {previewSummary && (
                    <div style={{ marginTop: '16px' }}>
                        <div style={{ fontSize: '14px', marginBottom: '10px', color: 'var(--text-muted)' }}>
                            Preview — {previewSummary.total} rows · {previewSummary.matched} matched ·{' '}
                            {previewSummary.out_of_tol} oot · {previewSummary.check_pass} check pass ·{' '}
                            {previewSummary.check_fail} check fail · {previewSummary.unmatched} unmatched ·{' '}
                            {previewSummary.unmatched_check} unmatched check · {previewSummary.parse_error} parse errors ·{' '}
                            {previewSummary.duplicates_dropped} dup dropped
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={tableStyle}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Obs</th>
                                        <th style={thStyle}>Raw</th>
                                        <th style={thStyle}>Shot</th>
                                        <th style={thStyle}>ΔH</th>
                                        <th style={thStyle}>Tol H</th>
                                        <th style={thStyle}>H status</th>
                                        <th style={thStyle}>ΔZ</th>
                                        <th style={thStyle}>V status</th>
                                        <th style={thStyle}>Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(previewRows || []).map((r, i) => (
                                        <tr key={i}>
                                            <td style={tdMono}>{r.observed_point_id}</td>
                                            <td style={tdMono}>{r.raw_code}</td>
                                            <td style={tdMono}>{r.shot_type}</td>
                                            <td style={tdMono}>{fmt(r.delta_h)}</td>
                                            <td style={tdMono}>{fmt(r.effective_tolerance_h)}</td>
                                            <td style={{ ...tdStyle, color: colorFor(r.h_status) }}>{r.h_status}</td>
                                            <td style={tdMono}>{fmt(r.delta_z)}</td>
                                            <td style={{ ...tdStyle, color: colorFor(r.v_status) }}>{r.v_status || ''}</td>
                                            <td style={{ ...tdStyle, color: 'var(--text-muted)', maxWidth: '340px' }}>
                                                {r.field_fit_note || ''}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {commitSummary && (
                    <div style={{ marginTop: '16px', padding: '12px 14px', background: 'var(--bg-dark)', borderRadius: '8px', fontSize: '13px' }}>
                        <div style={{ color: 'var(--success)', fontWeight: 700, marginBottom: '6px' }}>
                            Commit complete — run {commitSummary.run_id}
                        </div>
                        <div style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            total {commitSummary.total_rows} · matched {commitSummary.matched} ·
                            out of tol {commitSummary.out_of_tol} · check pass {commitSummary.check_pass} ·
                            check fail {commitSummary.check_fail} · unmatched {commitSummary.unmatched} ·
                            parse errors {commitSummary.parse_errors} · duplicates dropped {commitSummary.duplicates_dropped}
                        </div>
                    </div>
                )}

                {matcherTestSummary && (
                    <div style={{ marginTop: '16px' }}>
                        <div style={{
                            fontSize: '16px',
                            fontWeight: 700,
                            marginBottom: '12px',
                            color: matcherTestSummary.failed === 0 ? 'var(--success)' : 'var(--error)',
                        }}>
                            Matcher tests: {matcherTestSummary.passed}/{matcherTestSummary.total} passed
                            {matcherTestSummary.failed > 0 && ` — ${matcherTestSummary.failed} failed`}
                        </div>
                        {matcherTestSummary.failed > 0 && (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={tableStyle}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}>Test</th>
                                            <th style={thStyle}>Reason</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {matcherTestSummary.results.filter((r) => !r.pass).map((r, i) => (
                                            <tr key={i}>
                                                <td style={tdStyle}>{r.name}</td>
                                                <td style={{ ...tdMono, color: 'var(--error)' }}>{r.reason}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

function fmt(v) {
    if (v == null || Number.isNaN(v)) return '—';
    if (typeof v === 'number') return v.toFixed(3);
    return String(v);
}

function colorFor(status) {
    if (status === 'in_tol' || status === 'check_pass') return 'var(--success)';
    if (status === 'out_of_tol' || status === 'check_fail' || status === 'parse_error' || status === 'unmatched' || status === 'unmatched_check') return 'var(--error)';
    return 'var(--text-muted)';
}

const pageStyle = {
    padding: '32px',
    maxWidth: '1200px',
    margin: '0 auto',
    color: 'var(--text-main)',
    fontFamily: 'Inter, sans-serif',
};

const sectionStyle = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '20px',
    marginBottom: '20px',
};

const h2Style = {
    margin: '0 0 12px',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
};

const textareaStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '12px 14px',
    background: 'var(--bg-dark)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '13px',
    lineHeight: 1.5,
    resize: 'vertical',
};

const selectStyle = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    background: 'var(--bg-dark)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    fontFamily: 'inherit',
    fontSize: '13px',
};

const codeStyle = {
    background: 'var(--bg-surface)',
    padding: '1px 6px',
    borderRadius: '4px',
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12px',
};

const tableStyle = {
    borderCollapse: 'collapse',
    width: '100%',
    fontSize: '13px',
};

const thStyle = {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)',
    fontWeight: 600,
    fontSize: '11px',
    letterSpacing: '0.4px',
    textTransform: 'uppercase',
};

const tdStyle = {
    padding: '8px 10px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
    verticalAlign: 'top',
};

const tdMono = {
    ...tdStyle,
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: '12.5px',
};

function buttonStyle(variant) {
    const bg = variant === 'amber' ? 'var(--brand-amber)' : 'var(--brand-teal)';
    return {
        background: bg,
        color: '#fff',
        border: 'none',
        borderRadius: '8px',
        padding: '10px 20px',
        fontSize: '14px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
    };
}
