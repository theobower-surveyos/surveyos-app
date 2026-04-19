import React, { useEffect, useMemo, useState } from 'react';
import { Loader, Save, Send, XCircle, Users } from 'lucide-react';
import DesignPointsPlanView from './DesignPointsPlanView.jsx';

// ─── AssignmentBuilder ──────────────────────────────────────────────────
// Canvas-first PM flow for composing a day's stakeout work. Lasso-select
// points on the left; fill title / date / chief / tolerances on the right;
// save as draft or send to crew. Inserts stakeout_assignments + bulk
// stakeout_assignment_points in two steps with a compensating delete if
// the second step fails.

const DEFAULT_TOL_H = '0.060';
const DEFAULT_TOL_V = '0.030';

function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function defaultForm() {
    return {
        title: '',
        assignmentDate: todayISO(),
        partyChiefId: '',
        expectedHours: '',
        toleranceH: DEFAULT_TOL_H,
        toleranceV: DEFAULT_TOL_V,
        notes: '',
    };
}

export default function AssignmentBuilder({ supabase, profile, projectId, onToast, onSaved }) {
    const [designPoints, setDesignPoints] = useState([]);
    const [partyChiefs, setPartyChiefs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const [selectedIds, setSelectedIds] = useState(() => new Set());
    const [hoveredId, setHoveredId] = useState(null);
    const [formState, setFormState] = useState(defaultForm);
    const [saveInProgress, setSaveInProgress] = useState(false);

    // ── Load design points + party chiefs ─────────────────────────
    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!projectId || !profile?.firm_id) return;
            setLoading(true);
            setLoadError(null);
            try {
                const [dpRes, chiefRes] = await Promise.all([
                    supabase
                        .from('stakeout_design_points')
                        .select('id, point_id, feature_code, northing, easting, elevation')
                        .eq('project_id', projectId)
                        .order('point_id', { ascending: true }),
                    supabase
                        .from('user_profiles')
                        .select('id, first_name, last_name, role')
                        .eq('firm_id', profile.firm_id)
                        .eq('role', 'party_chief')
                        .eq('is_active', true)
                        .order('first_name', { ascending: true }),
                ]);
                if (cancelled) return;
                if (dpRes.error) throw dpRes.error;
                if (chiefRes.error) throw chiefRes.error;
                setDesignPoints(dpRes.data || []);
                setPartyChiefs(chiefRes.data || []);
            } catch (err) {
                if (cancelled) return;
                console.error('[AssignmentBuilder] load error:', err);
                setLoadError(err);
                if (onToast) onToast('error', 'Failed to load assignment data. Check console.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [supabase, projectId, profile?.firm_id]); // eslint-disable-line react-hooks/exhaustive-deps

    const selectedCount = selectedIds.size;
    const totalCount = designPoints.length;
    const canSubmitAny = selectedCount > 0 && formState.title.trim().length > 0;
    const canSubmitSend = canSubmitAny && !!formState.partyChiefId;

    const helperText = useMemo(() => {
        if (selectedCount === 0) return 'Select at least 1 point on the canvas';
        if (formState.title.trim() === '') return 'Title is required';
        if (!formState.partyChiefId) return 'Assign a party chief to send to crew';
        return null;
    }, [selectedCount, formState.title, formState.partyChiefId]);

    function setField(field, value) {
        setFormState((prev) => ({ ...prev, [field]: value }));
    }

    function resetAfterSave() {
        setSelectedIds(new Set());
        setFormState(defaultForm());
    }

    async function handleSubmit(status) {
        if (saveInProgress) return;
        if (selectedCount === 0) return;
        if (formState.title.trim() === '') return;
        if (status === 'sent' && !formState.partyChiefId) return;

        setSaveInProgress(true);

        const selectedChief = partyChiefs.find((c) => c.id === formState.partyChiefId);
        const chiefLabel = selectedChief
            ? `${selectedChief.first_name || ''} ${selectedChief.last_name || ''}`.trim() || 'party chief'
            : null;

        const row = {
            project_id: projectId,
            title: formState.title.trim(),
            assignment_date: formState.assignmentDate,
            party_chief_id: formState.partyChiefId || null,
            expected_hours: formState.expectedHours ? Number(formState.expectedHours) : null,
            default_tolerance_h: Number(formState.toleranceH) || 0.060,
            default_tolerance_v: Number(formState.toleranceV) || 0.030,
            notes: formState.notes.trim() || null,
            status,
            sent_at: status === 'sent' ? new Date().toISOString() : null,
            created_by: profile?.id || null,
        };

        let newAssignmentId = null;
        try {
            const { data, error } = await supabase
                .from('stakeout_assignments')
                .insert(row)
                .select('id')
                .single();
            if (error) throw error;
            newAssignmentId = data?.id;
            if (!newAssignmentId) throw new Error('Insert returned no id');
        } catch (err) {
            console.error('[AssignmentBuilder] assignment insert failed:', err);
            if (onToast) onToast('error', 'Could not save assignment. Check console and try again.');
            setSaveInProgress(false);
            return;
        }

        const pointRows = [...selectedIds].map((dpId, idx) => ({
            assignment_id: newAssignmentId,
            design_point_id: dpId,
            sort_order: idx,
        }));

        try {
            const { error: pointsErr } = await supabase
                .from('stakeout_assignment_points')
                .insert(pointRows);
            if (pointsErr) throw pointsErr;
        } catch (err) {
            console.error('[AssignmentBuilder] assignment_points insert failed:', err);
            // Compensating rollback: remove the orphan assignment.
            try {
                await supabase.from('stakeout_assignments').delete().eq('id', newAssignmentId);
            } catch (rollbackErr) {
                console.error('[AssignmentBuilder] rollback delete failed:', rollbackErr);
            }
            if (onToast)
                onToast('error', 'Could not attach points to the assignment. Assignment rolled back.');
            setSaveInProgress(false);
            return;
        }

        // TODO (Stage 9): trigger crew notification when status === 'sent'.
        //   The PWA push wiring lives on the mobile side and doesn't exist yet.
        //   Leaving a marker so we don't forget.

        if (onToast) {
            const countWord = `${selectedCount} point${selectedCount === 1 ? '' : 's'}`;
            const verb =
                status === 'sent'
                    ? chiefLabel
                        ? `sent to ${chiefLabel}`
                        : 'sent to crew'
                    : 'saved as draft';
            onToast('success', `Assignment "${row.title}" ${verb}. ${countWord} assigned.`);
        }
        resetAfterSave();
        setSaveInProgress(false);
        if (typeof onSaved === 'function') onSaved();
    }

    // ── Render ────────────────────────────────────────────────────
    if (loading) {
        return (
            <div style={loadingCard}>
                <Loader size={18} className="spinning" />
                <span style={{ marginLeft: '10px', color: 'var(--text-muted)' }}>
                    Loading design points…
                </span>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spinning { animation: spin 1s linear infinite; }`}</style>
            </div>
        );
    }

    if (loadError) {
        return (
            <div style={loadingCard}>
                <span style={{ color: 'var(--error)' }}>
                    Failed to load assignment data. See browser console for details.
                </span>
            </div>
        );
    }

    if (designPoints.length === 0) {
        return (
            <div style={emptyCard}>
                <Users size={22} color="var(--text-muted)" style={{ marginBottom: '8px' }} />
                <div style={{ color: 'var(--text-main)', fontWeight: 600, marginBottom: '4px' }}>
                    No design points loaded
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    Import a CSV or JXL on the Design points tab before building an assignment.
                </div>
            </div>
        );
    }

    return (
        <div>
            <style>{`
                .assignment-builder-grid {
                    display: grid;
                    grid-template-columns: 7fr 3fr;
                    gap: 20px;
                    align-items: stretch;
                }
                .assignment-canvas-wrap {
                    height: 600px;
                }
                .assignment-button-row {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    flex-wrap: wrap;
                }
                .ab-clear-btn {
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
                    transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
                }
                .ab-clear-btn:hover {
                    background-color: rgba(212, 145, 42, 0.08);
                    border-color: var(--brand-amber);
                    color: var(--brand-amber);
                }
                .ab-clear-btn > svg {
                    color: currentColor;
                }
                @media (max-width: 900px) {
                    .assignment-builder-grid {
                        grid-template-columns: 1fr;
                    }
                    .assignment-canvas-wrap { height: 400px; }
                }
                @media (max-width: 600px) {
                    .assignment-canvas-wrap { height: 300px; }
                    .assignment-builder-grid { gap: 14px; }
                    .assignment-button-row {
                        flex-direction: column-reverse;
                        align-items: stretch;
                    }
                    .assignment-button-row > button { width: 100%; }
                }
            `}</style>

            {/* Header: selection count + clear */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '14px',
                    gap: '12px',
                    flexWrap: 'wrap',
                }}
            >
                <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    <span className="coordinate-data" style={{ color: 'var(--brand-amber)', fontWeight: 600 }}>
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
                        className="ab-clear-btn"
                    >
                        <XCircle size={13} /> Clear selection
                    </button>
                )}
            </div>

            <div className="assignment-builder-grid">
                {/* Canvas column */}
                <div>
                    <div className="assignment-canvas-wrap" style={canvasCard}>
                        <DesignPointsPlanView
                            designPoints={designPoints}
                            selectedIds={selectedIds}
                            onSelectionChange={setSelectedIds}
                            hoveredId={hoveredId}
                            onHoverChange={setHoveredId}
                        />
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            gap: '18px',
                            marginTop: '10px',
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <LegendSwatch color="var(--brand-teal)" label="unselected" size={8} />
                        <LegendSwatch color="var(--brand-teal-light)" label="hover" size={10} />
                        <LegendSwatch color="var(--brand-amber)" label="selected" size={10} />
                        <span style={{ opacity: 0.6 }}>· click to toggle · drag to lasso · shift+drag to add</span>
                    </div>
                </div>

                {/* Form column */}
                <AssignmentForm
                    formState={formState}
                    setField={setField}
                    partyChiefs={partyChiefs}
                    selectedCount={selectedCount}
                    helperText={helperText}
                    saveInProgress={saveInProgress}
                    canSubmitAny={canSubmitAny}
                    canSubmitSend={canSubmitSend}
                    onSaveDraft={() => handleSubmit('draft')}
                    onSend={() => handleSubmit('sent')}
                />
            </div>
        </div>
    );
}

// ── Form column ────────────────────────────────────────────────────────

function AssignmentForm({
    formState,
    setField,
    partyChiefs,
    selectedCount,
    helperText,
    saveInProgress,
    canSubmitAny,
    canSubmitSend,
    onSaveDraft,
    onSend,
}) {
    return (
        <form
            onSubmit={(e) => e.preventDefault()}
            style={formCard}
        >
            <style>{`
                .ab-input, .ab-select, .ab-textarea {
                    background-color: var(--bg-dark);
                    color: var(--text-main);
                    border: 1px solid var(--border-subtle);
                    border-radius: 6px;
                    padding: 8px 10px;
                    font-size: 14px;
                    font-family: inherit;
                    width: 100%;
                    box-sizing: border-box;
                    transition: border-color 0.15s ease;
                }
                .ab-input:focus, .ab-select:focus, .ab-textarea:focus {
                    outline: none;
                    border-color: var(--brand-teal-light);
                }
                .ab-textarea { resize: vertical; min-height: 72px; }
                .ab-label {
                    display: block;
                    color: var(--text-muted);
                    font-size: 12px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    font-weight: 600;
                    margin-bottom: 6px;
                }
                .ab-divider {
                    height: 1px;
                    background: var(--border-subtle);
                    margin: 4px 0;
                }
            `}</style>

            <h3 style={formHeading}>New assignment</h3>

            <FieldGroup>
                <Field label="Title" htmlFor="ab-title">
                    <input
                        id="ab-title"
                        type="text"
                        className="ab-input"
                        value={formState.title}
                        onChange={(e) => setField('title', e.target.value)}
                        placeholder="e.g., Monday north curb line"
                        required
                    />
                </Field>
                <Field label="Assignment date" htmlFor="ab-date">
                    <input
                        id="ab-date"
                        type="date"
                        className="ab-input"
                        value={formState.assignmentDate}
                        onChange={(e) => setField('assignmentDate', e.target.value)}
                    />
                </Field>
            </FieldGroup>

            <div className="ab-divider" />

            <FieldGroup>
                <Field label="Party chief" htmlFor="ab-chief">
                    <select
                        id="ab-chief"
                        className="ab-select"
                        value={formState.partyChiefId}
                        onChange={(e) => setField('partyChiefId', e.target.value)}
                    >
                        <option value="">Assign later (save as draft)</option>
                        {partyChiefs.map((c) => (
                            <option key={c.id} value={c.id}>
                                {`${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed chief'}
                            </option>
                        ))}
                    </select>
                </Field>
                <Field label="Expected hours" htmlFor="ab-hours">
                    <input
                        id="ab-hours"
                        type="number"
                        step="0.5"
                        min="0"
                        className="ab-input"
                        value={formState.expectedHours}
                        onChange={(e) => setField('expectedHours', e.target.value)}
                        placeholder="4.5"
                    />
                </Field>
            </FieldGroup>

            <div className="ab-divider" />

            <FieldGroup>
                <Field label="Default tolerance H (ft)" htmlFor="ab-tol-h">
                    <input
                        id="ab-tol-h"
                        type="number"
                        step="0.001"
                        min="0"
                        className="ab-input coordinate-data"
                        value={formState.toleranceH}
                        onChange={(e) => setField('toleranceH', e.target.value)}
                        placeholder="0.060"
                    />
                </Field>
                <Field label="Default tolerance V (ft)" htmlFor="ab-tol-v">
                    <input
                        id="ab-tol-v"
                        type="number"
                        step="0.001"
                        min="0"
                        className="ab-input coordinate-data"
                        value={formState.toleranceV}
                        onChange={(e) => setField('toleranceV', e.target.value)}
                        placeholder="0.030"
                    />
                </Field>
            </FieldGroup>

            <div className="ab-divider" />

            <FieldGroup>
                <Field label="Notes" htmlFor="ab-notes">
                    <textarea
                        id="ab-notes"
                        rows={3}
                        className="ab-textarea"
                        value={formState.notes}
                        onChange={(e) => setField('notes', e.target.value)}
                        placeholder="Day-level instructions, site access notes..."
                    />
                </Field>
            </FieldGroup>

            {/* Helper + buttons */}
            <div style={{ marginTop: '14px' }}>
                {helperText && (
                    <div
                        style={{
                            color: 'var(--text-muted)',
                            fontSize: '12px',
                            marginBottom: '10px',
                            textAlign: 'right',
                            fontStyle: 'italic',
                        }}
                    >
                        {helperText}
                    </div>
                )}
                <div className="assignment-button-row">
                    <button
                        type="button"
                        onClick={onSaveDraft}
                        disabled={!canSubmitAny || saveInProgress}
                        style={btnStyle({
                            variant: 'secondary',
                            disabled: !canSubmitAny || saveInProgress,
                        })}
                    >
                        <Save size={14} /> {saveInProgress ? 'Saving…' : 'Save as draft'}
                    </button>
                    <button
                        type="button"
                        onClick={onSend}
                        disabled={!canSubmitSend || saveInProgress}
                        title={!canSubmitSend && selectedCount > 0 && formState.title.trim() ? 'Assign a party chief to send to crew' : undefined}
                        style={btnStyle({
                            variant: 'primary',
                            disabled: !canSubmitSend || saveInProgress,
                        })}
                    >
                        <Send size={14} /> {saveInProgress ? 'Sending…' : 'Send to crew'}
                    </button>
                </div>
            </div>
        </form>
    );
}

function Field({ label, htmlFor, children }) {
    return (
        <div>
            <label className="ab-label" htmlFor={htmlFor}>
                {label}
            </label>
            {children}
        </div>
    );
}

function FieldGroup({ children }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                paddingTop: '4px',
                paddingBottom: '4px',
            }}
        >
            {children}
        </div>
    );
}

