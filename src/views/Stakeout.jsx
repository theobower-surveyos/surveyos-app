import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    MapPin,
    ClipboardList,
    Activity,
    BarChart3,
    Layers,
    Loader,
    Upload,
    Target,
    CheckCircle2,
    AlertCircle,
    X,
} from 'lucide-react';
import DesignPointsTable from '../components/DesignPointsTable.jsx';
import DesignPointsImporter from '../components/DesignPointsImporter.jsx';
import AssignmentBuilder from '../components/AssignmentBuilder.jsx';
import AssignmentsList from '../components/AssignmentsList.jsx';
import AssignmentDetail from '../components/AssignmentDetail.jsx';

const TABS = [
    { key: 'design_points', label: 'Design points', icon: Target, stage: null },
    { key: 'assignments', label: 'Assignments', icon: ClipboardList, stage: 'Coming in Stage 6 — daily stakeout assignments' },
    { key: 'qc_runs', label: 'QC runs', icon: Activity, stage: 'Coming in Stage 7 — submitted field observations' },
    { key: 'accuracy', label: 'Accuracy', icon: BarChart3, stage: 'Coming in Stage 11 — per-person accuracy tracking' },
];

export default function Stakeout({ supabase, profile, projects }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const projectId = searchParams.get('project') || null;

    const activeProjects = useMemo(
        () => (projects || []).filter((p) => p.status !== 'archived'),
        [projects]
    );
    const selectedProject = useMemo(
        () => (projectId ? activeProjects.find((p) => p.id === projectId) : null),
        [projectId, activeProjects]
    );

    if (projectId && selectedProject) {
        return (
            <ProjectScoped
                supabase={supabase}
                profile={profile}
                project={selectedProject}
                onBack={() => navigate('/stakeout')}
            />
        );
    }

    // If the URL has a project param but it's not found, fall back to landing.
    if (projectId && !selectedProject) {
        return (
            <div style={pageWrap}>
                <div style={emptyState}>
                    <MapPin size={28} color="var(--text-muted)" style={{ marginBottom: '10px' }} />
                    <div style={{ color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                        Project not found
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginBottom: '16px' }}>
                        It may have been archived or doesn't belong to your firm.
                    </div>
                    <button style={primaryBtn} onClick={() => setSearchParams({})}>
                        Back to stakeout projects
                    </button>
                </div>
            </div>
        );
    }

    return (
        <Landing
            supabase={supabase}
            profile={profile}
            projects={activeProjects}
            onOpenProject={(id) => setSearchParams({ project: id })}
        />
    );
}

// ── Landing ────────────────────────────────────────────────────────────────

