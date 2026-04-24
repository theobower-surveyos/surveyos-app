import React, { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useCrewAssignmentDetail } from '../../hooks/useCrewAssignmentDetail';
import ConfirmSubmitModal from './ConfirmSubmitModal.jsx';
import ScopeChecklist from './ScopeChecklist.jsx';
import ChiefFieldNotes from './ChiefFieldNotes.jsx';

// ─── CrewAssignmentDetail ─────────────────────────────────────────────
// Three render modes driven by assignment.status:
//   sent        → pre-work info (notes, client contact, scope
//                 checklist), "Start work" CTA
//   in_progress → scope checklist, tolerances, PM notes textarea,
//                 "Submit for QC" CTA (confirmation gated)
//   submitted   → status summary, final checklist state, read-back of
//                 chief's notes, no CTA
//
// The plan view was intentionally removed in 9.4b — chiefs navigate
// with Trimble Access on the data collector, so the SurveyOS plan
// view added noise without field value. A PDF-attachment area will
// replace it in a later stage.

const STATUS_LABELS = {
    draft: 'Draft',
    sent: 'Sent to crew',
    in_progress: 'In progress',
    submitted: 'Awaiting PM review',
    reconciled: 'Reconciled',
};

function formatDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function CrewAssignmentDetail({ assignmentId, onBack }) {
    const { assignment, error, loading, refresh } =
        useCrewAssignmentDetail({ assignmentId });
    const [actionError, setActionError] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [starting, setStarting] = useState(false);

    async function handleStart() {
        setActionError(null);
        setStarting(true);
        const { error: updateError } = await supabase
            .from('stakeout_assignments')
            .update({ status: 'in_progress' })
            .eq('id', assignmentId);
        setStarting(false);
        if (updateError) {
            setActionError(`Couldn't start work: ${updateError.message}`);
            return;
        }
        await refresh();
    }

    async function handleSubmit() {
        setActionError(null);
        setSubmitting(true);
        const { error: updateError } = await supabase
            .from('stakeout_assignments')
            .update({
                status: 'submitted',
                submitted_at: new Date().toISOString(),
            })
            .eq('id', assignmentId);
        setSubmitting(false);
        setConfirmOpen(false);
        if (updateError) {
            setActionError(`Couldn't submit: ${updateError.message}`);
            return;
        }
        await refresh();
    }

    if (loading) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                Loading assignment…
            </div>
        );
    }

    if (error || !assignment) {
        return (
            <div style={{ padding: '20px', color: 'var(--text-main)' }}>
                <BackHeader onBack={onBack} title="Assignment" />
                <div style={errorStyle}>
                    Couldn't load assignment{error ? `: ${error}` : '.'}
                </div>
            </div>
        );
    }

    const status = assignment.status || 'draft';
    const project = assignment.project;

    return (
        <div style={{ color: 'var(--text-main)', display: 'flex', flexDirection: 'column', height: '100%' }}>
            <BackHeader onBack={onBack} title={assignment.title} />

            <div style={{ padding: '8px 16px 0' }}>
                <StatusPill status={status} />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                <div style={{ marginBottom: '20px' }}>
                    {project && (
                        <div style={{ fontSize: '15px', color: 'var(--text-main)', marginBottom: '4px', fontWeight: 500 }}>
                            {project.project_name}
                        </div>
                    )}
                    {project?.location && (
                        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '2px' }}>
                            {project.location}
                        </div>
                    )}
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                        {formatDate(assignment.assignment_date)}
                        {assignment.expected_hours != null && ` · ~${assignment.expected_hours} hours`}
                    </div>
                </div>

                {status === 'sent' && (
                    <>
                        {assignment.notes && (
                            <Section title="Site access & notes">
                                <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.5 }}>
                                    {assignment.notes}
                                </div>
                            </Section>
                        )}
                        {(assignment.client_contact_name || assignment.client_contact_phone) && (
                            <Section title="Client contact">
                                {assignment.client_contact_name && (
                                    <div style={{ fontSize: '14px' }}>{assignment.client_contact_name}</div>
                                )}
                                {assignment.client_contact_role && (
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                                        {assignment.client_contact_role}
                                    </div>
                                )}
                                {assignment.client_contact_phone && (
                                    <a
                                        href={`tel:${assignment.client_contact_phone}`}
                                        style={{ fontSize: '14px', color: 'var(--brand-teal-light)', display: 'inline-block', marginTop: '4px' }}
                                    >
                                        {assignment.client_contact_phone}
                                    </a>
                                )}
                                {assignment.client_contact_notes && (
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px', whiteSpace: 'pre-wrap' }}>
                                        {assignment.client_contact_notes}
                                    </div>
                                )}
                            </Section>
                        )}
                        <Section title="Scope checklist">
                            <ScopeChecklist
                                assignmentId={assignment.id}
                                items={assignment.scope_checklist || []}
                                onChange={() => refresh()}
                            />
                        </Section>
                    </>
                )}

                {status === 'in_progress' && (
                    <>
                        <Section title="Scope checklist">
                            <ScopeChecklist
                                assignmentId={assignment.id}
                                items={assignment.scope_checklist || []}
                                onChange={() => refresh()}
                            />
                        </Section>

                        <Section title="Tolerances">
                            <div style={{ fontSize: '14px', fontFamily: "'JetBrains Mono', monospace" }}>
                                H: {assignment.default_tolerance_h ?? '—'} ft · V: {assignment.default_tolerance_v ?? '—'} ft
                            </div>
                        </Section>

                        <Section title="Notes for the PM">
                            <ChiefFieldNotes
                                assignmentId={assignment.id}
                                initialValue={assignment.chief_field_notes}
                            />
                        </Section>
                    </>
                )}

                {status === 'submitted' && (
                    <>
                        <Section title="Status">
                            <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                                Work submitted on{' '}
                                {assignment.submitted_at
                                    ? new Date(assignment.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                                    : 'recently'}
                                . The PM will review your work and reconcile.
                            </div>
                        </Section>

                        {assignment.scope_checklist && assignment.scope_checklist.length > 0 && (
                            <Section title="Scope checklist">
                                <ScopeChecklist
                                    assignmentId={assignment.id}
                                    items={assignment.scope_checklist}
                                    onChange={() => refresh()}
                                />
                            </Section>
                        )}

                        {assignment.chief_field_notes && (
                            <Section title="Your notes">
                                <div style={{
                                    whiteSpace: 'pre-wrap',
                                    fontSize: '14px',
                                    lineHeight: 1.5,
                                    padding: '12px 14px',
                                    background: 'var(--bg-surface)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '10px',
                                }}>
                                    {assignment.chief_field_notes}
                                </div>
                            </Section>
                        )}
                    </>
                )}
            </div>

            {status === 'sent' && (
                <ActionFooter>
                    {actionError && <ErrorBar>{actionError}</ErrorBar>}
                    <button
                        type="button"
                        onClick={handleStart}
                        disabled={starting}
                        style={primaryButton('amber', starting)}
                    >
                        {starting ? 'Starting…' : 'Start work'}
                    </button>
                </ActionFooter>
            )}

            {status === 'in_progress' && (
                <ActionFooter>
                    {actionError && <ErrorBar>{actionError}</ErrorBar>}
                    <button
                        type="button"
                        onClick={() => setConfirmOpen(true)}
                        style={primaryButton('teal', false)}
                    >
                        Submit for QC
                    </button>
                </ActionFooter>
            )}

            <ConfirmSubmitModal
                open={confirmOpen}
                onCancel={() => !submitting && setConfirmOpen(false)}
                onConfirm={handleSubmit}
                submitting={submitting}
            />
        </div>
    );
}

