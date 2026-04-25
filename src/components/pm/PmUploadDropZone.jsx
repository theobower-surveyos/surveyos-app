import React, { useRef, useState } from 'react';
import { FileText } from 'lucide-react';
import { parsePnezdCsv } from '../../lib/csvParser.js';
import { processRun } from '../../lib/sosProcessRun.js';
import { supabase } from '../../supabaseClient';

// ─── PmUploadDropZone ─────────────────────────────────────────────────
// Drag-and-drop empty-state zone for AssignmentDetail's QC area.
// Renders only when the assignment has no QC data yet. Click also
// opens the system file picker so a desktop user without a CSV on
// the desktop can still browse to it.

export default function PmUploadDropZone({ assignmentId, onComplete }) {
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [status, setStatus] = useState('idle');
    const [error, setError] = useState(null);

    async function handleFile(file) {
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
        } catch (err) {
            setStatus('error');
            setError(err?.message || 'Upload failed.');
        }
    }

    function onDrop(e) {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
    }

    function onPickerChange(e) {
        const file = e.target.files?.[0];
        if (file) handleFile(file);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
                padding: '40px 20px',
                background: dragOver ? 'rgba(15, 110, 86, 0.10)' : 'var(--bg-surface)',
                border: `2px dashed ${dragOver ? 'var(--brand-teal-light)' : 'var(--border-subtle)'}`,
                borderRadius: '12px',
                textAlign: 'center',
                cursor: 'pointer',
                color: 'var(--text-main)',
                marginBottom: '20px',
                transition: 'background 120ms, border-color 120ms',
            }}
        >
            <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,text/plain"
                style={{ display: 'none' }}
                onChange={onPickerChange}
            />
            <FileText size={32} style={{ color: 'var(--text-muted)', marginBottom: '12px' }} />
            <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '4px' }}>
                {status === 'idle' && 'Drop CSV here or click to upload'}
                {status === 'processing' && 'Processing…'}
                {status === 'done' && 'Upload complete'}
                {status === 'error' && 'Upload failed'}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                PNEZD format · point_id, N, E, Z, code · no headers
            </div>
            {error && (
                <div style={{ marginTop: '10px', fontSize: '12px', color: 'var(--error)' }}>
                    {error}
                </div>
            )}
        </div>
    );
}
