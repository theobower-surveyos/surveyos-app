import React from 'react';
import { useQcNarrative } from '../../hooks/useQcNarrative';

// ─── QcNarrativeBlock ─────────────────────────────────────────────────
// Reusable display for a Claude-generated QC summary. Lives at the top
// of the PM-side AssignmentDetail QC area and (in compact mode) at the
// top of the chief-side scoreboard. Reads via useQcNarrative — that
// hook polls the table while generation is in flight.
//
// States rendered:
//   • loading       → "Generating summary…"
//   • no row found  → "Summary unavailable." (polling timed out)
//   • row.error set → "Summary unavailable. {error excerpt}"
//   • row.body set  → narrative paragraph + AI-generated timestamp

export default function QcNarrativeBlock({ runId, compact = false }) {
    const { narrative, loading } = useQcNarrative({ runId });

    if (!runId) return null;

    const containerStyle = {
        padding: compact ? '12px 14px' : '16px 18px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        color: 'var(--text-main)',
        marginBottom: compact ? '12px' : '16px',
    };

    const labelStyle = {
        fontSize: '11px',
        letterSpacing: '1px',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        marginBottom: '10px',
        fontWeight: 600,
    };

    if (loading) {
        return (
            <div style={containerStyle}>
                <div style={labelStyle}>Run summary</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Generating summary…
                </div>
            </div>
        );
    }

    if (!narrative) {
        return (
            <div style={containerStyle}>
                <div style={labelStyle}>Run summary</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Summary unavailable.
                </div>
            </div>
        );
    }

    if (narrative.error && !narrative.body) {
        return (
            <div style={containerStyle}>
                <div style={labelStyle}>Run summary</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Summary unavailable. {String(narrative.error).slice(0, 120)}
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            <div style={labelStyle}>Run summary</div>
            <div style={{
                fontSize: compact ? '13px' : '14px',
                lineHeight: 1.6,
                color: 'var(--text-main)',
            }}>
                {narrative.body}
            </div>
            <div style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                marginTop: '8px',
                fontStyle: 'italic',
            }}>
                AI-generated · {new Date(narrative.generated_at).toLocaleString()}
            </div>
        </div>
    );
}
