import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, X, AlertTriangle, Loader } from 'lucide-react';
import { exportAsCSV, exportAsXLSX } from '../utils/stakeoutExports.js';

// ─── ReconciliationModal ──────────────────────────────────────────────
// Terminal-state transition: status 'submitted' → 'reconciled'. Writes
// reconciled_at / reconciled_by / reconciliation_note, then optionally
// generates CSV + XLSX reports and uploads them to the stakeout-reports
// bucket at {project_id}/{assignment_id}_{iso}_qc_report.{ext}.
//
// Report upload is best-effort — if storage fails we still keep the
// reconciliation, because the timestamp + note are the load-bearing
// part of the workflow. A warning toast tells the PM what to retry.

export default function ReconciliationModal({
    supabase,
    profile,
    assignment,
    project,
    chiefName,
    qcRows,
    qcSummary,
    onClose,
    onReconciled,
    onToast,
}) {
    const [note, setNote] = useState('');
    const [generateReports, setGenerateReports] = useState(true);
    const [busy, setBusy] = useState(false);
    const cardRef = useRef(null);

    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape' && !busy) {
                e.stopPropagation();
                onClose();
            }
        }
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [busy, onClose]);

    const summary = qcSummary || {};
    const pendingCount = summary.pending || 0;

    async function handleReconcile() {
        if (busy) return;
        setBusy(true);

        const reconciledAt = new Date().toISOString();
        const updates = {
            status: 'reconciled',
            reconciled_at: reconciledAt,
            reconciled_by: profile?.id || null,
            reconciliation_note: note.trim() || null,
        };

        // 1) Update the assignment. If this fails we abort and leave the
        //    modal open so the user can retry.
        let updated;
        try {
            const { data, error } = await supabase
                .from('stakeout_assignments')
                .update(updates)
                .eq('id', assignment.id)
                .select('*')
                .single();
            if (error) throw error;
            updated = data;
        } catch (err) {
            console.error('[ReconciliationModal] update failed:', err);
            if (onToast)
                onToast(
                    'error',
                    `Could not reconcile${err?.code ? ` (code ${err.code})` : ''}. Try again.`,
                );
            setBusy(false);
            return;
        }

        // 2) Generate reports + upload. Best-effort — a storage failure is
        //    logged and flagged but does not revert the reconciliation.
        if (generateReports) {
            try {
                await generateAndUploadReports({
                    supabase,
                    assignment: updated,
                    project,
                    chiefName,
                    qcRows,
                });
                if (onToast)
                    onToast('success', 'Assignment reconciled and reports saved to vault.');
            } catch (err) {
                console.error('[ReconciliationModal] report generation failed:', err);
                if (onToast)
                    onToast(
                        'error',
                        'Assignment reconciled, but report generation failed. Download manually from the Export buttons.',
                    );
            }
        } else if (onToast) {
            onToast('success', 'Assignment reconciled.');
        }

        onReconciled(updated);
    }

    return (
        <div
            style={backdrop}
            onClick={() => (busy ? null : onClose())}
            role="dialog"
            aria-modal="true"
            aria-label="Reconcile assignment"
        >
            <div ref={cardRef} style={modalCard} onClick={(e) => e.stopPropagation()}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '14px',
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: '16px', color: 'var(--text-main)' }}>
                        Reconcile{' '}
                        <span style={{ color: 'var(--brand-amber)' }}>"{assignment.title}"</span>
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        aria-label="Close"
                        style={closeBtn}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* QC summary strip */}
                <div style={summaryStrip}>
                    <SummaryStat label="Total" value={summary.total ?? 0} color="var(--brand-amber)" />
                    <SummaryStat label="In tol" value={summary.in_tol ?? 0} color="var(--success)" />
                    <SummaryStat label="Out" value={summary.out_of_tol ?? 0} color="var(--error)" />
                    <SummaryStat label="Field fit" value={summary.field_fit ?? 0} color="var(--brand-amber)" />
                    <SummaryStat label="Built on" value={summary.built_on ?? 0} color="rgba(201, 116, 242, 1)" />
                    <SummaryStat label="Pending" value={summary.pending ?? 0} color="var(--text-muted)" />
                </div>

                {pendingCount > 0 && (
                    <div style={pendingWarn}>
                        <AlertTriangle size={16} color="var(--brand-amber)" style={{ flexShrink: 0 }} />
                        <span>
                            <strong className="coordinate-data" style={{ color: 'var(--brand-amber)' }}>
                                {pendingCount}
                            </strong>{' '}
                            point{pendingCount === 1 ? '' : 's'} have no observation yet. Reconcile anyway?
                        </span>
                    </div>
                )}

                <label htmlFor="recon-note" style={labelStyle}>
                    Notes (optional)
                </label>
                <textarea
                    id="recon-note"
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note about this reconciliation, field conversations with the chief, etc."
                    style={textareaStyle}
                    disabled={busy}
                />

                <label
                    htmlFor="recon-reports"
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        cursor: busy ? 'not-allowed' : 'pointer',
                        color: 'var(--text-main)',
                        fontSize: '13px',
                        marginTop: '14px',
                        marginBottom: '4px',
                    }}
                >
                    <input
                        id="recon-reports"
                        type="checkbox"
                        checked={generateReports}
                        onChange={(e) => setGenerateReports(e.target.checked)}
                        disabled={busy}
                        style={{ marginTop: '2px', accentColor: 'var(--brand-teal)' }}
                    />
                    <span>
                        Generate QC report files (CSV + XLSX) and save to project vault
                        <div
                            style={{
                                color: 'var(--text-muted)',
                                fontSize: '11.5px',
                                marginTop: '3px',
                                lineHeight: 1.4,
                            }}
                        >
                            Reports will be available for download on the client portal and in the
                            assignment history.
                        </div>
                    </span>
                </label>

                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'flex-end',
                        gap: '10px',
                        marginTop: '18px',
                        flexWrap: 'wrap',
                    }}
                >
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={busy}
                        style={secondaryBtn(busy)}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleReconcile}
                        disabled={busy}
                        style={primaryBtn(busy)}
                    >
                        {busy ? (
                            <>
                                <Loader size={14} className="spinning" /> Reconciling…
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={14} /> Reconcile
                            </>
                        )}
                    </button>
                </div>

                <style>{`
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                    .spinning { animation: spin 1s linear infinite; }
                `}</style>
            </div>
        </div>
    );
}