function Landing({ supabase, profile, projects, onOpenProject }) {
    const [stats, setStats] = useState({
        activeProjects: 0,
        assignmentsToday: 0,
        runsAwaiting: 0,
        pointsThisMonth: 0,
    });
    const [projectMeta, setProjectMeta] = useState({}); // id → { pointCount, recentAssignments }
    const [loadingMeta, setLoadingMeta] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function loadLandingData() {
            setLoadingMeta(true);
            const today = new Date().toISOString().slice(0, 10);
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();

            const [dpRes, asgTodayRes, runsRes, pointsRes, dpAllRes, asgAllRes] = await Promise.all([
                safe(() =>
                    supabase
                        .from('stakeout_design_points')
                        .select('project_id', { head: false })
                        .limit(10000)
                ),
                safe(() =>
                    supabase
                        .from('stakeout_assignments')
                        .select('id', { count: 'exact', head: true })
                        .eq('assignment_date', today)
                ),
                safe(() =>
                    supabase
                        .from('stakeout_qc_runs')
                        .select('id, stakeout_assignments!inner(status)', { count: 'exact', head: true })
                        .eq('stakeout_assignments.status', 'submitted')
                ),
                safe(() =>
                    supabase
                        .from('stakeout_qc_points')
                        .select('id, stakeout_qc_runs!inner(submitted_at)', { count: 'exact', head: true })
                        .gte('stakeout_qc_runs.submitted_at', thirtyDaysAgo)
                ),
                // Per-project counts for the cards below.
                safe(() =>
                    supabase
                        .from('stakeout_design_points')
                        .select('project_id')
                        .limit(20000)
                ),
                safe(() =>
                    supabase
                        .from('stakeout_assignments')
                        .select('project_id, assignment_date')
                        .gte('assignment_date', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10))
                ),
            ]);

            if (cancelled) return;

            // Distinct projects with design points
            const activeSet = new Set();
            (dpRes.data || []).forEach((r) => r?.project_id && activeSet.add(r.project_id));

            setStats({
                activeProjects: activeSet.size,
                assignmentsToday: asgTodayRes.count ?? 0,
                runsAwaiting: runsRes.count ?? 0,
                pointsThisMonth: pointsRes.count ?? 0,
            });

            // Build per-project metadata
            const pointCounts = {};
            (dpAllRes.data || []).forEach((r) => {
                if (!r?.project_id) return;
                pointCounts[r.project_id] = (pointCounts[r.project_id] || 0) + 1;
            });
            const asgCounts = {};
            (asgAllRes.data || []).forEach((r) => {
                if (!r?.project_id) return;
                asgCounts[r.project_id] = (asgCounts[r.project_id] || 0) + 1;
            });
            const meta = {};
            for (const p of projects) {
                meta[p.id] = {
                    pointCount: pointCounts[p.id] || 0,
                    recentAssignments: asgCounts[p.id] || 0,
                };
            }
            setProjectMeta(meta);
            setLoadingMeta(false);
        }
        loadLandingData();
        return () => {
            cancelled = true;
        };
    }, [supabase, projects]);

    const anyProjectHasStakeoutData = useMemo(
        () => Object.values(projectMeta).some((m) => m.pointCount > 0 || m.recentAssignments > 0),
        [projectMeta]
    );

    return (
        <div style={pageWrap}>
            <PageHeader
                title="Stakeout QC"
                subtitle="Design points · daily assignments · field verification"
            />

            {/* Summary stat row */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
                    gap: '14px',
                    marginTop: '8px',
                    marginBottom: '32px',
                }}
            >
                <StatCard label="Active projects" value={stats.activeProjects} icon={Layers} />
                <StatCard label="Assignments today" value={stats.assignmentsToday} icon={ClipboardList} />
                <StatCard label="Runs awaiting reconcile" value={stats.runsAwaiting} icon={Activity} />
                <StatCard label="Points staked (30d)" value={stats.pointsThisMonth} icon={Target} />
            </div>

            {/* Projects section */}
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <h2 style={{ margin: 0, fontSize: '20px', color: 'var(--text-main)' }}>Your projects</h2>
                <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                    {projects.length} active · firm-scoped
                </span>
            </div>

            {projects.length === 0 ? (
                <div style={emptyState}>
                    <div style={{ color: 'var(--text-main)', fontWeight: 600, marginBottom: '6px' }}>
                        No active projects in your firm
                    </div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        Create a project from the Command Center to start staking design points.
                    </div>
                </div>
            ) : !loadingMeta && !anyProjectHasStakeoutData ? (
                <>
                    <div
                        style={{
                            ...emptyState,
                            backgroundColor: 'rgba(13, 79, 79, 0.10)',
                            borderColor: 'var(--brand-teal)',
                            marginBottom: '20px',
                        }}
                    >
                        <Upload size={22} color="var(--brand-teal)" style={{ marginBottom: '8px' }} />
                        <div style={{ color: 'var(--text-main)', fontWeight: 600, marginBottom: '4px' }}>
                            No stakeout data yet
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                            Drop a design-point file into any project to get started.
                        </div>
                    </div>
                    <ProjectGrid projects={projects} projectMeta={projectMeta} onOpen={onOpenProject} />
                </>
            ) : (
                <ProjectGrid projects={projects} projectMeta={projectMeta} onOpen={onOpenProject} loading={loadingMeta} />
            )}
        </div>
    );
}

