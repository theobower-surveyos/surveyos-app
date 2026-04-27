import React, { useEffect, useState } from 'react';

// ─── LicensedPmDashboard ─────────────────────────────────────────────
// Stage 12.1: home page for users with role='pm' (the Licensed PM
// persona). Replaces the firm-wide CommandCenter for these users at
// path "/". Scoped to projects.assigned_to = current user.
//
// Three regions, top to bottom:
//   1. Greeting bar — time-of-day + portfolio size
//   2. My Projects list — clickable rows (navigation deferred to 12.2)
//   3. Recent QC Run Summaries — up to five Stage 11.1 narrative
//      previews from runs on this PM's assignments
//
// Out of scope (per Stage 12 plan):
//   • Financial snapshot strip
//   • "Needs attention" alerts row
//   • Aggregate stats
//
// Auth/profile follows the App.jsx pattern: parent passes `profile`
// and `supabase` as props; no new context or hook introduced.

export default function LicensedPmDashboard({ supabase, profile }) {
    const [projects, setProjects] = useState([]);
    const [recentNarratives, setRecentNarratives] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        async function load() {
            const userId = profile?.id;
            if (!userId) {
                setLoading(false);
                return;
            }

            // Stage 12.1.1: select('*') instead of an enumerated column
            // list — fee/location/scheduled_date are real fields in this
            // codebase but were added at runtime (no migration in repo),
            // so naming them explicitly causes PostgREST to error out
            // and return null on Supabase instances that don't have those
            // columns yet. '*' tracks whatever the table actually exposes.
            const { data: projectData, error: projectErr } = await supabase
                .from('projects')
                .select('*')
                .eq('assigned_to', userId)
                .neq('status', 'archived')
                .order('created_at', { ascending: false });

            if (cancelled) return;
            if (projectErr) {
                console.warn('[LicensedPmDashboard] projects fetch error:', projectErr.message);
            }
            const list = projectData || [];
            setProjects(list);

            // Fetch the five most-recent run summaries across this PM's
            // projects via three targeted queries. Avoids a single deeply-
            // nested PostgREST select that's brittle to RLS shape.
            if (list.length > 0) {
                const projectIds = list.map((p) => p.id);

                const { data: assignmentData } = await supabase
                    .from('stakeout_assignments')
                    .select('id, title, project_id')
                    .in('project_id', projectIds);
                if (cancelled) return;

                const assignments = assignmentData || [];
                if (assignments.length > 0) {
                    const assignmentIds = assignments.map((a) => a.id);
                    const { data: runData } = await supabase
                        .from('stakeout_qc_runs')
                        .select('id, assignment_id, submitted_at')
                        .in('assignment_id', assignmentIds);
                    if (cancelled) return;

                    const runs = runData || [];
                    if (runs.length > 0) {
                        const runIds = runs.map((r) => r.id);
                        const { data: narrativeData } = await supabase
                            .from('stakeout_qc_narratives')
                            .select('id, body, generated_at, run_id')
                            .in('run_id', runIds)
                            .not('body', 'is', null)
                            .order('generated_at', { ascending: false })
                            .limit(5);
                        if (cancelled) return;

                        const runById = new Map(runs.map((r) => [r.id, r]));
                        const assignmentById = new Map(assignments.map((a) => [a.id, a]));
                        const projectById = new Map(list.map((p) => [p.id, p]));

                        const enriched = (narrativeData || []).map((n) => {
                            const run = runById.get(n.run_id);
                            const assignment = run ? assignmentById.get(run.assignment_id) : null;
                            const project = assignment ? projectById.get(assignment.project_id) : null;
                            return {
                                ...n,
                                run,
                                assignment,
                                project,
                            };
                        });
                        setRecentNarratives(enriched);
                    }
                }
            }

            setLoading(false);
        }
        load();
        return () => { cancelled = true; };
    }, [supabase, profile?.id]);

    const greetingName = profile?.first_name || 'there';
    const activeCount = projects.filter(
        (p) => p.status !== 'completed' && p.status !== 'archived',
    ).length;

    const hour = new Date().getHours();
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    return (
        <div style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto' }}>
            <div style={{
                background: 'linear-gradient(135deg, var(--brand-teal) 0%, rgba(15, 110, 86, 0.7) 100%)',
                padding: '24px 28px',
                borderRadius: '12px',
                marginBottom: '24px',
                color: '#fff',
            }}>
                <div style={{ fontSize: '24px', fontWeight: 600, marginBottom: '6px' }}>
                    {timeGreeting}, {greetingName}.
                </div>
                <div style={{ fontSize: '14px', opacity: 0.85 }}>
                    {activeCount} active {activeCount === 1 ? 'project' : 'projects'} in your portfolio.
                </div>
            </div>

            {loading && (
                <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading…
                </div>
            )}

            {!loading && projects.length === 0 && (
                <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: '12px',
                    color: 'var(--text-muted)',
                }}>
                    No projects assigned to you yet. Check with your firm owner.
                </div>
            )}

            {!loading && projects.length > 0 && (
                <>
                    <SectionLabel>My Projects</SectionLabel>
                    <div style={{
                        background: 'var(--bg-surface)',
                        border: '1px solid var(--border-subtle)',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        marginBottom: '24px',
                    }}>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: '2fr 1fr 1fr 1fr',
                            padding: '12px 16px',
                            borderBottom: '1px solid var(--border-subtle)',
                            fontSize: '11px',
                            letterSpacing: '0.5px',
                            textTransform: 'uppercase',
                            color: 'var(--text-muted)',
                            fontWeight: 600,
                        }}>
                            <div>Project</div>
                            <div>Status</div>
                            <div>Scheduled</div>
                            <div>Fee</div>
                        </div>
                        {projects.map((project) => (
                            <ProjectRow key={project.id} project={project} />
                        ))}
                    </div>

                    {recentNarratives.length > 0 && (
                        <>
                            <SectionLabel>Recent QC Run Summaries</SectionLabel>
                            {recentNarratives.map((narrative) => (
                                <NarrativeFeedRow key={narrative.id} narrative={narrative} />
                            ))}
                        </>
                    )}
                </>
            )}
        </div>
    );
}

