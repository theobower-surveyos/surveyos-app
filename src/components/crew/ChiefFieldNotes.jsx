import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';

// ─── ChiefFieldNotes ──────────────────────────────────────────────────
// Free-text note from the chief to the PM. Auto-saves 800ms after the
// last keystroke. Three visible states: idle / saving / saved (fades
// back to idle after 1.5s). Error surfaces inline if the write fails.

const SAVE_DEBOUNCE_MS = 800;
const SAVED_INDICATOR_MS = 1500;

export default function ChiefFieldNotes({ assignmentId, initialValue }) {
    const [value, setValue] = useState(initialValue || '');
    const [status, setStatus] = useState('idle'); // idle | saving | saved | error
    const [errorMsg, setErrorMsg] = useState(null);
    const debounceRef = useRef(null);
    const savedMarkerRef = useRef(null);

    useEffect(() => {
        setValue(initialValue || '');
    }, [initialValue]);

    function onInput(e) {
        const next = e.target.value;
        setValue(next);
        setStatus('idle');
        setErrorMsg(null);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => save(next), SAVE_DEBOUNCE_MS);
    }

    async function save(text) {
        setStatus('saving');
        const { error } = await supabase
            .from('stakeout_assignments')
            .update({ chief_field_notes: text || null })
            .eq('id', assignmentId);

        if (error) {
            setStatus('error');
            setErrorMsg(error.message);
            return;
        }
        setStatus('saved');
        if (savedMarkerRef.current) clearTimeout(savedMarkerRef.current);
        savedMarkerRef.current = setTimeout(() => setStatus('idle'), SAVED_INDICATOR_MS);
    }

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
            if (savedMarkerRef.current) clearTimeout(savedMarkerRef.current);
        };
    }, []);

    return (
        <div>
            <textarea
                value={value}
                onChange={onInput}
                placeholder="Notes for the PM — what happened, what needs attention, anything out of scope…"
                rows={4}
                style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '12px 14px',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    color: 'var(--text-main)',
                    fontSize: '14px',
                    fontFamily: 'inherit',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    minHeight: '80px',
                }}
            />
            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', minHeight: '16px' }}>
                {status === 'saving' && 'Saving…'}
                {status === 'saved' && 'Saved'}
                {status === 'error' && (
                    <span style={{ color: 'var(--error)' }}>
                        Couldn't save: {errorMsg || 'unknown error'}
                    </span>
                )}
            </div>
        </div>
    );
}