function StatCard({ label, value, icon: Icon }) {
    return (
        <div
            style={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                padding: '16px 18px',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <Icon size={14} color="var(--brand-teal)" />
                <span
                    style={{
                        color: 'var(--text-muted)',
                        fontSize: '11px',
                        letterSpacing: '0.8px',
                        textTransform: 'uppercase',
                        fontWeight: 600,
                    }}
                >
                    {label}
                </span>
            </div>
            <div
                className="coordinate-data"
                style={{ color: 'var(--brand-amber)', fontSize: '28px', fontWeight: 600 }}
            >
                {value}
            </div>
        </div>
    );
}

function ProjectGrid({ projects, projectMeta, onOpen, loading }) {
    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '14px',
            }}
        >
            {projects.map((p) => {
                const meta = projectMeta[p.id] || { pointCount: 0, recentAssignments: 0 };
                const hasData = meta.pointCount > 0 || meta.recentAssignments > 0;
                return (
                    <button
                        key={p.id}
                        onClick={() => onOpen(p.id)}
                        style={{
                            textAlign: 'left',
                            backgroundColor: 'var(--bg-surface)',
                            border: `1px solid ${hasData ? 'var(--brand-teal)' : 'var(--border-subtle)'}`,
                            borderRadius: '12px',
                            padding: '16px 18px',
                            cursor: 'pointer',
                            color: 'var(--text-main)',
                            fontFamily: 'inherit',
                            transition: 'border-color 0.15s, transform 0.15s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = 'var(--brand-teal-light)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = hasData ? 'var(--brand-teal)' : 'var(--border-subtle)';
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
                            <span style={{ fontWeight: 600, fontSize: '15px' }}>{p.project_name}</span>
                            <span
                                style={{
                                    fontSize: '10px',
                                    letterSpacing: '0.6px',
                                    textTransform: 'uppercase',
                                    color: 'var(--text-muted)',
                                    border: '1px solid var(--border-subtle)',
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    alignSelf: 'flex-start',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {p.status || 'pending'}
                            </span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.6 }}>
                            {loading ? (
                                <span style={{ opacity: 0.6 }}>loading…</span>
                            ) : (
                                <>
                                    <span className="coordinate-data" style={{ color: meta.pointCount > 0 ? 'var(--brand-amber)' : 'var(--text-muted)' }}>
                                        {meta.pointCount}
                                    </span>{' '}
                                    point{meta.pointCount === 1 ? '' : 's'} loaded ·{' '}
                                    <span className="coordinate-data">
                                        {meta.recentAssignments}
                                    </span>{' '}
                                    assignment{meta.recentAssignments === 1 ? '' : 's'} this week
                                </>
                            )}
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

// ── Project-scoped ─────────────────────────────────────────────────────────

function ProjectScoped({ supabase, profile, project, onBack }) {
    const [activeTab, setActiveTab] = useState('design_points');
    const [designPoints, setDesignPoints] = useState([]);
    const [loadingDP, setLoadingDP] = useState(false);
    const [importerOpen, setImporterOpen] = useState(false);
    const [toast, setToast] = useState(null);

    // Toast lifecycle is owned by the Toast component itself now — it
    // handles the 5s success auto-dismiss and the 200ms exit animation
    // before calling onDismiss to null out this state. Parent's job is
    // just to fire new messages (replace-on-new semantics via key=id).
    const showToast = (kind, message) => setToast({ id: Date.now() + Math.random(), kind, message });
    const dismissToast = () => setToast(null);

    async function loadDesignPoints() {
        if (!project?.id) return;
        setLoadingDP(true);
        try {
            const { data, error } = await supabase
                .from('stakeout_design_points')
                .select('*')
                .eq('project_id', project.id)
                .order('point_id', { ascending: true });
            if (error) throw error;
            setDesignPoints(data || []);
            // If user previously had the importer open but now has points,
            // close it so the table is the default view.
            if ((data || []).length > 0) setImporterOpen(false);
            else setImporterOpen(true);
        } catch (err) {
            console.error('[Stakeout] load design points:', err);
            showToast('error', 'Failed to load design points. Check console.');
        } finally {
            setLoadingDP(false);
        }
    }

    useEffect(() => {
        loadDesignPoints();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.id]);

    return (
        <div style={pageWrap}>
            <style>{`
                .stakeout-back-link {
                    background-color: transparent;
                    color: var(--text-main);
                    border: none;
                    padding: 6px 0;
                    margin-bottom: 12px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-size: 15px;
                    font-family: inherit;
                    transition: color 0.15s ease;
                }
                .stakeout-back-link:hover { color: var(--brand-teal-light); }
                .stakeout-back-arrow {
                    display: inline-flex;
                    transition: transform 0.15s ease;
                }
                .stakeout-back-link:hover .stakeout-back-arrow { transform: translateX(-2px); }

                .stakeout-toast {
                    position: fixed;
                    top: 80px;
                    right: 24px;
                    z-index: 9999;
                    min-width: 300px;
                    max-width: 420px;
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 12px 14px;
                    background-color: var(--bg-surface);
                    border: 1px solid var(--border-subtle);
                    border-radius: 10px;
                    color: var(--text-main);
                    font-size: 14px;
                    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
                }
                .stakeout-toast.entering {
                    animation: stakeout-toast-slide-in 0.3s ease-out;
                }
                .stakeout-toast.exiting {
                    animation: stakeout-toast-slide-out 0.2s ease-in forwards;
                }
                @keyframes stakeout-toast-slide-in {
                    from { transform: translateX(100%); opacity: 0; }
                    to   { transform: translateX(0);    opacity: 1; }
                }
                @keyframes stakeout-toast-slide-out {
                    from { transform: translateX(0);    opacity: 1; }
                    to   { transform: translateX(100%); opacity: 0; }
                }
                @keyframes stakeout-toast-slide-down {
                    from { transform: translateY(-100%); opacity: 0; }
                    to   { transform: translateY(0);     opacity: 1; }
                }
                @keyframes stakeout-toast-slide-up {
                    from { transform: translateY(0);     opacity: 1; }
                    to   { transform: translateY(-100%); opacity: 0; }
                }
                @media (max-width: 768px) {
                    .stakeout-toast {
                        top: 16px;
                        left: 16px;
                        right: 16px;
                        min-width: 0;
                        max-width: none;
                        width: auto;
                    }
                    .stakeout-toast.entering {
                        animation: stakeout-toast-slide-down 0.3s ease-out;
                    }
                    .stakeout-toast.exiting {
                        animation: stakeout-toast-slide-up 0.2s ease-in forwards;
                    }
                }
                .stakeout-toast-dismiss {
                    background: transparent;
                    border: none;
                    color: var(--text-muted);
                    cursor: pointer;
                    padding: 4px;
                    display: inline-flex;
                    align-items: center;
                    border-radius: 4px;
                }
                .stakeout-toast-dismiss:hover { color: var(--text-main); }
            `}</style>

            {toast && <Toast key={toast.id} toast={toast} onDismiss={dismissToast} />}

            <button onClick={onBack} className="stakeout-back-link" type="button">
                <span className="stakeout-back-arrow"><ArrowLeft size={15} /></span>
                All stakeout projects
            </button>

            <div style={{ marginBottom: '24px' }}>
                <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', fontWeight: 700, color: 'var(--text-main)' }}>
                    {project.project_name}
                </h1>
                <div style={{ color: 'var(--text-muted)', fontSize: '13px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span>Status: {String(project.status || 'pending').toUpperCase()}</span>
                    {project.scheduled_date && <span>Scheduled: {project.scheduled_date}</span>}
                    {project.location && <span>· {project.location}</span>}
                </div>
            </div>

            {/* Tab bar */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    borderBottom: '1px solid var(--border-subtle)',
                    marginBottom: '24px',
                    overflowX: 'auto',
                }}
            >
                {TABS.map((t) => {
                    const active = activeTab === t.key;
                    const Icon = t.icon;
                    return (
                        <button
                            key={t.key}
                            onClick={() => setActiveTab(t.key)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: active ? 'var(--brand-amber)' : 'var(--text-muted)',
                                padding: '10px 16px',
                                fontSize: '14px',
                                fontWeight: active ? 600 : 500,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                borderBottom: active ? '2px solid var(--brand-amber)' : '2px solid transparent',
                                marginBottom: '-1px',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            <Icon size={14} />
                            {t.label}
                        </button>
                    );
                })}
            </div>

            {activeTab === 'design_points' ? (
                <DesignPointsSection
                    supabase={supabase}
                    profile={profile}
                    project={project}
                    designPoints={designPoints}
                    loading={loadingDP}
                    importerOpen={importerOpen}
                    setImporterOpen={setImporterOpen}
                    onReload={loadDesignPoints}
                    showToast={showToast}
                />
            ) : activeTab === 'assignments' ? (
                <AssignmentsTab
                    supabase={supabase}
                    profile={profile}
                    project={project}
                    showToast={showToast}
                />
            ) : (
                <PlaceholderTab tab={TABS.find((t) => t.key === activeTab)} />
            )}
        </div>
    );
}

function DesignPointsSection({
    supabase,
    profile,
    project,
    designPoints,
    loading,
    importerOpen,
    setImporterOpen,
    onReload,
    showToast,
}) {
    const latestImport = useMemo(() => {
        if (designPoints.length === 0) return null;
        let latest = designPoints[0];
        for (const p of designPoints) {
            if (p.imported_at && (!latest.imported_at || p.imported_at > latest.imported_at)) {
                latest = p;
            }
        }
        return latest;
    }, [designPoints]);

    const hasPoints = designPoints.length > 0;

    if (loading) {
        return (
            <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Loader size={18} className="spinning" />
                <div style={{ marginTop: '8px', fontSize: '13px' }}>Loading design points…</div>
                <style>{`@keyframes spin { 100% { transform: rotate(360deg); } } .spinning { animation: spin 1s linear infinite; }`}</style>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {hasPoints && !importerOpen && (
                <div
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                        flexWrap: 'wrap',
                        padding: '14px 18px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '10px',
                    }}
                >
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                        <strong className="coordinate-data" style={{ color: 'var(--brand-amber)' }}>
                            {designPoints.length}
                        </strong>{' '}
                        points loaded
                        {latestImport?.source_file && (
                            <>
                                {' '}
                                from <span style={{ color: 'var(--text-main)' }}>{latestImport.source_file}</span>
                            </>
                        )}
                        {latestImport?.imported_at && (
                            <>
                                {' '}
                                on{' '}
                                <span className="coordinate-data">
                                    {new Date(latestImport.imported_at).toLocaleDateString()}
                                </span>
                            </>
                        )}
                    </div>
                    <button onClick={() => setImporterOpen(true)} style={primaryBtn}>
                        <Upload size={14} /> Replace / add more
                    </button>
                </div>
            )}

            {(importerOpen || !hasPoints) && (
                <DesignPointsImporter
                    supabase={supabase}
                    profile={profile}
                    projectId={project.id}
                    onImported={() => onReload()}
                    onCancel={() => {
                        if (hasPoints) setImporterOpen(false);
                    }}
                    onToast={showToast}
                />
            )}

            {hasPoints && <DesignPointsTable points={designPoints} />}
        </div>
    );
}

// ── AssignmentsTab ────────────────────────────────────────────────────────
// Dispatcher for the three Assignments-tab modes. URL owns the assignment-
// selection state via ?assignment=<uuid>; local state owns the "user hit
// New assignment" flag. Detail beats builder beats list in priority.

function AssignmentsTab({ supabase, profile, project, showToast }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [builderOpen, setBuilderOpen] = useState(false);

    const assignmentIdParam = searchParams.get('assignment') || null;

    function openAssignment(id) {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('assignment', id);
            return next;
        });
    }
    function closeAssignment() {
        setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.delete('assignment');
            return next;
        });
    }

    // Detail view wins whenever the URL carries an assignment id, even
    // if the user just hit "New assignment" — mirrors how a browser-back
    // from the detail view lands the user back on the list.
    if (assignmentIdParam) {
        return (
            <AssignmentDetail
                supabase={supabase}
                profile={profile}
                assignmentId={assignmentIdParam}
                projectId={project.id}
                onToast={showToast}
                onBack={closeAssignment}
            />
        );
    }

    if (builderOpen) {
        return (
            <div>
                <button
                    type="button"
                    onClick={() => setBuilderOpen(false)}
                    style={{
                        background: 'transparent',
                        color: 'var(--text-main)',
                        border: 'none',
                        padding: '4px 0',
                        marginBottom: '14px',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '14px',
                        fontFamily: 'inherit',
                    }}
                >
                    <ArrowLeft size={14} /> Back to assignments
                </button>
                <AssignmentBuilder
                    supabase={supabase}
                    profile={profile}
                    projectId={project.id}
                    onToast={showToast}
                    onSaved={() => setBuilderOpen(false)}
                />
            </div>
        );
    }

    return (
        <AssignmentsList
            supabase={supabase}
            profile={profile}
            projectId={project.id}
            onToast={showToast}
            onOpenBuilder={() => setBuilderOpen(true)}
            onOpenAssignment={openAssignment}
        />
    );
}

function PlaceholderTab({ tab }) {
    const Icon = tab?.icon || ClipboardList;
    return (
        <div
            style={{
                padding: '48px 24px',
                textAlign: 'center',
                backgroundColor: 'var(--bg-surface)',
                border: '1px dashed var(--border-subtle)',
                borderRadius: '12px',
                color: 'var(--text-muted)',
            }}
        >
            <Icon size={28} style={{ opacity: 0.5, marginBottom: '10px' }} />
            <div style={{ fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>{tab.label}</div>
            <div style={{ fontSize: '13px' }}>{tab.stage}</div>
        </div>
    );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function PageHeader({ title, subtitle }) {
    return (
        <div style={{ marginBottom: '24px' }}>
            <h1 style={{ margin: '0 0 6px 0', fontSize: '26px', fontWeight: 700, color: 'var(--text-main)' }}>
                {title}
            </h1>
            <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>{subtitle}</div>
        </div>
    );
}

async function safe(fn) {
    try {
        const res = await fn();
        return {
            data: res?.data ?? null,
            count: res?.count ?? null,
            error: res?.error ?? null,
        };
    } catch (err) {
        console.warn('[Stakeout] query failed (non-fatal):', err);
        return { data: null, count: null, error: err };
    }
}

// ── Styles ────────────────────────────────────────────────────────────────

const pageWrap = {
    maxWidth: '1280px',
    margin: '0 auto',
    width: '100%',
};

const emptyState = {
    padding: '32px 24px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    color: 'var(--text-muted)',
};

const primaryBtn = {
    backgroundColor: 'var(--brand-teal)',
    color: '#fff',
    border: 'none',
    padding: '9px 16px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
};

// ── Toast ─────────────────────────────────────────────────────────────────
// Viewport-fixed notification, rendered once at the ProjectScoped root so
// it's visible regardless of scroll position or active tab. Owns its own
// lifecycle: success auto-dismisses after 5s, errors persist until the
// user clicks X. Both paths trigger a 200ms slide-out before calling
// onDismiss, which is the parent's setToast(null). Replace-on-new
// semantics come from the <Toast key={toast.id} .../> mount at the root.

const ENTER_MS = 300;
const EXIT_MS = 200;
const AUTO_DISMISS_MS = 5000;

function Toast({ toast, onDismiss }) {
    const [exiting, setExiting] = useState(false);
    const kind = toast.kind;
    const isSuccess = kind === 'success';
    const accent = isSuccess ? 'var(--success)' : 'var(--error)';
    const Icon = isSuccess ? CheckCircle2 : AlertCircle;

    // Success toasts queue their own exit after AUTO_DISMISS_MS. Errors
    // stay mounted until the user clicks X — no timer for them.
    useEffect(() => {
        if (kind !== 'success') return;
        const t = setTimeout(() => setExiting(true), AUTO_DISMISS_MS);
        return () => clearTimeout(t);
    }, [kind]);

    // Once the exit class is applied the slide-out animation runs; after
    // EXIT_MS we notify the parent to null out the toast state, which
    // unmounts us.
    useEffect(() => {
        if (!exiting) return;
        const t = setTimeout(() => onDismiss(), EXIT_MS);
        return () => clearTimeout(t);
    }, [exiting, onDismiss]);

    return (
        <div
            className={`stakeout-toast ${exiting ? 'exiting' : 'entering'}`}
            role="status"
            aria-live="polite"
            style={{ borderLeft: `3px solid ${accent}` }}
        >
            <Icon size={18} color={accent} />
            <span style={{ flex: 1, lineHeight: 1.5 }}>{toast.message}</span>
            <button
                onClick={() => setExiting(true)}
                aria-label="Dismiss"
                type="button"
                className="stakeout-toast-dismiss"
            >
                <X size={14} />
            </button>
        </div>
    );
}
