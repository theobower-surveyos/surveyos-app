import React, { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { parsePnezdCsv } from '../../lib/csvParser.js';
import { processRun } from '../../lib/sosProcessRun.js';
import { supabase } from '../../supabaseClient';

// ─── PmUploadButton ───────────────────────────────────────────────────
// Desktop upload button for the AssignmentDetail QC area. Smaller and
// less prominent than the crew-side equivalent — sits in the page
// chrome alongside the existing edit/export buttons. Bubbles the
// summary up through onComplete so the parent can refetch QC data.

export default function PmUploadButton({ assignmentId, onComplete }) {
    const fileInputRef = useRef(null);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);

    async function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        setStatus('processing');
        try {
            const text = await file.text();
            const { rows, errors: parseErrors } = parsePnezdCsv(text);
            if (rows.length === 0) {
                setStatus('error');
                setError(`No valid observations. ${parseErrors[0]?.message || 'Empty file.'}`);
                return;
            }
            const summary = await processRun({ assignmentId, rows }, supabase);
            setStatus('done');
            onComplete?.(summary);
            // Snap back to idle after a short success window so a
            // second upload reads naturally.
            setTimeout(() => setStatus('idle'), 2000);
        } catch (err) {
            setStatus('error');
            setError(err?.message || 'Upload failed.');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    return (
        <div>
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />
            <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={status === 'processing'}
                style={{
                    padding: '8px 14px',
                    background: 'var(--brand-teal)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: status === 'processing' ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: status === 'processing' ? 0.6 : 1,
                }}
            >
                <Upload size={14} />
                {status === 'idle' && 'Upload as-staked CSV'}
                {status === 'processing' && 'Processing…'}
                {status === 'done' && 'Uploaded'}
                {status === 'error' && 'Retry'}
            </button>
            {error && (
                <div style={{ marginTop: '6px', fontSize: '12px', color: 'var(--error)' }}>
                    {error}
                </div>
            )}
        </div>
    );
}
