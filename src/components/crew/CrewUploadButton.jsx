import React, { useRef, useState } from 'react';
import { Upload, AlertCircle } from 'lucide-react';
import { parsePnezdCsv } from '../../lib/csvParser.js';
import { processRun } from '../../lib/sosProcessRun.js';
import { supabase } from '../../supabaseClient';

// ─── CrewUploadButton ─────────────────────────────────────────────────
// Chief-facing primary upload affordance. Triggers the system file
// picker, reads the CSV in-browser, runs the parser + matcher
// pipeline against the assignment, and bubbles the summary up through
// onComplete. Status text on the button covers the four phases:
// idle → reading → processing → done (then "Re-check" for re-uploads).

export default function CrewUploadButton({ assignment, onComplete, label }) {
    const fileInputRef = useRef(null);
    const [status, setStatus] = useState('idle'); // idle | reading | processing | done | error
    const [error, setError] = useState(null);

    function handleClick() {
        fileInputRef.current?.click();
    }

    async function handleFileChange(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setError(null);
        setStatus('reading');

        try {
            const text = await file.text();
            setStatus('processing');

            const { rows, errors: parseErrors } = parsePnezdCsv(text);
            if (rows.length === 0) {
                setStatus('error');
                setError(
                    parseErrors[0]?.message
                        ? `No valid observations. ${parseErrors[0].message}`
                        : 'No valid observations found in this file.',
                );
                return;
            }

            const summary = await processRun({ assignmentId: assignment.id, rows }, supabase);
            setStatus('done');
            onComplete?.(summary);
        } catch (err) {
            setStatus('error');
            setError(err?.message || 'Upload failed.');
        } finally {
            // Reset the file input so a re-upload of the same file fires onChange.
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }

    const busy = status === 'reading' || status === 'processing';

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
                onClick={handleClick}
                disabled={busy}
                style={{
                    width: '100%',
                    minHeight: '64px',
                    background: busy ? 'rgba(15, 110, 86, 0.5)' : 'var(--brand-teal)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '17px',
                    fontWeight: 600,
                    cursor: busy ? 'default' : 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                }}
            >
                <Upload size={20} />
                {status === 'idle' && (label || 'Check my work')}
                {status === 'reading' && 'Reading file…'}
                {status === 'processing' && 'Processing observations…'}
                {status === 'done' && (label || 'Re-check')}
                {status === 'error' && 'Try again'}
            </button>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px', textAlign: 'center' }}>
                Upload your Trimble Access CSV (point, N, E, Z, code).
            </div>
            {error && (
                <div style={{
                    marginTop: '10px',
                    padding: '10px 12px',
                    background: 'rgba(220, 38, 38, 0.10)',
                    border: '1px solid rgba(220, 38, 38, 0.40)',
                    borderRadius: '8px',
                    color: 'var(--error)',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                }}>
                    <AlertCircle size={16} style={{ flex: '0 0 auto', marginTop: '1px' }} />
                    <span>{error}</span>
                </div>
            )}
        </div>
    );
}