// ── Report generation + upload ─────────────────────────────────────────

async function generateAndUploadReports({ supabase, assignment, project, chiefName, qcRows }) {
    const metadata = {
        project_name: project?.project_name || '(unknown project)',
        assignment_title: assignment.title,
        assignment_date: assignment.assignment_date,
        party_chief_name: chiefName || null,
        instrument: null,
        tolerance_h: assignment.default_tolerance_h,
    };

    const csvResult = exportAsCSV({ rows: qcRows || [], metadata });
    const xlsxResult = await exportAsXLSX({ rows: qcRows || [], metadata });

    const projectId = assignment.project_id;
    const stampIso = new Date().toISOString().replace(/[:.]/g, '-');
    const basePath = `${projectId}/${assignment.id}_${stampIso}_qc_report`;

    const csvUp = await supabase.storage
        .from('stakeout-reports')
        .upload(`${basePath}.csv`, csvResult.blob, {
            contentType: 'text/csv;charset=utf-8',
            upsert: false,
        });
    if (csvUp.error) throw csvUp.error;

    const xlsxUp = await supabase.storage
        .from('stakeout-reports')
        .upload(`${basePath}.xlsx`, xlsxResult.blob, {
            contentType:
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            upsert: false,
        });
    if (xlsxUp.error) throw xlsxUp.error;

    // Record report entries in stakeout_qc_reports (audit trail).
    // Best-effort — failures here are logged but non-fatal.
    try {
        await supabase.from('stakeout_qc_reports').insert([
            {
                assignment_id: assignment.id,
                format: 'csv',
                storage_path: `${basePath}.csv`,
                generated_by: assignment.reconciled_by || null,
            },
            {
                assignment_id: assignment.id,
                format: 'xlsx',
                storage_path: `${basePath}.xlsx`,
                generated_by: assignment.reconciled_by || null,
            },
        ]);
    } catch (err) {
        console.warn('[ReconciliationModal] qc_reports audit insert failed (non-fatal):', err);
    }
}

// ── Sub-components + styles ────────────────────────────────────────────

function SummaryStat({ label, value, color }) {
    return (
        <div
            style={{
                flex: '1 1 60px',
                minWidth: '60px',
                backgroundColor: 'var(--bg-dark)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '8px',
                padding: '8px 10px',
                textAlign: 'center',
            }}
        >
            <div
                className="coordinate-data"
                style={{ color, fontSize: '18px', fontWeight: 600, lineHeight: 1 }}
            >
                {value}
            </div>
            <div
                style={{
                    color: 'var(--text-muted)',
                    fontSize: '10px',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    marginTop: '4px',
                    fontWeight: 600,
                }}
            >
                {label}
            </div>
        </div>
    );
}

const backdrop = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(3px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
};

const modalCard = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '22px',
    width: '100%',
    maxWidth: '500px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
    color: 'var(--text-main)',
    fontFamily: 'inherit',
};

const closeBtn = {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    padding: '4px',
    display: 'inline-flex',
    alignItems: 'center',
};

const summaryStrip = {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap',
    marginBottom: '14px',
};

const pendingWarn = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    backgroundColor: 'var(--brand-amber-muted)',
    border: '1px solid var(--brand-amber)',
    borderRadius: '8px',
    color: 'var(--text-main)',
    fontSize: '13px',
    lineHeight: 1.5,
    marginBottom: '14px',
};

const labelStyle = {
    display: 'block',
    color: 'var(--text-muted)',
    fontSize: '11.5px',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: '6px',
    marginTop: '4px',
};

const textareaStyle = {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: 'var(--bg-dark)',
    color: 'var(--text-main)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '6px',
    padding: '9px 11px',
    fontSize: '13px',
    fontFamily: 'inherit',
    resize: 'vertical',
    minHeight: '72px',
};

function primaryBtn(disabled) {
    return {
        backgroundColor: 'var(--brand-teal)',
        color: '#fff',
        border: '1px solid var(--brand-teal)',
        padding: '9px 16px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
        fontSize: '13px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'inherit',
    };
}

function secondaryBtn(disabled) {
    return {
        backgroundColor: 'transparent',
        color: 'var(--text-main)',
        border: '1px solid var(--border-subtle)',
        padding: '9px 16px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 500,
        fontSize: '13px',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'inherit',
    };
}
