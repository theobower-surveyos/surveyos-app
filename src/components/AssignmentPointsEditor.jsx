import React, { useEffect, useMemo, useState } from 'react';
import { Loader, Save, X, XCircle, AlertTriangle } from 'lucide-react';
import DesignPointsPlanView from './DesignPointsPlanView.jsx';

// ─── AssignmentPointsEditor ───────────────────────────────────────────
// Re-uses the canvas + lasso UX from AssignmentBuilder, but seeded with
// the assignment's existing point set. Computes a diff on save and
// confirms before destroying any QC observations attached to a removed
// point (the FK on stakeout_qc_points cascades).

export default function AssignmentPointsEditor({
    supabase,
    projectId,
    assignmentId,
    initialSelectedPointIds,
    onSaved,
    onCancelled,
    onToast,
}) {
    const [designPoints, setDesignPoints] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState(() => new Set(initialSelectedPointIds || []));
    const [hoveredId, setHoveredId] = useState(null);
    const [saving, setSaving] = useState(false);
    const [confirmingRemoval, setConfirmingRemoval] = useState(null);
    // confirmingRemoval shape: { toRemove: string[], toAdd: string[], qcAffectedCount: number }

    const initialSet = useMemo(
        () => new Set(initialSelectedPointIds || []),
        [initialSelectedPointIds],
    );

    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!projectId) return;
            setLoading(true);
            try {
                const { data, error } = await supabase
                    .from('stakeout_design_points')
                    .select('id, point_id, feature_code, northing, easting, elevation')
                    .eq('project_id', projectId)
                    .order('point_id', { ascending: true });
                if (error) throw error;
                if (!cancelled) setDesignPoints(data || []);
            } catch (err) {
                if (cancelled) return;
                console.error('[AssignmentPointsEditor] load failed:', err);
                if (onToast) onToast('error', 'Failed to load design points. Check console.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [supabase, projectId]); // eslint-disable-line react-hooks/exhaustive-deps

    const selectedCount = selectedIds.size;
    const totalCount = designPoints.length;

    function diffSelection() {
        const toRemove = [];
        const toAdd = [];
        for (const id of initialSet) if (!selectedIds.has(id)) toRemove.push(id);
        for (const id of selectedIds) if (!initialSet.has(id)) toAdd.push(id);
        return { toRemove, toAdd };
    }

    async function attemptSave() {
        if (saving) return;
        const { toRemove, toAdd } = diffSelection();

        if (toRemove.length === 0 && toAdd.length === 0) {
            if (onToast) onToast('success', 'No changes to save.');
            return;
        }

        // Check whether any of the points being removed already have QC
        // observations. If so, surface a confirm modal — the FK on
        // stakeout_qc_points cascades on assignment_point delete and we
        // don't want to silently drop field data.
        if (toRemove.length > 0) {
            try {
                const { count, error } = await supabase
                    .from('stakeout_qc_points')
                    .select('id', { count: 'exact', head: true })
                    .eq('assignment_id', assignmentId)
                    .in('design_point_id', toRemove);
                if (error) throw error;
                if (count && count > 0) {
                    setConfirmingRemoval({ toRemove, toAdd, qcAffectedCount: count });
                    return;
                }
            } catch (err) {
                console.error('[AssignmentPointsEditor] qc-pre-check failed:', err);
                if (onToast)
                    onToast(
                        'error',
                        'Could not check existing QC data. Save aborted to be safe — try again.',
                    );
                return;
            }
        }

        await commit({ toRemove, toAdd });
    }

    async function commit({ toRemove, toAdd }) {
        setSaving(true);
        setConfirmingRemoval(null);
        try {
            // Look up the largest existing sort_order so newly-added points
            // continue the sequence rather than collide with existing ones.
            let nextSort = 0;
            if (toAdd.length > 0) {
                const { data: maxRow, error: maxErr } = await supabase
                    .from('stakeout_assignment_points')
                    .select('sort_order')
                    .eq('assignment_id', assignmentId)
                    .order('sort_order', { ascending: false })
                    .limit(1)
                    .maybeSingle();
                if (maxErr) throw maxErr;
                nextSort = (maxRow?.sort_order ?? -1) + 1;
            }

            if (toRemove.length > 0) {
                const { error: delErr } = await supabase
                    .from('stakeout_assignment_points')
                    .delete()
                    .eq('assignment_id', assignmentId)
                    .in('design_point_id', toRemove);
                if (delErr) throw delErr;
            }

            if (toAdd.length > 0) {
                const rows = toAdd.map((dpId, i) => ({
                    assignment_id: assignmentId,
                    design_point_id: dpId,
                    sort_order: nextSort + i,
                }));
                const { error: insErr } = await supabase
                    .from('stakeout_assignment_points')
                    .insert(rows);
                if (insErr) throw insErr;
            }

            if (onToast) {
                const verbs = [];
                if (toAdd.length > 0)
                    verbs.push(`+${toAdd.length} added`);
                if (toRemove.length > 0)
                    verbs.push(`${toRemove.length} removed`);
                onToast('success', `Points updated: ${verbs.join(', ')}.`);
            }
            onSaved(new Set(selectedIds));
        } catch (err) {
            console.error('[AssignmentPointsEditor] save failed:', err);
            if (onToast)
                onToast(
                    'error',
                    `Could not save points${err?.code ? ` (code ${err.code})` : ''}. Try again.`,
                );
        } finally {
            setSaving(false);
        }
    }

    if (loading) {
        return (
            <div style={loadingCard}>
                <Loader size={20} className="spinning" color="var(--brand-teal-light)" />
                <span style={{ marginLeft: '10px', color: 'var(--text-muted)' }}>
                    Loading design points…
                </span>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spinning { animation: spin 1s linear infinite; }`}</style>
            </div>
        );
    }

    if (designPoints.length === 0) {
        return (
            <div style={emptyCard}>
                <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>
                    No design points loaded for this project. Import some on the Design points tab.
                </div>
                <button type="button" onClick={onCancelled} style={secondaryBtn(false)}>
                    <X size={13} /> Cancel
                </button>
            </div>
        );
    }

    return (
        <div>
            <style>{`
                .ape-canvas-wrap { height: 600px; }
                .ape-clear-btn {
                    background-color: rgba(148, 163, 184, 0.08);
                    border: 1px solid var(--border-subtle);
                    color: var(--text-muted);
                    padding: 6px 12px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-size: 12px;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-family: inherit;
                    transition: all 0.15s ease;
                }
                .ape-clear-btn:hover {
                    background-color: rgba(212, 145, 42, 0.08);
                    border-color: var(--brand-amber);
                    color: var(--brand-amber);
                }
                .ape-button-row {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    margin-top: 14px;
                    flex-wrap: wrap;
                }
                @media (max-width: 900px) { .ape-canvas-wrap { height: 400px; } }
                @media (max-width: 600px) {
                    .ape-canvas-wrap { height: 300px; }
                    .ape-button-row {
                        flex-direction: column-reverse;
                        align-items: stretch;
                    }
                    .ape-button-row > button { width: 100%; }
                }
            `}</style>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '14px',
                }}
            >
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    <span
                        className="coordinate-data"
                        style={{ color: 'var(--brand-amber)', fontWeight: 600 }}
                    >
                        {selectedCount}
                    </span>{' '}
                    of{' '}
                    <span className="coordinate-data" style={{ color: 'var(--text-muted)' }}>
                        {totalCount}
                    </span>{' '}
                    points selected
                </div>
                {selectedCount > 0 && (
                    <button
                        type="button"
                        onClick={() => setSelectedIds(new Set())}
                        className="ape-clear-btn"
                    >
                        <XCircle size={13} /> Clear selection
                    </button>
                )}
            </div>

            <div className="ape-canvas-wrap" style={canvasCard}>
                <DesignPointsPlanView
                    designPoints={designPoints}
                    selectedIds={selectedIds}
                    onSelectionChange={setSelectedIds}
                    hoveredId={hoveredId}
                    onHoverChange={setHoveredId}
                />
            </div>

            <div className="ape-button-row">
                <button
                    type="button"
                    onClick={onCancelled}
                    disabled={saving}
                    style={secondaryBtn(saving)}
                >
                    <X size={13} /> Cancel
                </button>
                <button
                    type="button"
                    onClick={attemptSave}
                    disabled={saving}
                    style={primaryBtn(saving)}
                >
                    <Save size={13} /> {saving ? 'Saving…' : 'Save changes'}
                </button>
            </div>

            {confirmingRemoval && (
                <ConfirmRemoveModal
                    payload={confirmingRemoval}
                    onCancel={() => setConfirmingRemoval(null)}
                    onConfirm={() => commit(confirmingRemoval)}
                />
            )}
        </div>
    );
}

function ConfirmRemoveModal({ payload, onCancel, onConfirm }) {
    const { toRemove, qcAffectedCount } = payload;
    return (
        <div style={backdrop} onClick={onCancel}>
            <div style={modalCard} onClick={(e) => e.stopPropagation()}>
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        marginBottom: '12px',
                    }}
                >
                    <AlertTriangle size={20} color="var(--error)" />
                    <h3
                        style={{
                            margin: 0,
                            color: 'var(--text-main)',
                            fontSize: '15px',
                            fontWeight: 600,
                        }}
                    >
                        Remove points with QC data?
                    </h3>
                </div>
                <p
                    style={{
                        color: 'var(--text-muted)',
                        fontSize: '13px',
                        margin: '0 0 16px 0',
                        lineHeight: 1.5,
                    }}
                >
                    <span
                        className="coordinate-data"
                        style={{ color: 'var(--error)', fontWeight: 700 }}
                    >
                        {qcAffectedCount}
                    </span>{' '}
                    of the {toRemove.length} point{toRemove.length === 1 ? '' : 's'} you're
                    removing already {qcAffectedCount === 1 ? 'has' : 'have'} QC observations
                    attached. Removing them will also delete those observations. This cannot be
                    undone.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button type="button" onClick={onCancel} style={secondaryBtn(false)}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        style={{
                            ...primaryBtn(false),
                            backgroundColor: 'var(--error)',
                            borderColor: 'var(--error)',
                        }}
                    >
                        Continue
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────

const canvasCard = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    overflow: 'hidden',
};

const loadingCard = {
    padding: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
};

const emptyCard = {
    padding: '40px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px dashed var(--border-subtle)',
    borderRadius: '12px',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    alignItems: 'center',
};

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
    maxWidth: '460px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
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
