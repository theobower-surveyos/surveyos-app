import React, { useState, useEffect } from 'react';
import { Check } from 'lucide-react';
import { supabase } from '../../supabaseClient';

// ─── ScopeChecklist ───────────────────────────────────────────────────
// Day-of-work checklist. Items come from stakeout_assignments.scope_
// checklist (jsonb array of {id, label, done}). Chief ticks items as
// they complete each scope task.
//
// Save strategy: optimistic UI — local state flips first, then persist.
// On Supabase error, roll back the local flip and surface the error.
// The entire array is written each tap (jsonb overwrite) since the
// column is small and the PostgREST path-patching for jsonb arrays is
// awkward for this shape.

export default function ScopeChecklist({ assignmentId, items, onChange }) {
    const [localItems, setLocalItems] = useState(items || []);
    const [savingId, setSavingId] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        setLocalItems(items || []);
    }, [items]);

    async function toggleItem(id) {
        const idx = localItems.findIndex((i) => i.id === id);
        if (idx === -1) return;
        const previous = localItems;
        const nextItems = localItems.map((i) =>
            i.id === id ? { ...i, done: !i.done } : i,
        );
        setLocalItems(nextItems);
        setSavingId(id);
        setError(null);

        const { error: uError } = await supabase
            .from('stakeout_assignments')
            .update({ scope_checklist: nextItems })
            .eq('id', assignmentId);

        setSavingId(null);

        if (uError) {
            setLocalItems(previous);
            setError(uError.message);
            return;
        }
        onChange?.(nextItems);
    }

    if (!localItems || localItems.length === 0) {
        return (
            <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic' }}>
                No scope items for this assignment.
            </div>
        );
    }

    return (
        <div>
            {error && (
                <div style={{
                    color: 'var(--error)',
                    fontSize: '12px',
                    marginBottom: '8px',
                    padding: '6px 10px',
                    background: 'rgba(220, 38, 38, 0.10)',
                    border: '1px solid rgba(220, 38, 38, 0.40)',
                    borderRadius: '6px',
                }}>
                    Couldn't save: {error}
                </div>
            )}
            {localItems.map((item) => (
                <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    disabled={savingId === item.id}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        width: '100%',
                        minHeight: '56px',
                        padding: '12px 14px',
                        marginBottom: '8px',
                        background: item.done ? 'rgba(13, 79, 79, 0.20)' : 'var(--bg-surface)',
                        border: `1px solid ${item.done ? 'var(--brand-teal)' : 'var(--border-subtle)'}`,
                        borderRadius: '10px',
                        color: 'var(--text-main)',
                        textAlign: 'left',
                        fontFamily: 'inherit',
                        fontSize: '15px',
                        cursor: savingId === item.id ? 'default' : 'pointer',
                        opacity: savingId === item.id ? 0.7 : 1,
                        transition: 'background 120ms ease, border-color 120ms ease',
                    }}
                >
                    <div style={{
                        flex: '0 0 auto',
                        width: '24px',
                        height: '24px',
                        borderRadius: '6px',
                        border: `2px solid ${item.done ? 'var(--brand-teal)' : 'var(--border-subtle)'}`,
                        background: item.done ? 'var(--brand-teal)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {item.done && <Check size={16} color="#fff" strokeWidth={3} />}
                    </div>
                    <span style={{
                        textDecoration: item.done ? 'line-through' : 'none',
                        color: item.done ? 'var(--text-muted)' : 'var(--text-main)',
                        lineHeight: 1.3,
                    }}>
                        {item.label}
                    </span>
                </button>
            ))}
        </div>
    );
}
