import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowLeft,
    Loader,
    FileSpreadsheet,
    FileText,
    Search,
    ArrowUp,
    ArrowDown,
    Pencil,
    Send,
    CheckCircle2,
    AlertTriangle,
} from 'lucide-react';
import DesignPointsPlanView from './DesignPointsPlanView.jsx';
import AssignmentTestDataSeeder from './AssignmentTestDataSeeder.jsx';
import AssignmentEditForm from './AssignmentEditForm.jsx';
import AssignmentPointsEditor from './AssignmentPointsEditor.jsx';
import PointTolerancePopover from './PointTolerancePopover.jsx';
import AssignmentProgressBar from './AssignmentProgressBar.jsx';
import ReconciliationModal from './ReconciliationModal.jsx';
import PmUploadButton from './pm/PmUploadButton.jsx';
import PmUploadDropZone from './pm/PmUploadDropZone.jsx';
import { exportAsCSV, exportAsXLSX } from '../utils/stakeoutExports.js';

function isExportable(status) {
    return status === 'submitted' || status === 'reconciled';
}

// Editing is allowed only while the assignment is still in PM hands.
// Once it's in_progress / submitted / reconciled, the point set, party
// chief, and tolerances all freeze — those states represent crew or
// office actions that the schema's column-protection trigger and the
// view's reconcile workflow rely on.
function isAssignmentEditable(status) {
    return status === 'draft' || status === 'sent';
}

const STATUS_STYLES = {
    draft:       { bg: 'transparent',              border: 'var(--border-subtle)', color: 'var(--text-muted)'      },
    sent:        { bg: 'var(--brand-amber-muted)', border: 'var(--brand-amber)',   color: 'var(--brand-amber)'     },
    in_progress: { bg: 'rgba(26, 107, 107, 0.18)', border: 'var(--brand-teal-light)', color: 'var(--brand-teal-light)' },
    submitted:   { bg: 'rgba(13, 79, 79, 0.32)',   border: 'var(--brand-teal)',    color: '#fff'                   },
    reconciled:  { bg: 'rgba(16, 185, 129, 0.16)', border: 'var(--success)',       color: 'var(--success)'         },
};

const POINT_STATUS_ROW_BG = {
    out_of_tol: 'rgba(239, 68, 68, 0.08)',
    field_fit: 'var(--brand-amber-muted)',
    built_on: 'rgba(201, 116, 242, 0.08)',
};

const POINT_STATUS_COLOR = {
    in_tol: 'var(--success)',
    out_of_tol: 'var(--error)',
    field_fit: 'var(--brand-amber)',
    built_on: 'rgba(201, 116, 242, 1)',
    pending: 'var(--text-muted)',
};

const POINT_STATUS_LABEL = {
    in_tol: 'in tol',
    out_of_tol: 'out of tol',
    field_fit: 'field fit',
    built_on: 'built on',
    pending: 'pending',
};

function fullName(u) {
    if (!u) return null;
    return `${u.first_name || ''} ${u.last_name || ''}`.trim() || null;
}