function LegendSwatch({ color, label, size }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
                style={{
                    display: 'inline-block',
                    width: `${size}px`,
                    height: `${size}px`,
                    borderRadius: '50%',
                    backgroundColor: color,
                }}
            />
            {label}
        </span>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────

const canvasCard = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '8px',
    overflow: 'hidden',
};

const formCard = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
};

const formHeading = {
    margin: 0,
    fontSize: '15px',
    fontWeight: 600,
    color: 'var(--text-main)',
    letterSpacing: '0.2px',
};

const loadingCard = {
    padding: '40px 24px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const emptyCard = {
    padding: '48px 24px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-surface)',
    border: '1px dashed var(--border-subtle)',
    borderRadius: '12px',
};

function btnStyle({ variant, disabled }) {
    const base = {
        padding: '10px 16px',
        borderRadius: '8px',
        fontWeight: 600,
        fontSize: '14px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontFamily: 'inherit',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
    };
    if (variant === 'primary') {
        return {
            ...base,
            backgroundColor: 'var(--brand-teal)',
            border: '1px solid var(--brand-teal)',
            color: '#fff',
        };
    }
    return {
        ...base,
        backgroundColor: 'transparent',
        border: '1px solid var(--border-subtle)',
        color: 'var(--text-main)',
    };
}
