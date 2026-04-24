import React, { useState } from 'react';
import { parseStakeCode } from '../../lib/sosParser.js';
import { runTests } from '../../lib/sosParser.test.js';

// ─── SosParserTester ──────────────────────────────────────────────────
// Dev-only page for exercising the SOS parser. Paste codes, click parse,
// inspect the structured output. Includes a "Run test suite" button that
// invokes the hand-rolled runTests() harness from sosParser.test.js and
// shows pass/fail counts.
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

export default function SosParserTester() {
    const [input, setInput] = useState(SAMPLE);
    const [parsed, setParsed] = useState(null);
    const [testSummary, setTestSummary] = useState(null);

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

    return (
        <div style={pageStyle}>
            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ margin: '0 0 4px', fontSize: '24px', fontWeight: 700, color: 'var(--text-main)' }}>
                    SOS Parser Tester
                </h1>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Dev-only tool for validating SurveyOS Stake Code (SOS) strings. See{' '}
                    <code style={codeStyle}>docs/sos-stake-code-standard.md</code> for the grammar.
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
                                                {ok ? '✓' : '✗'}
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
                <h2 style={h2Style}>Test suite</h2>
                <button type="button" onClick={handleRunTests} style={buttonStyle('amber')}>
                    Run test suite
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
                            {testSummary.failed > 0 && ` · ${testSummary.failed} failed`}
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
        </div>
    );
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
