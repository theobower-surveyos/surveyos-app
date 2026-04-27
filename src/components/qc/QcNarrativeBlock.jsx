import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { useQcNarrative } from '../../hooks/useQcNarrative';

// ─── QcNarrativeBlock ─────────────────────────────────────────────────
// Reusable display for the Claude-generated QC summary. Sits at the
// top of PM AssignmentDetail and (in compact mode) at the top of the
// chief scoreboard. Stage 11.2 polish:
//
//   • Visual emphasis — teal left border + subtle teal background
//     tint mark this as the lede content.
//   • PM regenerate button — top-right. Gated on `canRegenerate`
//     prop (only AssignmentDetail passes it true).
//   • Chief retry button — only renders when narrative is in an
//     error / missing state. Same Edge Function invocation as the
//     PM regenerate, just a different surface.
//   • 30-second client-side cooldown shared by both buttons. Prevents
//     accidental rapid-fire regen taps; server-side rate limits are
//     deferred.

const COOLDOWN_MS = 30000;

export default function QcNarrativeBlock({ runId, compact = false, canRegenerate = false }) {
    const { narrative, loading, regenerate } = useQcNarrative({ runId });
    const [cooldownUntil, setCooldownUntil] = useState(0);
    const [, forceTick] = useState(0);
    const tickerRef = useRef(null);

    useEffect(() => {
        if (cooldownUntil <= Date.now()) return;
        tickerRef.current = setInterval(() => {
            forceTick((n) => n + 1);
            if (Date.now() >= cooldownUntil) {
                clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
        }, 1000);
        return () => {
            if (tickerRef.current) {
                clearInterval(tickerRef.current);
                tickerRef.current = null;
            }
        };
    }, [cooldownUntil]);

    const onCooldown = Date.now() < cooldownUntil;
    const cooldownRemainingSec = onCooldown ? Math.ceil((cooldownUntil - Date.now()) / 1000) : 0;

    async function handleRegenerate() {
        if (onCooldown || loading) return;
        setCooldownUntil(Date.now() + COOLDOWN_MS);
        await regenerate();
    }

    if (!runId) return null;

    const containerStyle = {
        position: 'relative',
        padding: compact ? '14px 16px' : '18px 20px',
        background: 'rgba(15, 110, 86, 0.04)',
        border: '1px solid var(--border-subtle)',
        borderLeft: '4px solid var(--brand-teal)',
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

    const regenButtonStyle = {
        position: 'absolute',
        top: '12px',
        right: '12px',
        background: 'transparent',
        border: '1px solid var(--border-subtle)',
        borderRadius: '6px',
        padding: '6px 10px',
        color: 'var(--text-muted)',
        fontSize: '12px',
        fontFamily: 'inherit',
        cursor: onCooldown || loading ? 'default' : 'pointer',
        opacity: onCooldown || loading ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'opacity 120ms',
    };

    const retryButtonStyle = {
        marginTop: '10px',
        padding: '6px 12px',
        background: 'var(--brand-teal)',
        color: '#fff',
        border: 'none',
        borderRadius: '6px',
        fontSize: '12px',
        fontWeight: 500,
        cursor: onCooldown || loading ? 'default' : 'pointer',
        opacity: onCooldown || loading ? 0.5 : 1,
        fontFamily: 'inherit',
    };

    function renderRegenButton() {
        if (!canRegenerate) return null;
        return (
            <button
                type="button"
                onClick={handleRegenerate}
                disabled={onCooldown || loading}
                style={regenButtonStyle}
                title={onCooldown ? `Regenerate in ${cooldownRemainingSec}s` : 'Regenerate summary'}
            >
                <RefreshCw
                    size={12}
                    style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
                />
                {onCooldown ? `${cooldownRemainingSec}s` : 'Regenerate'}
            </button>
        );
    }

    function renderRetryButton(label = 'Try again') {
        if (canRegenerate) return null;
        return (
            <button
                type="button"
                onClick={handleRegenerate}
                disabled={onCooldown || loading}
                style={retryButtonStyle}
            >
                {onCooldown ? `Try again in ${cooldownRemainingSec}s` : label}
            </button>
        );
    }

    if (loading) {
        return (
            <div style={containerStyle}>
                {renderRegenButton()}
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
                {renderRegenButton()}
                <div style={labelStyle}>Run summary</div>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Summary unavailable.
                </div>
                {renderRetryButton()}
            </div>
        );
    }

    if (narrative.error && !narrative.body) {
        return (
            <div style={containerStyle}>
                {renderRegenButton()}
                <div style={labelStyle}>Run summary</div>
                <div style={{
                    fontSize: '13px',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                }}>
                    <AlertCircle size={14} style={{ color: 'var(--error)', flex: '0 0 auto', marginTop: '2px' }} />
                    <span>
                        Summary unavailable.{canRegenerate ? ' Click regenerate to try again.' : ''}
                    </span>
                </div>
                {renderRetryButton()}
                <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic' }}>
                    Error logged · {new Date(narrative.generated_at).toLocaleString()}
                </div>
            </div>
        );
    }

    return (
        <div style={containerStyle}>
            {renderRegenButton()}
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