function BackHeader({ onBack, title }) {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '12px 8px 8px 8px',
            borderBottom: '1px solid var(--border-subtle)',
            flex: '0 0 auto',
        }}>
            <button
                type="button"
                onClick={onBack}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--brand-teal-light)',
                    padding: '8px',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '2px',
                    fontSize: '15px',
                    fontFamily: 'inherit',
                }}
                aria-label="Back"
            >
                <ChevronLeft size={20} />
                Back
            </button>
            <div style={{
                fontSize: '16px',
                fontWeight: 600,
                color: 'var(--text-main)',
                marginLeft: '4px',
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
            }}>
                {title}
            </div>
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div style={{ marginBottom: '20px' }}>
            <h4 style={{
                margin: '0 0 8px',
                fontSize: '11px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                fontWeight: 600,
            }}>
                {title}
            </h4>
            {children}
        </div>
    );
}

function StatusPill({ status }) {
    const colors = {
        sent:        { bg: 'rgba(13, 79, 79, 0.25)',    fg: 'var(--brand-teal-light)' },
        in_progress: { bg: 'rgba(212, 145, 42, 0.20)',  fg: 'var(--brand-amber)' },
        submitted:   { bg: 'rgba(168, 85, 247, 0.18)',  fg: '#c084fc' },
        reconciled:  { bg: 'rgba(22, 163, 74, 0.18)',   fg: 'var(--success)' },
        draft:       { bg: 'rgba(148, 163, 184, 0.15)', fg: '#94a3b8' },
    };
    const c = colors[status] || colors.draft;
    return (
        <span style={{
            display: 'inline-block',
            padding: '4px 12px',
            borderRadius: '999px',
            background: c.bg,
            color: c.fg,
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.3px',
        }}>
            {STATUS_LABELS[status] || status}
        </span>
    );
}

function ActionFooter({ children }) {
    return (
        <div style={{
            flex: '0 0 auto',
            padding: '12px 16px',
            paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--bg-dark)',
        }}>
            {children}
        </div>
    );
}

function ErrorBar({ children }) {
    return (
        <div style={{
            color: 'var(--error)',
            fontSize: '13px',
            marginBottom: '10px',
            padding: '8px 12px',
            background: 'rgba(220, 38, 38, 0.10)',
            border: '1px solid rgba(220, 38, 38, 0.40)',
            borderRadius: '8px',
        }}>
            {children}
        </div>
    );
}

function primaryButton(variant, disabled) {
    const bg = variant === 'amber' ? 'var(--brand-amber)' : 'var(--brand-teal)';
    return {
        width: '100%',
        minHeight: '56px',
        background: bg,
        color: '#fff',
        border: 'none',
        borderRadius: '10px',
        fontSize: '16px',
        fontWeight: 600,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontFamily: 'inherit',
    };
}

const errorStyle = {
    color: 'var(--error)',
    background: 'rgba(220, 38, 38, 0.10)',
    border: '1px solid rgba(220, 38, 38, 0.40)',
    borderRadius: '8px',
    padding: '12px',
    fontSize: '13px',
    marginBottom: '16px',
};
