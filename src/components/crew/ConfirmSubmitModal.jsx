import React from 'react';

// ─── ConfirmSubmitModal ───────────────────────────────────────────────
// Bottom-sheet style confirmation that the chief really wants to submit
// the assignment for QC. Field-submit is one-way from the crew side —
// PM handles any corrections from the office. Tapping the backdrop
// cancels (unless we're mid-submit).

export default function ConfirmSubmitModal({ open, onCancel, onConfirm, submitting }) {
    if (!open) return null;

    return (
        <div
            role="dialog"
            aria-modal="true"
            onClick={() => !submitting && onCancel()}
            style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(10, 15, 30, 0.75)',
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'center',
                zIndex: 1000,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: '100%',
                    maxWidth: '480px',
                    background: 'var(--bg-surface)',
                    borderTopLeftRadius: '16px',
                    borderTopRightRadius: '16px',
                    padding: '20px 16px',
                    paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
                    color: 'var(--text-main)',
                }}
            >
                <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 600 }}>
                    Submit for QC?
                </h3>
                <p style={{ margin: '0 0 20px', color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.5 }}>
                    This marks your work complete and notifies the PM to review. You won't be able to undo this from the field — the PM will handle any corrections on their end.
                </p>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={submitting}
                    style={{
                        width: '100%',
                        minHeight: '56px',
                        background: 'var(--brand-teal)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '16px',
                        fontWeight: 600,
                        cursor: submitting ? 'default' : 'pointer',
                        opacity: submitting ? 0.6 : 1,
                        marginBottom: '10px',
                        fontFamily: 'inherit',
                    }}
                >
                    {submitting ? 'Submitting…' : 'Yes, submit for QC'}
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    disabled={submitting}
                    style={{
                        width: '100%',
                        minHeight: '48px',
                        background: 'transparent',
                        color: 'var(--text-main)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                        fontSize: '15px',
                        fontWeight: 500,
                        cursor: submitting ? 'default' : 'pointer',
                        opacity: submitting ? 0.6 : 1,
                        fontFamily: 'inherit',
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
