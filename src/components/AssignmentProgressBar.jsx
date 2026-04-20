import React from 'react';
import { ChevronRight } from 'lucide-react';

// ─── AssignmentProgressBar ────────────────────────────────────────────
// Read-only 5-step lifecycle bar. Pills reflect position in the flow:
// past (completed) / current / future (outlined). Reconciled is terminal
// and uses --success when current. On mobile (≤600px) collapses to just
// the current state as a larger pill to keep the header height in check.

const STEPS = [
    { key: 'draft',       label: 'Draft' },
    { key: 'sent',        label: 'Sent' },
    { key: 'in_progress', label: 'In progress' },
    { key: 'submitted',   label: 'Submitted' },
    { key: 'reconciled',  label: 'Reconciled' },
];

function stepPosition(status) {
    const idx = STEPS.findIndex((s) => s.key === status);
    return idx < 0 ? 0 : idx;
}

export default function AssignmentProgressBar({ status }) {
    const currentIdx = stepPosition(status);

    return (
        <div
            className="asg-progress-wrap"
            role="status"
            aria-label={`Assignment status: ${status || 'draft'}`}
        >
            <style>{`
                .asg-progress-wrap {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    flex-wrap: nowrap;
                    margin: 8px 0 18px 0;
                    opacity: 0;
                    animation: asg-progress-fade 0.2s ease-out forwards;
                }
                @keyframes asg-progress-fade {
                    to { opacity: 1; }
                }
                .asg-pill {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 90px;
                    height: 28px;
                    padding: 0 10px;
                    border-radius: 999px;
                    font-size: 11.5px;
                    font-weight: 600;
                    letter-spacing: 0.3px;
                    text-transform: uppercase;
                    white-space: nowrap;
                    border: 1px solid;
                    box-sizing: border-box;
                }
                .asg-pill.past {
                    background-color: var(--bg-surface);
                    color: var(--text-main);
                    border-color: var(--border-subtle);
                }
                .asg-pill.current {
                    background-color: var(--brand-teal);
                    color: #fff;
                    border-color: var(--brand-teal);
                    box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.12);
                }
                .asg-pill.current.terminal {
                    background-color: var(--success);
                    border-color: var(--success);
                }
                .asg-pill.future {
                    background-color: transparent;
                    color: var(--text-muted);
                    border-color: var(--border-subtle);
                }
                .asg-mobile-pill {
                    display: none;
                }
                @media (max-width: 600px) {
                    .asg-progress-wrap > .asg-pill,
                    .asg-progress-wrap > svg { display: none; }
                    .asg-mobile-pill { display: inline-flex; }
                }
            `}</style>

            {STEPS.map((s, i) => {
                const isPast = i < currentIdx;
                const isCurrent = i === currentIdx;
                const isTerminal = isCurrent && s.key === 'reconciled';
                const cls = isCurrent
                    ? `asg-pill current${isTerminal ? ' terminal' : ''}`
                    : isPast
                        ? 'asg-pill past'
                        : 'asg-pill future';
                return (
                    <React.Fragment key={s.key}>
                        <span className={cls}>{s.label}</span>
                        {i < STEPS.length - 1 && (
                            <ChevronRight size={14} color="var(--text-muted)" aria-hidden="true" />
                        )}
                    </React.Fragment>
                );
            })}

            {/* Mobile: single-pill condensed display */}
            <span
                className={`asg-mobile-pill asg-pill current${
                    status === 'reconciled' ? ' terminal' : ''
                }`}
                style={{ width: 'auto', minWidth: '120px', fontSize: '12px' }}
            >
                {(STEPS.find((s) => s.key === status)?.label || 'Draft')}
            </span>
        </div>
    );
}
