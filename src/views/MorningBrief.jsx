import { useMemo, useState } from 'react';
import { Sun, Users, ArrowRight, MapPin, Calendar, Inbox, ClipboardCheck, ChevronRight } from 'lucide-react';
import { DispatchProjectDrawer } from './DispatchBoard';

// ─── Design tokens (mirror DispatchBoard) ────────────────────────────
const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const SURFACE = {
  base:   'var(--bg-dark)',
  panel:  'var(--bg-surface)',
  card:   'color-mix(in srgb, var(--bg-surface) 96%, white)',
};
const HAIRLINE = 'rgba(255,255,255,0.06)';
const ACCENT = {
  action:    'var(--brand-teal)',
  today:     'var(--brand-teal-light)',
  attention: 'var(--brand-amber)',
};

// ─── Date helpers ────────────────────────────────────────────────────
const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const isDateInSpan = (dayISO, startISO, endISO) => {
  if (!dayISO || !startISO) return false;
  const s = startISO.slice(0, 10);
  const e = (endISO || startISO).slice(0, 10);
  return dayISO >= s && dayISO <= e;
};
// projects.assigned_to is the Party Chief, NOT the Lead PM.
// For Licensed PM ownership, use projects.lead_pm_id.
const getCrewId = (project) => {
  const a = project?.assigned_to;
  if (!a) return null;
  if (typeof a === 'string') return a;
  if (typeof a === 'object') return a.id || null;
  return null;
};