function SectionLabel({ children }) {
    return (
        <div style={{
            fontSize: '11px',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            marginBottom: '12px',
            fontWeight: 600,
        }}>
            {children}
        </div>
    );
}

function ProjectRow({ project }) {
    const statusColor = {
        pending: 'var(--brand-amber)',
        scheduled: 'var(--brand-amber)',
        active: 'var(--brand-teal-light)',
        in_progress: 'var(--brand-teal-light)',
        completed: 'var(--success)',
        archived: 'var(--text-muted)',
    }[project.status] || 'var(--text-muted)';

    return (
        <div
            style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr',
                padding: '14px 16px',
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: '14px',
                color: 'var(--text-main)',
                cursor: 'pointer',
                transition: 'background 120ms',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(15, 110, 86, 0.06)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            // TODO 12.2: navigate to project detail
        >
            <div>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{project.project_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {project.location || '—'}
                </div>
            </div>
            <div>
                <span style={{
                    display: 'inline-block',
                    padding: '2px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 500,
                    background: 'rgba(255,255,255,0.04)',
                    color: statusColor,
                    border: `1px solid ${statusColor}`,
                    textTransform: 'capitalize',
                }}>
                    {(project.status || 'unknown').replace('_', ' ')}
                </span>
            </div>
            <div style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                {project.scheduled_date || '—'}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: '13px' }}>
                {project.fee ? `$${Number(project.fee).toLocaleString()}` : '—'}
            </div>
        </div>
    );
}

function NarrativeFeedRow({ narrative }) {
    const assignmentTitle = narrative.assignment?.title || 'Assignment';
    const projectName = narrative.project?.project_name;
    const generatedAt = narrative.generated_at;
    const body = narrative.body || '';
    const preview = body.length > 240 ? `${body.slice(0, 240)}…` : body;

    return (
        <div style={{
            padding: '14px 16px',
            background: 'rgba(15, 110, 86, 0.04)',
            border: '1px solid var(--border-subtle)',
            borderLeft: '4px solid var(--brand-teal)',
            borderRadius: '12px',
            marginBottom: '10px',
            color: 'var(--text-main)',
        }}>
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: '6px',
                gap: '12px',
                flexWrap: 'wrap',
            }}>
                <div style={{ fontSize: '13px', fontWeight: 600 }}>
                    {assignmentTitle}
                    {projectName && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400, marginLeft: '8px' }}>
                            · {projectName}
                        </span>
                    )}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    {new Date(generatedAt).toLocaleString()}
                </div>
            </div>
            <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {preview}
            </div>
        </div>
    );
}
