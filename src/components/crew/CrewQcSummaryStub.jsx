import React from 'react';

// ─── CrewQcSummaryStub ────────────────────────────────────────────────
// Minimal placeholder for the Stage 10.4 chief-facing scoreboard.
// Renders the upload-summary counts in a single card. Stage 10.4 will
// replace this with the full point-by-point view, big numbers, and
// green/yellow/red disposition.

export default function CrewQcSummaryStub({ summary }) {
    if (!summary) return null;
    const {
        total_rows,
        matched,
        out_of_tol,
        check_pass,
        check_fail,
        unmatched,
        parse_errors,
    } = summary;

    const inTol = Math.max(0, matched - out_of_tol);

    const breakdown = [];
    if (out_of_tol > 0) breakdown.push(`${out_of_tol} out of tolerance`);
    if (check_pass > 0) breakdown.push(`${check_pass} check passed`);
    if (check_fail > 0) breakdown.push(`${check_fail} check failed`);
    if (unmatched > 0) breakdown.push(`${unmatched} unmatched`);
    if (parse_errors > 0) breakdown.push(`${parse_errors} parse error${parse_errors === 1 ? '' : 's'}`);
    breakdown.push(`Total ${total_rows} observations`);

    return (
        <div style={{
            padding: '16px 14px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '12px',
            color: 'var(--text-main)',
        }}>
            <div style={{
                fontSize: '11px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                marginBottom: '10px',
                fontWeight: 600,
            }}>
                Last upload
            </div>
            <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '4px' }}>
                {inTol} of {matched} stakes in tolerance
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {breakdown.join(' · ')}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '10px', fontStyle: 'italic' }}>
                Detailed point-by-point view coming in Stage 10.4.
            </div>
        </div>
    );
}