// ═══════════════════════════════════════════════════════════════════
// MORNING BRIEF — 5 AM deployment sheet
// ═══════════════════════════════════════════════════════════════════
// The first thing a PM sees when they open the app at 5 AM.
// It answers exactly one question: "Who is going where today?"
//
// Shows each field crew as a row with their job(s) for today. Flags
// PTO. Shows holding queue count with a deploy action. Primary CTA
// routes straight to the dispatch board — not the command center.
// ═══════════════════════════════════════════════════════════════════
export default function MorningBrief({ profile, projects = [], teamMembers = [], supabase, onProjectUpdate, onProceed, onGoToDispatch }) {
  // Local drawer state — tapping a Ready-for-Review card opens the drawer
  // inline so the PM can approve without leaving the Morning Brief.
  const [reviewDrawerProject, setReviewDrawerProject] = useState(null);
  const today = useMemo(() => new Date(), []);
  const todayISO = toISODate(today);

  const hour = today.getHours();
  const greeting =
    hour < 12 ? 'Good morning' :
    hour < 17 ? 'Good afternoon' :
    'Good evening';
  const dateLabel = today.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  });

  // Field roles — who shows up in the deployments list.
  const fieldCrews = useMemo(() =>
    (teamMembers || []).filter(m =>
      ['field_crew', 'technician', 'party_chief'].includes((m.role || '').toLowerCase().trim())
    ),
    [teamMembers]
  );

  // Active projects only (no archived, no completed).
  const activeProjects = useMemo(() =>
    (projects || []).filter(p => p.status !== 'archived' && p.status !== 'completed'),
    [projects]
  );

  // Projects scheduled for today (respects multi-day spans).
  const projectsToday = useMemo(() =>
    activeProjects.filter(p =>
      p.scheduled_date && isDateInSpan(todayISO, p.scheduled_date, p.scheduled_end_date)
    ),
    [activeProjects, todayISO]
  );

  // Holding queue — scheduled date or crew missing.
  const holdingQueue = useMemo(() =>
    activeProjects.filter(p => !getCrewId(p) || !p.scheduled_date),
    [activeProjects]
  );

  // Ready for Review — projects completed within the last 48h that have
  // not been reviewed yet by the PM. Rolls a 2-day window so a PM who
  // misses a morning still sees yesterday's work at the next login.
  const reviewQueue = useMemo(() => {
    const cutoffMs = Date.now() - 48 * 60 * 60 * 1000;
    return (projects || []).filter(p => {
      if (p.status === 'archived') return false;
      if (!p.completed_at) return false;
      if (p.reviewed_at) return false;
      const ct = new Date(p.completed_at).getTime();
      return ct >= cutoffMs;
    }).sort((a, b) =>
      new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
    );
  }, [projects]);

  // Map crew uuid → name for rendering on review cards.
  const crewNameById = useMemo(() => {
    const map = new Map();
    for (const m of teamMembers || []) {
      map.set(m.id, `${m.first_name || ''} ${m.last_name || ''}`.trim());
    }
    return map;
  }, [teamMembers]);

  // Build a per-crew deployment map for today.
  const deploymentsByCrew = useMemo(() => {
    const map = new Map();
    for (const crew of fieldCrews) map.set(crew.id, []);
    for (const p of projectsToday) {
      const lead = getCrewId(p);
      if (lead && map.has(lead)) map.get(lead).push(p);
    }
    return map;
  }, [fieldCrews, projectsToday]);

  // Summary counts for the header strip.
  const deployedCount = useMemo(() =>
    fieldCrews.filter(c => (deploymentsByCrew.get(c.id) || []).length > 0).length,
    [fieldCrews, deploymentsByCrew]
  );

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: SURFACE.base,
      fontFamily: FONT,
      padding: 'clamp(32px, 8vh, 80px) clamp(20px, 5vw, 60px)',
      color: 'var(--text-main)',
      overflowX: 'hidden',
    }}>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        {/* ─── HEADER ──────────────────────────────── */}
        <header style={{ marginBottom: '40px', animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) both' }}>
          <Sun size={28} color={ACCENT.attention} strokeWidth={1.6} style={{ marginBottom: '14px', display: 'block' }} />
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 2.8rem)',
            fontWeight: '800',
            letterSpacing: '-0.03em',
            color: 'var(--text-main)',
            margin: '0 0 6px 0',
            lineHeight: 1.1,
          }}>
            {greeting}, {profile?.first_name || 'Operator'}.
          </h1>
          <p style={{
            fontSize: 'clamp(0.95rem, 2vw, 1.15rem)',
            color: 'var(--text-muted)',
            fontWeight: '500',
            margin: 0,
            letterSpacing: '-0.01em',
          }}>
            {dateLabel}
          </p>
        </header>

        {/* ─── AT-A-GLANCE STRIP ───────────────────── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px',
          marginBottom: '32px',
          animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.05s both',
        }}>
          <SummaryTile label="Deployed"    value={deployedCount}      suffix={`/ ${fieldCrews.length} crews`} accent={ACCENT.action} />
          <SummaryTile label="Jobs today"  value={projectsToday.length} accent={ACCENT.today} />
          <SummaryTile label="In queue"    value={holdingQueue.length}  accent={ACCENT.attention} muted={holdingQueue.length === 0} />
        </div>

        {/* ─── DEPLOYMENTS — the core of the brief ──── */}
        <section style={{ marginBottom: '28px', animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '14px',
            fontSize: '0.68rem',
            fontWeight: '700',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}>
            <Users size={14} /> Deployments Today
          </div>

          <div style={{
            backgroundColor: SURFACE.panel,
            border: `1px solid ${HAIRLINE}`,
            borderRadius: '14px',
            overflow: 'hidden',
          }}>
            {fieldCrews.length === 0 ? (
              <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                No field crews on roster.
              </div>
            ) : (
              fieldCrews.map((crew, i) => {
                const jobs = deploymentsByCrew.get(crew.id) || [];
                return (
                  <CrewRow
                    key={crew.id}
                    crew={crew}
                    jobs={jobs}
                    isLast={i === fieldCrews.length - 1}
                  />
                );
              })
            )}
          </div>
        </section>

        {/* ─── READY FOR REVIEW (PM approval inbox from the last 48h) ─── */}
        {reviewQueue.length > 0 && (
          <section style={{ marginBottom: '28px', animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.12s both' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '14px',
              fontSize: '0.68rem',
              fontWeight: '700',
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}>
              <ClipboardCheck size={14} /> Ready for Review
            </div>
            <div style={{
              backgroundColor: SURFACE.panel,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '14px',
              overflow: 'hidden',
            }}>
              {reviewQueue.map((p, i) => {
                const lead = crewNameById.get(getCrewId(p)) || 'Crew';
                // Rounded hours for display (matches end-of-day card convention)
                let hours = null;
                if (p.started_at && p.completed_at) {
                  const ms = new Date(p.completed_at).getTime() - new Date(p.started_at).getTime();
                  if (ms > 0) hours = Math.max(0.25, Math.round((ms / 3600000) * 2) / 2);
                }
                // Count photos + notes as evidence indicators (photos count
                // is not available client-side without a fetch, so just show
                // "Notes" if present and let the drawer load photos).
                const hasNotes = !!(p.notes && p.notes.trim());
                return (
                  <button
                    key={p.id}
                    onClick={() => setReviewDrawerProject(p)}
                    style={{
                      width: '100%',
                      padding: '16px 20px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: i === reviewQueue.length - 1 ? 'none' : `1px solid ${HAIRLINE}`,
                      color: 'var(--text-main)',
                      fontFamily: FONT,
                      cursor: 'pointer',
                      textAlign: 'left',
                      transition: 'background-color 150ms ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                  >
                    {/* Green completion badge */}
                    <div style={{
                      width: '42px',
                      height: '42px',
                      flexShrink: 0,
                      borderRadius: '50%',
                      backgroundColor: 'rgba(52, 199, 89, 0.14)',
                      border: `1.5px solid var(--success)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--success)',
                      fontWeight: '800',
                      fontSize: '1.1rem',
                    }}>
                      ✓
                    </div>

                    {/* Name + meta */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '1rem',
                        fontWeight: '700',
                        color: 'var(--text-main)',
                        letterSpacing: '-0.01em',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {p.project_name}
                      </div>
                      <div style={{
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)',
                        marginTop: '3px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                      }}>
                        <span>{lead}</span>
                        {hours !== null && (
                          <>
                            <span style={{ opacity: 0.5 }}>·</span>
                            <span>{hours} hrs</span>
                          </>
                        )}
                        {hasNotes && (
                          <>
                            <span style={{ opacity: 0.5 }}>·</span>
                            <span>Field notes</span>
                          </>
                        )}
                      </div>
                    </div>

                    <ChevronRight size={18} color="var(--text-muted)" />
                  </button>
                );
              })}
            </div>
            <div style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              marginTop: '10px',
              textAlign: 'center',
              letterSpacing: '-0.01em',
            }}>
              {reviewQueue.length} job{reviewQueue.length !== 1 ? 's' : ''} awaiting approval
            </div>
          </section>
        )}

        {/* ─── HOLDING QUEUE CALLOUT (only if non-empty) ─── */}
        {holdingQueue.length > 0 && (
          <section style={{
            marginBottom: '32px',
            padding: '16px 20px',
            backgroundColor: 'var(--brand-amber-muted)',
            border: `1px solid rgba(212, 145, 42, 0.35)`,
            borderRadius: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.15s both',
          }}>
            <div style={{
              width: '40px', height: '40px', flexShrink: 0,
              borderRadius: '12px',
              backgroundColor: 'rgba(212, 145, 42, 0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Inbox size={20} color={ACCENT.attention} strokeWidth={2} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                {holdingQueue.length} project{holdingQueue.length !== 1 ? 's' : ''} in the holding queue
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                Needs scheduling or crew assignment.
              </div>
            </div>
          </section>
        )}

        {/* ─── PRIMARY CTA ─── */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          animation: 'fadeUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
        }}>
          <button
            onClick={onGoToDispatch || onProceed}
            style={{
              width: '100%',
              padding: '18px 28px',
              borderRadius: '14px',
              border: 'none',
              backgroundColor: ACCENT.action,
              color: 'var(--text-main)',
              fontSize: '1.02rem',
              fontWeight: '700',
              letterSpacing: '-0.01em',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              fontFamily: FONT,
              transition: 'transform 0.15s ease, background-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--brand-teal-light)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = ACCENT.action;
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Open Dispatch Board
            <ArrowRight size={18} strokeWidth={2.5} />
          </button>
          <button
            onClick={onProceed}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: `1px solid ${HAIRLINE}`,
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: FONT,
              letterSpacing: '-0.01em',
            }}
          >
            Go to Command Center instead
          </button>
        </div>
      </div>

      {/* Inline review drawer — opened from the Ready for Review cards.
          Auto-enters review mode because the project has completed_at set. */}
      <DispatchProjectDrawer
        project={reviewDrawerProject}
        crewLookup={teamMembers || []}
        allProjects={projects || []}
        displayCrews={(teamMembers || []).filter(m => ['field_crew','technician','party_chief'].includes((m.role || '').toLowerCase().trim()))}
        supabase={supabase}
        profile={profile}
        canEdit={true}
        isMobile={false}
        onProjectUpdate={(id, patch) => {
          setReviewDrawerProject(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
          onProjectUpdate && onProjectUpdate(id, patch);
          if (supabase) {
            supabase.from('projects').update(patch).eq('id', id).then(({ error }) => {
              if (error) {
                console.error('[MorningBrief] patch failed', { id, patch, error });
                alert(`Save failed: ${error.message || 'unknown error'}`);
              }
            });
          }
        }}
        onClose={() => setReviewDrawerProject(null)}
      />
    </div>
  );
}

// ─── Summary tile ──────────────────────────────────────
function SummaryTile({ label, value, suffix, accent, muted = false }) {
  return (
    <div style={{
      backgroundColor: SURFACE.panel,
      border: `1px solid ${HAIRLINE}`,
      borderRadius: '12px',
      padding: '16px 18px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    }}>
      <div style={{
        fontSize: '0.62rem',
        fontWeight: '700',
        letterSpacing: '1.5px',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        {label}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '8px',
        minWidth: 0,
      }}>
        <div style={{
          fontSize: '2.2rem',
          fontWeight: '800',
          letterSpacing: '-0.04em',
          color: muted ? 'var(--text-muted)' : accent,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {value}
        </div>
        {suffix && (
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '500' }}>
            {suffix}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Crew row ──────────────────────────────────────────
function CrewRow({ crew, jobs, isLast }) {
  const initial = (crew.first_name || '?').charAt(0).toUpperCase();
  const name = `${crew.first_name || ''} ${crew.last_name || ''}`.trim();
  const role = (crew.role || '').replace('_', ' ');
  const hasJobs = jobs.length > 0;

  return (
    <div style={{
      padding: '18px 20px',
      display: 'flex',
      gap: '14px',
      alignItems: 'flex-start',
      borderBottom: isLast ? 'none' : `1px solid ${HAIRLINE}`,
    }}>
      {/* Avatar */}
      <div style={{
        width: '42px',
        height: '42px',
        flexShrink: 0,
        borderRadius: '50%',
        backgroundColor: hasJobs ? 'rgba(26, 107, 107, 0.18)' : 'rgba(148, 163, 184, 0.12)',
        color: hasJobs ? 'var(--brand-teal-light)' : 'var(--text-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: '700',
        fontSize: '1rem',
        letterSpacing: '-0.01em',
        border: hasJobs ? `1.5px solid rgba(26, 107, 107, 0.4)` : 'none',
      }}>
        {initial}
      </div>

      {/* Crew name + jobs */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: hasJobs ? '10px' : '2px' }}>
          <div style={{
            fontSize: '1rem',
            fontWeight: '700',
            color: 'var(--text-main)',
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {name}
          </div>
          <div style={{
            fontSize: '0.62rem',
            fontWeight: '700',
            letterSpacing: '1.2px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            flexShrink: 0,
          }}>
            {role}
          </div>
        </div>

        {hasJobs ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {jobs.map(p => (
              <JobLine key={p.id} project={p} />
            ))}
          </div>
        ) : (
          <div style={{
            fontSize: '0.82rem',
            color: 'var(--text-muted)',
            fontStyle: 'italic',
            marginTop: '4px',
          }}>
            No jobs scheduled
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Single job line inside a crew row ─────────────────
function JobLine({ project }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '10px 12px',
      backgroundColor: SURFACE.card,
      border: `1px solid ${HAIRLINE}`,
      borderRadius: '8px',
      minWidth: 0,
    }}>
      <Calendar size={13} color="var(--text-muted)" style={{ flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{
          fontSize: '0.88rem',
          fontWeight: '600',
          color: 'var(--text-main)',
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {project.project_name}
        </div>
        {project.location && (
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--text-muted)',
            marginTop: '2px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            <MapPin size={10} /> {project.location}
          </div>
        )}
      </div>
    </div>
  );
}