export default function AssignmentDetail({
    supabase,
    profile,
    assignmentId,
    projectId,
    onToast,
    onBack,
}) {
    const [assignment, setAssignment] = useState(null);
    const [chief, setChief] = useState(null);
    const [creator, setCreator] = useState(null);
    const [summaryRows, setSummaryRows] = useState([]);
    const [designPoints, setDesignPoints] = useState([]);
    // design_point_id → { id (assignment_point_id), sort_order, override_tolerance_h, override_tolerance_v }
    const [assignmentPointMap, setAssignmentPointMap] = useState(new Map());
    const [partyChiefs, setPartyChiefs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [hoveredId, setHoveredId] = useState(null);
    const [reloadTick, setReloadTick] = useState(0);
    const [editingMetadata, setEditingMetadata] = useState(false);
    const [editingPoints, setEditingPoints] = useState(false);
    // open popover: { assignmentPointId, designPointId, pointId, currentH, currentV, anchorRect }
    const [overridePopover, setOverridePopover] = useState(null);
    const [project, setProject] = useState(null);
    const [reconcileOpen, setReconcileOpen] = useState(false);
    const [resendConfirmOpen, setResendConfirmOpen] = useState(false);
    const [resendBusy, setResendBusy] = useState(false);
    const [exportBusy, setExportBusy] = useState(null); // 'csv' | 'xlsx' | null

    function reload() {
        setReloadTick((t) => t + 1);
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    }

    function buildReportMetadata() {
        return {
            project_name: project?.project_name || '(unknown project)',
            assignment_title: assignment?.title || '',
            assignment_date: assignment?.assignment_date || '',
            party_chief_name: fullName(chief) || null,
            instrument: null,
            tolerance_h: assignment?.default_tolerance_h,
        };
    }

    async function handleExportCSV() {
        if (exportBusy || !assignment) return;
        setExportBusy('csv');
        try {
            const metadata = buildReportMetadata();
            const { blob, filename } = exportAsCSV({ rows: summaryRows, metadata });
            triggerDownload(blob, filename);
            if (onToast) onToast('success', `Downloaded ${filename}`);
        } catch (err) {
            console.error('[AssignmentDetail] CSV export failed:', err);
            if (onToast) onToast('error', 'CSV export failed. Check console.');
        } finally {
            setExportBusy(null);
        }
    }

    async function handleExportXLSX() {
        if (exportBusy || !assignment) return;
        setExportBusy('xlsx');
        try {
            const metadata = buildReportMetadata();
            const { blob, filename } = await exportAsXLSX({ rows: summaryRows, metadata });
            triggerDownload(blob, filename);
            if (onToast) onToast('success', `Downloaded ${filename}`);
        } catch (err) {
            console.error('[AssignmentDetail] XLSX export failed:', err);
            if (onToast) onToast('error', 'XLSX export failed. Check console.');
        } finally {
            setExportBusy(null);
        }
    }

    async function handleResend() {
        if (resendBusy || !assignment) return;
        setResendBusy(true);
        const updates = {
            status: 'sent',
            sent_at: new Date().toISOString(),
        };
        try {
            const { data, error } = await supabase
                .from('stakeout_assignments')
                .update(updates)
                .eq('id', assignment.id)
                .select('*')
                .single();
            if (error) throw error;
            setAssignment(data);
            // TODO (Stage 9): fire crew notification via the PWA push pipeline
            // once it lands on the mobile side. The DB write is sufficient
            // for now — the crew's AssignmentsList query will pick it up on
            // next load.
            const chiefLabel = fullName(chief) || 'crew';
            if (onToast)
                onToast(
                    'success',
                    `Re-sent to ${chiefLabel}. (Crew notification: TODO in Stage 9.)`,
                );
            setResendConfirmOpen(false);
            reload();
        } catch (err) {
            console.error('[AssignmentDetail] resend failed:', err);
            if (onToast)
                onToast(
                    'error',
                    `Could not re-send${err?.code ? ` (code ${err.code})` : ''}. Try again.`,
                );
        } finally {
            setResendBusy(false);
        }
    }

    // ── Load everything ───────────────────────────────────────────
    useEffect(() => {
        let cancelled = false;
        async function load() {
            if (!assignmentId) return;
            setLoading(true);
            setError(null);
            try {
                const [asgRes, summaryRes, dpJoinRes] = await Promise.all([
                    supabase
                        .from('stakeout_assignments')
                        .select('*')
                        .eq('id', assignmentId)
                        .single(),
                    supabase
                        .from('stakeout_qc_summary')
                        .select('*')
                        .eq('assignment_id', assignmentId),
                    supabase
                        .from('stakeout_assignment_points')
                        .select(
                            'id, design_point_id, sort_order, override_tolerance_h, override_tolerance_v, stakeout_design_points(id, point_id, feature_code, feature_description, northing, easting, elevation)',
                        )
                        .eq('assignment_id', assignmentId)
                        .order('sort_order', { ascending: true }),
                ]);
                if (cancelled) return;
                if (asgRes.error) throw asgRes.error;
                const asg = asgRes.data;
                setAssignment(asg);

                const dpRows = (dpJoinRes.data || [])
                    .map((r) => r.stakeout_design_points)
                    .filter(Boolean);
                setDesignPoints(dpRows);

                const apMap = new Map();
                (dpJoinRes.data || []).forEach((r) => {
                    if (r && r.design_point_id) {
                        apMap.set(r.design_point_id, {
                            id: r.id,
                            sort_order: r.sort_order,
                            override_tolerance_h: r.override_tolerance_h,
                            override_tolerance_v: r.override_tolerance_v,
                        });
                    }
                });
                setAssignmentPointMap(apMap);

                setSummaryRows(summaryRes.data || []);

                // Look up users for chief and creator
                const userIds = [asg.party_chief_id, asg.created_by].filter(Boolean);
                const uniqueIds = [...new Set(userIds)];
                if (uniqueIds.length > 0) {
                    const { data: users } = await supabase
                        .from('user_profiles')
                        .select('id, first_name, last_name')
                        .in('id', uniqueIds);
                    if (!cancelled) {
                        const byId = new Map((users || []).map((u) => [u.id, u]));
                        setChief(byId.get(asg.party_chief_id) || null);
                        setCreator(byId.get(asg.created_by) || null);
                    }
                }

                // Party chief roster — needed by the inline edit form's
                // dropdown. Loaded once per assignment open; cheap query.
                if (profile?.firm_id) {
                    const { data: chiefs } = await supabase
                        .from('user_profiles')
                        .select('id, first_name, last_name')
                        .eq('firm_id', profile.firm_id)
                        .eq('role', 'party_chief')
                        .eq('is_active', true)
                        .order('first_name', { ascending: true });
                    if (!cancelled) setPartyChiefs(chiefs || []);
                }

                // Project name — needed by export metadata and the
                // reconciliation modal. Cheap single-row read.
                if (asg.project_id) {
                    const { data: proj } = await supabase
                        .from('projects')
                        .select('id, project_name')
                        .eq('id', asg.project_id)
                        .single();
                    if (!cancelled) setProject(proj || null);
                }
            } catch (err) {
                if (cancelled) return;
                console.error('[AssignmentDetail] load error:', err);
                setError(err);
                if (onToast) onToast('error', 'Failed to load assignment. Check console.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        }
        load();
        return () => {
            cancelled = true;
        };
    }, [supabase, assignmentId, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── Derived: per-point status + extra data for plan tooltip ──
    const { pointStatusMap, extraPointData, statusCounts } = useMemo(() => {
        const statusMap = new Map();
        const extra = new Map();
        const counts = { total: 0, in_tol: 0, out_of_tol: 0, field_fit: 0, built_on: 0, pending: 0 };

        for (const r of summaryRows) {
            counts.total += 1;
            const s = r.h_status || 'pending';
            if (counts[s] != null) counts[s] += 1;

            if (r.design_point_id) {
                statusMap.set(r.design_point_id, s);
                extra.set(r.design_point_id, {
                    status: s,
                    deltaH: r.delta_h,
                    deltaZ: r.delta_z,
                    toleranceH: r.effective_tolerance_h,
                    fieldFitReason: r.field_fit_reason,
                });
            }
        }
        return { pointStatusMap: statusMap, extraPointData: extra, statusCounts: counts };
    }, [summaryRows]);

    // ── Render ────────────────────────────────────────────────────
    if (loading) {
        return (
            <div role="status" aria-label="Loading assignment" style={loadingCard}>
                <Loader size={22} className="spinning" color="var(--brand-teal-light)" />
                <span style={{ color: 'var(--text-muted)', marginLeft: '10px' }}>
                    Loading assignment…
                </span>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spinning { animation: spin 1s linear infinite; }`}</style>
            </div>
        );
    }

    if (error || !assignment) {
        return (
            <div style={errorCard}>
                <div style={{ color: 'var(--error)', fontWeight: 600, marginBottom: '6px' }}>
                    Could not load assignment
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '14px' }}>
                    It may have been deleted or your firm may have lost access.
                </div>
                <button type="button" onClick={onBack} style={primaryBtn}>
                    <ArrowLeft size={13} /> Back to assignments
                </button>
            </div>
        );
    }

    const statusStyle = STATUS_STYLES[assignment.status] || STATUS_STYLES.draft;
    const hasQc = summaryRows.some((r) => r.h_status);

    return (
        <div style={{ position: 'relative' }}>
            <style>{`
                .detail-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 16px;
                    flex-wrap: wrap;
                    margin-bottom: 18px;
                }
                .detail-meta-grid {
                    display: grid;
                    grid-template-columns: max-content 1fr;
                    gap: 8px 24px;
                    font-size: 13px;
                }
                .detail-meta-grid dt {
                    color: var(--text-muted);
                    font-size: 11px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    font-weight: 600;
                    align-self: center;
                }
                .detail-meta-grid dd { margin: 0; color: var(--text-main); }
                .detail-stats {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
                    gap: 12px;
                    margin-bottom: 20px;
                }
                @media (max-width: 900px) {
                    .detail-meta-grid { grid-template-columns: 1fr; gap: 4px; }
                    .detail-meta-grid dd { margin-bottom: 8px; }
                }
                @media (max-width: 600px) {
                    .detail-stats { grid-template-columns: repeat(2, 1fr); }
                }
            `}</style>

            {/* Header */}
            <div className="detail-header">
                <div style={{ minWidth: 0, flex: '1 1 280px' }}>
                    <button type="button" onClick={onBack} className="stakeout-back-link">
                        <span className="stakeout-back-arrow"><ArrowLeft size={15} /></span>
                        Back to assignments
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <h1
                            style={{
                                margin: 0,
                                fontSize: '20px',
                                fontWeight: 700,
                                color: 'var(--text-main)',
                            }}
                        >
                            {assignment.title || '(untitled)'}
                        </h1>
                        <span
                            aria-label={`Status: ${assignment.status}`}
                            style={{
                                display: 'inline-flex',
                                padding: '4px 10px',
                                borderRadius: '999px',
                                fontSize: '11px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                letterSpacing: '0.3px',
                                border: `1px solid ${statusStyle.border}`,
                                backgroundColor: statusStyle.bg,
                                color: statusStyle.color,
                            }}
                        >
                            {(assignment.status || 'draft').replace('_', ' ')}
                        </span>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        Created{' '}
                        <span className="coordinate-data" style={{ color: 'var(--text-main)' }}>
                            {assignment.created_at
                                ? new Date(assignment.created_at).toLocaleDateString()
                                : '—'}
                        </span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleExportCSV}
                            disabled={!isExportable(assignment.status) || exportBusy != null}
                            style={exportBtnStyle(!isExportable(assignment.status) || exportBusy != null)}
                            title={
                                !isExportable(assignment.status)
                                    ? 'Available once QC data is submitted'
                                    : 'Download QC report as CSV'
                            }
                        >
                            <FileSpreadsheet size={13} />
                            {exportBusy === 'csv' ? 'Exporting…' : 'Export CSV'}
                        </button>
                        <button
                            type="button"
                            onClick={handleExportXLSX}
                            disabled={!isExportable(assignment.status) || exportBusy != null}
                            style={exportBtnStyle(!isExportable(assignment.status) || exportBusy != null)}
                            title={
                                !isExportable(assignment.status)
                                    ? 'Available once QC data is submitted'
                                    : 'Download QC report as XLSX'
                            }
                        >
                            <FileText size={13} />
                            {exportBusy === 'xlsx' ? 'Exporting…' : 'Export XLSX'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Progress bar — read-only, below the status chip */}
            <AssignmentProgressBar status={assignment.status} />

            {/* Metadata card OR inline edit form */}
            {editingMetadata ? (
                <AssignmentEditForm
                    supabase={supabase}
                    assignment={assignment}
                    partyChiefs={partyChiefs}
                    onSaved={(updated) => {
                        setAssignment(updated);
                        setEditingMetadata(false);
                        reload();
                    }}
                    onCancelled={() => setEditingMetadata(false)}
                    onToast={onToast}
                    readOnlyPartyChief={assignment.status === 'sent'}
                />
            ) : (
            <div style={card}>
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '14px',
                    }}
                >
                    <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                        Assignment details
                    </h3>
                    {isAssignmentEditable(assignment.status) && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={() => setResendConfirmOpen(true)}
                                disabled={!assignment.party_chief_id}
                                style={editIconBtn}
                                title={
                                    !assignment.party_chief_id
                                        ? 'Assign a party chief first'
                                        : assignment.status === 'draft'
                                            ? 'Send this assignment to the crew'
                                            : 'Re-send this assignment to the crew'
                                }
                            >
                                <Send size={12} />
                                {assignment.status === 'draft' ? 'Send to crew' : 'Re-send to crew'}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditingMetadata(true)}
                                style={editIconBtn}
                                title="Edit assignment metadata"
                            >
                                <Pencil size={12} /> Edit
                            </button>
                        </div>
                    )}
                </div>
                <dl className="detail-meta-grid">
                    <dt>Assignment date</dt>
                    <dd>{assignment.assignment_date || '—'}</dd>

                    <dt>Party chief</dt>
                    <dd>{fullName(chief) || <span style={{ color: 'var(--text-muted)' }}>Unassigned</span>}</dd>

                    <dt>Expected hours</dt>
                    <dd className="coordinate-data">
                        {assignment.expected_hours != null ? Number(assignment.expected_hours).toFixed(1) : '—'}
                    </dd>

                    <dt>Tolerance H</dt>
                    <dd className="coordinate-data">
                        {assignment.default_tolerance_h != null
                            ? Number(assignment.default_tolerance_h).toFixed(3)
                            : '—'}
                    </dd>

                    <dt>Tolerance V</dt>
                    <dd className="coordinate-data">
                        {assignment.default_tolerance_v != null
                            ? Number(assignment.default_tolerance_v).toFixed(3)
                            : '—'}
                    </dd>

                    <dt>Created by</dt>
                    <dd>{fullName(creator) || <span style={{ color: 'var(--text-muted)' }}>—</span>}</dd>

                    {assignment.notes && (
                        <>
                            <dt>Notes</dt>
                            <dd style={{ whiteSpace: 'pre-wrap' }}>{assignment.notes}</dd>
                        </>
                    )}

                    {assignment.reconciled_at && (
                        <>
                            <dt>Reconciled on</dt>
                            <dd className="coordinate-data">
                                {new Date(assignment.reconciled_at).toLocaleString()}
                            </dd>
                            <dt>Reconciled by</dt>
                            <dd>
                                <ReconciledByLabel
                                    supabase={supabase}
                                    userId={assignment.reconciled_by}
                                />
                            </dd>
                        </>
                    )}

                    {assignment.reconciliation_note && (
                        <>
                            <dt>Reconciliation note</dt>
                            <dd style={{ whiteSpace: 'pre-wrap' }}>
                                {assignment.reconciliation_note}
                            </dd>
                        </>
                    )}

                    {(assignment.client_contact_name ||
                        assignment.client_contact_phone ||
                        assignment.client_contact_role ||
                        assignment.client_contact_notes) && (
                        <>
                            <dt>Client contact</dt>
                            <dd style={{ whiteSpace: 'pre-wrap' }}>
                                {[
                                    assignment.client_contact_name,
                                    assignment.client_contact_role &&
                                        ` · ${assignment.client_contact_role}`,
                                    assignment.client_contact_phone &&
                                        ` · ${assignment.client_contact_phone}`,
                                ]
                                    .filter(Boolean)
                                    .join('')}
                                {assignment.client_contact_notes && (
                                    <div
                                        style={{
                                            color: 'var(--text-muted)',
                                            fontSize: '12px',
                                            marginTop: '4px',
                                        }}
                                    >
                                        {assignment.client_contact_notes}
                                    </div>
                                )}
                            </dd>
                        </>
                    )}
                </dl>
            </div>
            )}

            {/* Stat cards */}
            <div className="detail-stats">
                <StatCard label="Total" value={statusCounts.total} color="var(--brand-amber)" />
                <StatCard label="In tol" value={statusCounts.in_tol} color="var(--success)" />
                <StatCard label="Out of tol" value={statusCounts.out_of_tol} color="var(--error)" />
                <StatCard label="Field fit" value={statusCounts.field_fit} color="var(--brand-amber)" />
                <StatCard label="Built on" value={statusCounts.built_on} color="rgba(201, 116, 242, 1)" />
                <StatCard label="Pending" value={statusCounts.pending} color="var(--text-muted)" />
            </div>

            {/* Plan view OR points editor */}
            {editingPoints ? (
                <div style={{ marginBottom: '12px' }}>
                    <AssignmentPointsEditor
                        supabase={supabase}
                        projectId={projectId}
                        assignmentId={assignmentId}
                        initialSelectedPointIds={[...assignmentPointMap.keys()]}
                        onSaved={() => {
                            setEditingPoints(false);
                            reload();
                        }}
                        onCancelled={() => setEditingPoints(false)}
                        onToast={onToast}
                    />
                </div>
            ) : (
                <>
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px',
                            marginBottom: '8px',
                            flexWrap: 'wrap',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                            <PmUploadButton
                                assignmentId={assignment.id}
                                onComplete={() => reload()}
                            />
                            <span style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>
                                Upload as-staked CSV (PNEZD format) to compute QC results.
                            </span>
                        </div>
                        {isAssignmentEditable(assignment.status) && (
                            <button
                                type="button"
                                onClick={() => setEditingPoints(true)}
                                style={editIconBtn}
                                title="Add or remove points from this assignment"
                            >
                                <Pencil size={12} /> Edit points
                            </button>
                        )}
                    </div>

                    {!hasQc && (
                        <PmUploadDropZone
                            assignmentId={assignment.id}
                            onComplete={() => reload()}
                        />
                    )}

                    <div style={{ position: 'relative', marginBottom: '12px' }}>
                        <div style={{ ...card, padding: 0, overflow: 'hidden', height: '600px', marginBottom: 0 }}>
                            <DesignPointsPlanView
                                designPoints={designPoints}
                                selectedIds={EMPTY_SET}
                                onSelectionChange={noop}
                                hoveredId={hoveredId}
                                onHoverChange={setHoveredId}
                                pointStatusMap={pointStatusMap}
                                extraPointData={extraPointData}
                            />
                        </div>

                        {/* Dev-only seeder overlay (hidden in prod builds) */}
                        <AssignmentTestDataSeeder
                            supabase={supabase}
                            profile={profile}
                            assignment={assignment}
                            designPoints={designPoints}
                            onToast={onToast}
                            onSeeded={reload}
                        />

                        {!hasQc && (
                            <div style={noQcOverlay}>
                                No QC data submitted yet
                            </div>
                        )}
                    </div>
                </>
            )}

            {/* Legend */}
            <div
                style={{
                    display: 'flex',
                    gap: '14px',
                    flexWrap: 'wrap',
                    color: 'var(--text-muted)',
                    fontSize: '12px',
                    marginBottom: '24px',
                }}
            >
                <LegendSwatch color="var(--success)" label="in tolerance" />
                <LegendSwatch color="var(--error)" label="out of tolerance" />
                <LegendSwatch color="var(--brand-amber)" label="field fit" />
                <LegendSwatch color="rgba(201, 116, 242, 1)" label="built on" />
                <LegendSwatch color="var(--brand-teal)" label="pending / unstaked" />
            </div>

            {/* Point list */}
            <PointList
                rows={summaryRows}
                assignmentPointMap={assignmentPointMap}
                editable={isAssignmentEditable(assignment.status)}
                defaultToleranceH={assignment.default_tolerance_h}
                defaultToleranceV={assignment.default_tolerance_v}
                onOpenOverride={(payload) => setOverridePopover(payload)}
            />

            {overridePopover && (
                <PointTolerancePopover
                    supabase={supabase}
                    assignmentPointId={overridePopover.assignmentPointId}
                    pointId={overridePopover.pointId}
                    currentOverrideH={overridePopover.currentH}
                    currentOverrideV={overridePopover.currentV}
                    defaultH={assignment.default_tolerance_h}
                    defaultV={assignment.default_tolerance_v}
                    anchorRect={overridePopover.anchorRect}
                    onSaved={() => {
                        setOverridePopover(null);
                        reload();
                    }}
                    onCancelled={() => setOverridePopover(null)}
                    onToast={onToast}
                />
            )}

            {/* Reconcile CTA — only while status === 'submitted'. Once
                reconciled, the metadata card already surfaces the note
                and timestamp, so we hide the CTA. */}
            {assignment.status === 'submitted' && (
                <div style={reconcileCard}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CheckCircle2 size={18} color="var(--brand-teal-light)" />
                        <div>
                            <div
                                style={{
                                    color: 'var(--text-main)',
                                    fontWeight: 600,
                                    fontSize: '14px',
                                }}
                            >
                                Ready to reconcile
                            </div>
                            <div
                                style={{
                                    color: 'var(--text-muted)',
                                    fontSize: '12.5px',
                                    marginTop: '2px',
                                }}
                            >
                                Field work submitted. Review the QC and close out this assignment.
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setReconcileOpen(true)}
                        style={reconcilePrimaryBtn}
                    >
                        <CheckCircle2 size={14} /> Reconcile assignment
                    </button>
                </div>
            )}

            {reconcileOpen && (
                <ReconciliationModal
                    supabase={supabase}
                    profile={profile}
                    assignment={assignment}
                    project={project}
                    chiefName={fullName(chief)}
                    qcRows={summaryRows}
                    qcSummary={statusCounts}
                    onClose={() => setReconcileOpen(false)}
                    onReconciled={(updated) => {
                        setAssignment(updated);
                        setReconcileOpen(false);
                        reload();
                    }}
                    onToast={onToast}
                />
            )}

            {resendConfirmOpen && (
                <ResendConfirmModal
                    chiefName={fullName(chief)}
                    wasDraft={assignment.status === 'draft'}
                    busy={resendBusy}
                    onCancel={() => setResendConfirmOpen(false)}
                    onConfirm={handleResend}
                />
            )}
        </div>
    );
}

// ── ReconciledByLabel ──────────────────────────────────────────────────
// Tiny name-lookup widget for the "Reconciled by" row. Fetches once on
// mount so the common case (PM reconciles their own assignment and it's
// immediately surfaced) doesn't need an extra prop drill.

function ReconciledByLabel({ supabase, userId }) {
    const [name, setName] = useState(null);
    useEffect(() => {
        let cancelled = false;
        if (!userId) {
            setName(null);
            return;
        }
        (async () => {
            try {
                const { data } = await supabase
                    .from('user_profiles')
                    .select('first_name, last_name')
                    .eq('id', userId)
                    .single();
                if (!cancelled) setName(fullName(data));
            } catch {
                if (!cancelled) setName(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [supabase, userId]);
    return name ? <>{name}</> : <span style={{ color: 'var(--text-muted)' }}>—</span>;
}

// ── ResendConfirmModal ─────────────────────────────────────────────────

function ResendConfirmModal({ chiefName, wasDraft, busy, onCancel, onConfirm }) {
    useEffect(() => {
        function onKey(e) {
            if (e.key === 'Escape' && !busy) onCancel();
        }
        document.addEventListener('keydown', onKey, true);
        return () => document.removeEventListener('keydown', onKey, true);
    }, [busy, onCancel]);

    return (
        <div style={resendBackdrop} onClick={() => (busy ? null : onCancel())}>
            <div style={resendCard} onClick={(e) => e.stopPropagation()}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                    <Send size={18} color="var(--brand-teal-light)" />
                    <h3 style={{ margin: 0, fontSize: '15px', color: 'var(--text-main)', fontWeight: 600 }}>
                        {wasDraft ? 'Send assignment' : 'Re-send assignment'}
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
                    {wasDraft
                        ? `Send this assignment to ${chiefName || 'the assigned chief'}?`
                        : `Re-send this assignment to ${chiefName || 'the assigned chief'}?`}{' '}
                    The sent timestamp will be updated.
                </p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={busy}
                        style={resendCancelBtn(busy)}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={busy}
                        style={resendConfirmBtn(busy)}
                    >
                        {busy ? (
                            <>
                                <Loader size={13} className="spinning" /> Sending…
                            </>
                        ) : (
                            <>
                                <Send size={13} /> {wasDraft ? 'Send' : 'Re-send'}
                            </>
                        )}
                    </button>
                </div>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spinning { animation: spin 1s linear infinite; }`}</style>
            </div>
        </div>
    );
}

const EMPTY_SET = new Set();
function noop() {}

function StatCard({ label, value, color }) {
    return (
        <div style={statCardStyle}>
            <div style={statLabelStyle}>{label}</div>
            <div className="coordinate-data" style={{ color, fontSize: '22px', fontWeight: 600 }}>
                {value ?? 0}
            </div>
        </div>
    );
}

function LegendSwatch({ color, label }) {
    return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span
                style={{
                    display: 'inline-block',
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    backgroundColor: color,
                }}
            />
            {label}
        </span>
    );
}

// ── PointList ──────────────────────────────────────────────────────────

const LIST_COLS = [
    { key: 'point_id', label: 'Point', sortable: true },
    { key: 'design_feature_code', label: 'Feature', sortable: true },
    { key: 'design_n', label: 'Design N', num: true },
    { key: 'design_e', label: 'Design E', num: true },
    { key: 'design_z', label: 'Design Z', num: true },
    { key: 'staked_n', label: 'Staked N', num: true },
    { key: 'staked_e', label: 'Staked E', num: true },
    { key: 'staked_z', label: 'Staked Z', num: true },
    { key: 'delta_n', label: 'ΔN', num: true },
    { key: 'delta_e', label: 'ΔE', num: true },
    { key: 'delta_h', label: 'ΔH', num: true, sortable: true },
    { key: 'delta_z', label: 'ΔZ', num: true },
    { key: 'effective_tolerance_h', label: 'Tol H', num: true },
    { key: '__override', label: 'Override' },
    { key: 'h_status', label: 'Status', sortable: true },
    { key: 'field_fit_reason', label: 'Field-fit reason' },
];

function fmtNum(v, dec = 3) {
    if (v == null) return '';
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(dec) : '';
}

// One-cell renderer for the new "Override" column. Displays the per-point
// override values when present (amber bold mono) or "Default" otherwise
// (muted italic). Click captures the cell's bounding rect and opens the
// PointTolerancePopover up at the parent. Read-only assignments (sent →
// reconciled) render the same content but without click handling.
function OverrideCell({ assignmentPoint, pointId, designPointId, editable, onOpen }) {
    const h = assignmentPoint?.override_tolerance_h;
    const v = assignmentPoint?.override_tolerance_v;
    const hasOverride = h != null || v != null;
    const apId = assignmentPoint?.id;

    function handleClick(e) {
        if (!editable || !apId) return;
        const rect = e.currentTarget.getBoundingClientRect();
        onOpen({
            assignmentPointId: apId,
            designPointId,
            pointId,
            currentH: h,
            currentV: v,
            anchorRect: rect,
        });
    }

    const interactive = editable && apId;
    const baseStyle = {
        background: 'transparent',
        border: 'none',
        padding: '2px 6px',
        borderRadius: '4px',
        cursor: interactive ? 'pointer' : 'default',
        fontFamily: hasOverride ? "'JetBrains Mono', monospace" : 'inherit',
        fontSize: '12px',
        color: hasOverride ? 'var(--brand-amber)' : 'var(--text-muted)',
        fontWeight: hasOverride ? 700 : 400,
        fontStyle: hasOverride ? 'normal' : 'italic',
        textAlign: 'left',
    };

    const label = hasOverride
        ? `H: ${h != null ? Number(h).toFixed(3) : '—'} / V: ${v != null ? Number(v).toFixed(3) : '—'}`
        : 'Default';

    if (!interactive) {
        return <span style={baseStyle}>{label}</span>;
    }

    return (
        <button
            type="button"
            onClick={handleClick}
            style={{
                ...baseStyle,
                cursor: 'pointer',
            }}
            title="Set per-point tolerance override"
        >
            {label}
        </button>
    );
}

function PointList({
    rows,
    assignmentPointMap,
    editable,
    defaultToleranceH,
    defaultToleranceV,
    onOpenOverride,
}) {
    const [filter, setFilter] = useState('');
    const [sort, setSort] = useState({ key: 'point_id', dir: 'asc' });

    const filtered = useMemo(() => {
        const q = filter.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => {
            const hay = [r.point_id, r.design_feature_code, r.h_status, r.field_fit_reason]
                .map((v) => (v == null ? '' : String(v).toLowerCase()))
                .join(' ');
            return hay.includes(q);
        });
    }, [rows, filter]);

    const sorted = useMemo(() => {
        const copy = [...filtered];
        copy.sort((a, b) => {
            const av = a[sort.key];
            const bv = b[sort.key];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            if (sort.key === 'delta_h') {
                // largest first when desc, smallest first when asc
                return sort.dir === 'asc' ? av - bv : bv - av;
            }
            if (typeof av === 'number' && typeof bv === 'number') {
                return sort.dir === 'asc' ? av - bv : bv - av;
            }
            const as = String(av);
            const bs = String(bv);
            return sort.dir === 'asc'
                ? as.localeCompare(bs, undefined, { numeric: true })
                : bs.localeCompare(as, undefined, { numeric: true });
        });
        return copy;
    }, [filtered, sort]);

    function changeSort(key) {
        const col = LIST_COLS.find((c) => c.key === key);
        if (!col || !col.sortable) return;
        setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
    }

    return (
        <div>
            <style>{`
                .pl-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
                .pl-table th {
                    text-align: left;
                    padding: 10px 12px;
                    font-size: 10.5px;
                    letter-spacing: 0.5px;
                    text-transform: uppercase;
                    color: var(--text-muted);
                    border-bottom: 1px solid var(--border-subtle);
                    white-space: nowrap;
                    background: rgba(255,255,255,0.02);
                    font-weight: 600;
                }
                .pl-table th.sortable { cursor: pointer; user-select: none; }
                .pl-table th.sortable:hover { color: var(--text-main); }
                .pl-table td {
                    padding: 9px 12px;
                    color: var(--text-main);
                    border-bottom: 1px solid var(--border-subtle);
                    white-space: nowrap;
                }
                .pl-status-chip {
                    display: inline-block;
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                    text-transform: uppercase;
                    letter-spacing: 0.3px;
                }
                @media (max-width: 768px) { .pl-desktop { display: none; } .pl-mobile { display: flex; } }
                @media (min-width: 769px) { .pl-mobile { display: none; } }
            `}</style>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginBottom: '12px',
                    flexWrap: 'wrap',
                }}
            >
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-dark)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '8px',
                        flex: '1 1 240px',
                        maxWidth: '360px',
                    }}
                >
                    <Search size={14} color="var(--text-muted)" />
                    <input
                        type="text"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder="Filter by point, feature, status"
                        style={{
                            flex: 1,
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            color: 'var(--text-main)',
                            fontSize: '13px',
                        }}
                    />
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                    {sorted.length} row{sorted.length === 1 ? '' : 's'}
                </span>
            </div>

            <div
                className="pl-desktop"
                style={{
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '10px',
                    overflow: 'auto',
                    backgroundColor: 'var(--bg-dark)',
                }}
            >
                <table className="pl-table">
                    <thead>
                        <tr>
                            {LIST_COLS.map((c) => {
                                const active = sort.key === c.key;
                                return (
                                    <th
                                        key={c.key}
                                        scope="col"
                                        className={c.sortable ? 'sortable' : undefined}
                                        onClick={() => changeSort(c.key)}
                                        style={{
                                            color: active ? 'var(--brand-amber)' : undefined,
                                            textAlign: c.num ? 'right' : 'left',
                                        }}
                                    >
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                            {c.label}
                                            {active && c.sortable
                                                ? sort.dir === 'asc'
                                                    ? <ArrowUp size={11} />
                                                    : <ArrowDown size={11} />
                                                : null}
                                        </span>
                                    </th>
                                );
                            })}
                        </tr>
                    </thead>
                    <tbody>
                        {sorted.length === 0 ? (
                            <tr>
                                <td
                                    colSpan={LIST_COLS.length}
                                    style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}
                                >
                                    No rows match this filter.
                                </td>
                            </tr>
                        ) : (
                            sorted.map((r, i) => {
                                const status = r.h_status || null;
                                const rowBg = status ? POINT_STATUS_ROW_BG[status] : undefined;
                                return (
                                    <tr
                                        key={(r.observation_id || r.design_point_id || '') + ':' + i}
                                        style={rowBg ? { backgroundColor: rowBg } : undefined}
                                    >
                                        {LIST_COLS.map((c) => {
                                            const raw = r[c.key];
                                            if (c.key === 'h_status') {
                                                const statusKey = raw || 'pending';
                                                return (
                                                    <td key={c.key}>
                                                        <span
                                                            className="pl-status-chip"
                                                            style={{
                                                                color: POINT_STATUS_COLOR[statusKey],
                                                                backgroundColor: 'rgba(255,255,255,0.04)',
                                                            }}
                                                        >
                                                            {POINT_STATUS_LABEL[statusKey] || statusKey}
                                                        </span>
                                                    </td>
                                                );
                                            }
                                            if (c.key === '__override') {
                                                const ap = assignmentPointMap?.get(r.design_point_id);
                                                return (
                                                    <td key={c.key}>
                                                        <OverrideCell
                                                            assignmentPoint={ap}
                                                            pointId={r.point_id}
                                                            designPointId={r.design_point_id}
                                                            editable={editable}
                                                            onOpen={onOpenOverride}
                                                        />
                                                    </td>
                                                );
                                            }
                                            const content = c.num ? fmtNum(raw) : raw == null ? '' : String(raw);
                                            return (
                                                <td
                                                    key={c.key}
                                                    className={c.num ? 'coordinate-data' : undefined}
                                                    style={{
                                                        textAlign: c.num ? 'right' : 'left',
                                                        color: c.key === 'point_id' ? 'var(--brand-amber)' : undefined,
                                                        fontWeight: c.key === 'point_id' ? 600 : undefined,
                                                    }}
                                                >
                                                    {content}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <div className="pl-mobile" style={{ flexDirection: 'column', gap: '8px' }}>
                {sorted.length === 0 ? (
                    <div style={{ padding: '20px', color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border-subtle)', borderRadius: '10px' }}>
                        No rows match this filter.
                    </div>
                ) : (
                    sorted.map((r, i) => {
                        const status = r.h_status || 'pending';
                        return (
                            <div
                                key={(r.observation_id || r.design_point_id || '') + ':m:' + i}
                                style={{
                                    backgroundColor: POINT_STATUS_ROW_BG[status] || 'var(--bg-dark)',
                                    border: '1px solid var(--border-subtle)',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--brand-amber)', fontWeight: 700 }}>
                                        {r.point_id}
                                    </span>
                                    <span
                                        className="pl-status-chip"
                                        style={{
                                            color: POINT_STATUS_COLOR[status] || 'var(--text-muted)',
                                            backgroundColor: 'rgba(255,255,255,0.04)',
                                        }}
                                    >
                                        {POINT_STATUS_LABEL[status] || status}
                                    </span>
                                </div>
                                <div className="coordinate-data" style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                    ΔH {fmtNum(r.delta_h)} / {fmtNum(r.effective_tolerance_h)} tol
                                    {r.delta_z != null && (
                                        <>
                                            {' · '}
                                            ΔZ {fmtNum(r.delta_z)}
                                        </>
                                    )}
                                </div>
                                {r.field_fit_reason && (
                                    <div style={{ marginTop: '4px', fontSize: '11.5px', color: 'var(--brand-amber)' }}>
                                        {r.field_fit_reason.replace(/_/g, ' ')}
                                    </div>
                                )}
                                <div style={{ marginTop: '6px' }}>
                                    <OverrideCell
                                        assignmentPoint={assignmentPointMap?.get(r.design_point_id)}
                                        pointId={r.point_id}
                                        designPointId={r.design_point_id}
                                        editable={editable}
                                        onOpen={onOpenOverride}
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────

const card = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '18px 20px',
    marginBottom: '20px',
};

const loadingCard = {
    padding: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
};

const errorCard = {
    padding: '40px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
};

const primaryBtn = {
    backgroundColor: 'var(--brand-teal)',
    color: '#fff',
    border: '1px solid var(--brand-teal)',
    padding: '9px 16px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    fontFamily: 'inherit',
};

const statCardStyle = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '10px',
    padding: '12px 14px',
};

const statLabelStyle = {
    color: 'var(--text-muted)',
    fontSize: '10.5px',
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    fontWeight: 600,
    marginBottom: '6px',
};

const editIconBtn = {
    background: 'transparent',
    border: '1px solid var(--border-subtle)',
    color: 'var(--text-muted)',
    padding: '5px 10px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '11.5px',
    fontWeight: 600,
    letterSpacing: '0.3px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontFamily: 'inherit',
    transition: 'color 0.15s ease, border-color 0.15s ease',
};

function exportBtnStyle(disabled) {
    return {
        backgroundColor: disabled ? 'transparent' : 'var(--bg-surface)',
        color: disabled ? 'var(--text-muted)' : 'var(--text-main)',
        border: '1px solid var(--border-subtle)',
        padding: '6px 12px',
        borderRadius: '6px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        fontFamily: 'inherit',
        fontWeight: 500,
        transition: 'border-color 0.15s ease, color 0.15s ease',
    };
}

const reconcileCard = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '16px',
    flexWrap: 'wrap',
    padding: '16px 20px',
    marginTop: '28px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--brand-teal)',
    borderRadius: '12px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
};

const reconcilePrimaryBtn = {
    backgroundColor: 'var(--brand-teal)',
    color: '#fff',
    border: '1px solid var(--brand-teal)',
    padding: '10px 18px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '13.5px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontFamily: 'inherit',
};

const resendBackdrop = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    backdropFilter: 'blur(3px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
};

const resendCard = {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '20px 22px',
    width: '100%',
    maxWidth: '420px',
    boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
};

function resendCancelBtn(disabled) {
    return {
        backgroundColor: 'transparent',
        color: 'var(--text-main)',
        border: '1px solid var(--border-subtle)',
        padding: '8px 14px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 500,
        fontSize: '13px',
        fontFamily: 'inherit',
    };
}

function resendConfirmBtn(disabled) {
    return {
        backgroundColor: 'var(--brand-teal)',
        color: '#fff',
        border: '1px solid var(--brand-teal)',
        padding: '8px 14px',
        borderRadius: '8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        fontWeight: 600,
        fontSize: '13px',
        fontFamily: 'inherit',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
    };
}

const noQcOverlay = {
    position: 'absolute',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    backgroundColor: 'rgba(10, 15, 30, 0.9)',
    color: 'var(--text-muted)',
    padding: '8px 16px',
    borderRadius: '8px',
    fontSize: '12.5px',
    border: '1px solid var(--border-subtle)',
    pointerEvents: 'none',
};
