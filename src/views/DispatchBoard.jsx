import React, { useState, useMemo, useEffect } from 'react';
import { AlertCircle, MapPin, ChevronLeft, ChevronRight, X, FileText, User, CheckCircle2, Receipt, Navigation, Play, Camera } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  DragOverlay,
} from '@dnd-kit/core';
import {
  buildEquipmentOccupancy,
  findConflictedProjects,
  conflictsForProject,
  wouldCreateConflict,
} from '../lib/dispatchConflicts';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";

// ─── SURFACE ELEVATION ──────────────────────────────────────────────────────
// One rhythm: each tier is +0.04 white over the previous. No ad-hoc shades.
const SURFACE = {
  base:   'var(--bg-dark)',                                              // Tier 0 — app + matrix grid
  panel:  'var(--bg-surface)',                                           // Tier 1 — sidebar, header, drawer
  card:   'color-mix(in srgb, var(--bg-surface) 96%, white)',            // Tier 2 — card resting
  lifted: 'color-mix(in srgb, var(--bg-surface) 92%, white)',            // Tier 3 — card hover, drag target
  slot:   'rgba(255,255,255,0.015)',                                     // Tier 0.5 — empty day cell ("slot, not void")
};
const HAIRLINE = 'rgba(255,255,255,0.06)';
const EDGE     = 'rgba(255,255,255,0.10)';

// ─── ACCENT SEMANTICS ───────────────────────────────────────────────────────
// Each accent has exactly one job. Do not overload.
const ACCENT = {
  action:  'var(--brand-teal)',         // user can do something here
  today:   'var(--brand-teal-light)',   // temporal marker — never an action
  attention: 'var(--brand-amber)',      // needs the operator's eye
};
const TODAY_TINT = 'rgba(26, 107, 107, 0.06)';   // teal-light @ 6%

// ─── Media query hook ──────────────────────────────────────────────
// Dispatch board branches to a mobile layout below 768px.
function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia(query);
    const onChange = (e) => setMatches(e.matches);
    setMatches(mql.matches);
    // Safari <14 uses addListener/removeListener, modern browsers use addEventListener
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else if (mql.addListener) mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else if (mql.removeListener) mql.removeListener(onChange);
    };
  }, [query]);
  return matches;
}

// YYYY-MM-DD in local time (matches how scheduled_date is stored)
const toISODate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// ─── Multi-day span helpers ─────────────────────────────────────────
// Parse 'YYYY-MM-DD' into a local-midnight Date (no timezone drift).
const parseISODate = (iso) => {
  if (!iso) return null;
  const s = typeof iso === 'string' ? iso.slice(0, 10) : iso;
  return new Date(s + 'T00:00:00');
};

// Inclusive: a project with start Mon and end Wed spans Mon, Tue, Wed.
// Sundays are non-working days and are not rendered in the matrix, but the
// calendar date math still counts calendar days.
const isDateInSpan = (day, startISO, endISO) => {
  if (!day || !startISO) return false;
  const dayIso = toISODate(day);
  const start = startISO.slice(0, 10);
  const end = (endISO || startISO).slice(0, 10);
  return dayIso >= start && dayIso <= end;
};

// Position of `day` within the project's WORKING-day span (Sundays skipped).
// Returns { index: 1-based, total: working-day count } or null if not in span.
const dayIndexInSpan = (day, startISO, endISO) => {
  if (!day || !startISO) return null;
  const start = parseISODate(startISO);
  const end = parseISODate(endISO || startISO);
  if (!start || !end) return null;
  if (day < start || day > end) return null;
  let total = 0;
  let index = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (cursor.getDay() !== 0) { // skip Sundays
      total += 1;
      if (toISODate(cursor) === toISODate(day)) index = total;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return { index, total };
};

// Given a start date and a desired working-day count, return the ISO end date
// that makes the span exactly N working days long. Sundays are skipped.
const computeEndFromWorkingDays = (startISO, workingDays) => {
  if (!startISO || !workingDays || workingDays < 1) return null;
  const start = parseISODate(startISO);
  if (!start) return null;
  const cursor = new Date(start);
  let counted = 0;
  // Count the start day if it's a working day; otherwise advance.
  while (cursor.getDay() === 0) cursor.setDate(cursor.getDate() + 1);
  while (true) {
    if (cursor.getDay() !== 0) counted += 1;
    if (counted >= workingDays) break;
    cursor.setDate(cursor.getDate() + 1);
  }
  return toISODate(cursor);
};

// Shift a span by `offsetDays` calendar days, preserving the original
// calendar-day length. Used when dragging a multi-day project to a new day.
const shiftSpan = (startISO, endISO, newStartISO) => {
  const start = parseISODate(startISO);
  const end = parseISODate(endISO || startISO);
  const newStart = parseISODate(newStartISO);
  if (!start || !end || !newStart) return { start: newStartISO, end: newStartISO };
  const lengthMs = end.getTime() - start.getTime();
  const newEnd = new Date(newStart.getTime() + lengthMs);
  return { start: toISODate(newStart), end: toISODate(newEnd) };
};

const getCrewId = (project) => {
  const a = project?.assigned_to;
  if (!a) return null;
  if (typeof a === 'string') return a;
  if (typeof a === 'object') return a.id || null;
  return null;
};

const EDITOR_ROLES = ['admin', 'owner', 'pm'];

export default function DispatchBoard({ supabase, profile, projects = [], teamMembers = [], onProjectUpdate }) {
  const canEdit = EDITOR_ROLES.includes((profile?.role || '').toLowerCase().trim());
  const [weekOffset, setWeekOffset] = useState(0);
  const [viewMode, setViewMode] = useState('week'); // 'week' | 'month'
  const [localProjects, setLocalProjects] = useState(projects);
  const [activeProject, setActiveProject] = useState(null);
  const [drawerProject, setDrawerProject] = useState(null);
  const [unavailability, setUnavailability] = useState([]);
  const [ptoPopover, setPtoPopover] = useState(null); // { crewId, anchorDay, x, y, existingRow? }

  // Mobile branch lives below 768px. Tablets and desktops keep the grid.
  const isMobile = useMediaQuery('(max-width: 768px)');

  // Mobile UI state — the day the user is focused on and the active segment.
  const [mobileSelectedDay, setMobileSelectedDay] = useState(() => toISODate(new Date()));
  const [mobileSegment, setMobileSegment] = useState('crews'); // 'crews' | 'queue'

  // ─── PTO fetch + realtime ─────────────────────────────────────────────
  // fetchUnavailability is lifted to component scope so the PTO popover can
  // trigger a refetch directly after save/delete — realtime is belt-and-
  // suspenders, this is the fast path that doesn't depend on the publication.
  const fetchUnavailability = React.useCallback(async () => {
    if (!supabase || !profile?.firm_id) return;
    const { data, error } = await supabase
      .from('crew_unavailability')
      .select('*')
      .eq('firm_id', profile.firm_id);
    if (!error && data) setUnavailability(data);
    else if (error) console.error('[DispatchBoard] PTO fetch error:', error);
  }, [supabase, profile?.firm_id]);

  React.useEffect(() => {
    if (!supabase || !profile?.firm_id) return;
    fetchUnavailability();
    const chan = supabase.channel('crew-pto-' + profile.firm_id)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'crew_unavailability', filter: `firm_id=eq.${profile.firm_id}` },
        () => fetchUnavailability())
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [supabase, profile?.firm_id, fetchUnavailability]);

  // Per-user ISO-date lookup for O(1) cell checks.
  // Map<userId, Map<isoDate, row>>  — we keep the row reference so edit/delete
  // popovers can identify which row to modify without a second query.
  const ptoLookup = useMemo(() => {
    const map = new Map();
    for (const row of unavailability) {
      if (!row.user_id || !row.start_date || !row.end_date) continue;
      let inner = map.get(row.user_id);
      if (!inner) { inner = new Map(); map.set(row.user_id, inner); }
      // Expand [start, end] inclusive into ISO-date keys.
      const start = new Date(row.start_date + 'T00:00:00');
      const end = new Date(row.end_date + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        inner.set(toISODate(d), row);
      }
    }
    return map;
  }, [unavailability]);

  const isCrewPTO = (crewId, day) => {
    if (!crewId || !day) return null;
    return ptoLookup.get(crewId)?.get(toISODate(day)) || null;
  };

  // ─── Equipment fetch (for the drawer's multi-select) ──────────────────
  const [equipmentList, setEquipmentList] = useState([]);
  React.useEffect(() => {
    if (!supabase || !profile?.firm_id) return;
    let cancelled = false;
    supabase
      .from('equipment')
      .select('id, model, category, serial_number, status')
      .eq('firm_id', profile.firm_id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('[DispatchBoard] equipment fetch error:', error); return; }
        if (data) setEquipmentList(data);
      });
    return () => { cancelled = true; };
  }, [supabase, profile?.firm_id]);

  // Merge parent updates without clobbering optimistic local assignments.
  // Any of these fields, if locally newer, is preserved across a refetch.
  const OPTIMISTIC_FIELDS = ['assigned_to', 'scheduled_date', 'scheduled_end_date', 'assigned_crew', 'required_equipment'];
  React.useEffect(() => {
    setLocalProjects(prev => {
      const prevById = new Map(prev.map(p => [p.id, p]));
      return projects.map(p => {
        const local = prevById.get(p.id);
        if (!local) return p;
        const patch = {};
        for (const field of OPTIMISTIC_FIELDS) {
          // shallow JSON compare is sufficient for strings / uuids / arrays
          const lv = JSON.stringify(local[field]);
          const rv = JSON.stringify(p[field]);
          if (local[field] !== undefined && lv !== rv) {
            patch[field] = local[field];
          }
        }
        return Object.keys(patch).length ? { ...p, ...patch } : p;
      });
    });
  }, [projects]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // Week mode: one block of [Mon..Sat].
  // Month mode: a vertical stack of [Mon..Sat] week blocks for the current month,
  // with `null` placeholders for days outside the month so columns stay aligned.
  // Each week is always exactly 6 slots — the SAME 6-column grid as week view, so
  // the entire month renders without horizontal scrolling.
  const calendarWeeks = useMemo(() => {
    const today = new Date();

    if (viewMode === 'month') {
      const target = new Date(today.getFullYear(), today.getMonth() + weekOffset, 1);
      const year = target.getFullYear();
      const month = target.getMonth();
      const lastDay = new Date(year, month + 1, 0).getDate();

      const weeks = [];
      let week = Array(6).fill(null);    // Mon..Sat
      let hasContent = false;

      for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month, d);
        const dow = date.getDay();       // 0=Sun..6=Sat
        if (dow === 0) continue;         // skip Sundays — Mon-Sat working week
        week[dow - 1] = date;
        hasContent = true;
        if (dow === 6) {
          weeks.push(week);
          week = Array(6).fill(null);
          hasContent = false;
        }
      }
      if (hasContent) weeks.push(week);
      return weeks;
    }

    // Week mode — anchor to Monday of the current week.
    // FIX: when today is Sunday (dayOfWeek === 0), advance to the upcoming
    // Monday instead of rolling back 6 days into the previous week.
    const dayOfWeek = today.getDay();
    const mondayDate = dayOfWeek === 0
      ? today.getDate() + 1                       // Sun → next Mon
      : today.getDate() - dayOfWeek + 1;          // Mon-Sat → this week's Mon
    const monday = new Date(today.getFullYear(), today.getMonth(), mondayDate);
    monday.setDate(monday.getDate() + (weekOffset * 7));

    const days = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push(d);
    }
    return [days];
  }, [weekOffset, viewMode]);

  const todayISO = toISODate(new Date());

  // Single grid template for BOTH modes — month view stacks week blocks vertically
  // instead of growing horizontally, so no overflow scroll is needed.
  const gridTemplate = `180px repeat(6, minmax(0, 1fr))`;
  const matrixMinWidth = 780;

  // Compact cell sizing in month mode keeps 4-5 stacked weeks visible without scroll.
  const isMonth = viewMode === 'month';
  const cellMinHeight = isMonth ? 84 : 120;
  const cellPadding = isMonth ? '8px' : '10px';

  const navLabel = isMonth
    ? (calendarWeeks[0]?.find(Boolean)
        ? calendarWeeks[0].find(Boolean).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
        : '')
    : `Week of ${calendarWeeks[0][0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  function toggleViewMode() {
    setWeekOffset(0);
    setViewMode(v => (v === 'week' ? 'month' : 'week'));
  }

  const activeProjects = localProjects.filter(p => p.status !== 'completed' && p.status !== 'archived');

  // Holding queue: anything not assigned to BOTH a crew AND a date
  const holdingQueue = activeProjects.filter(p => !getCrewId(p) || !p.scheduled_date);

  let displayCrews = teamMembers.filter(m => ['field_crew', 'technician'].includes((m.role || '').toLowerCase()));
  if (displayCrews.length === 0) displayCrews = teamMembers.filter(m => m.role !== 'admin' && m.role !== 'owner');

  const projectsForCell = (crewId, day) =>
    activeProjects.filter(p =>
      getCrewId(p) === crewId
      && isDateInSpan(day, p.scheduled_date, p.scheduled_end_date)
    );

  // ─── Equipment conflict computation ──────────────────────────────
  // Full occupancy (used for resting-state conflict badges).
  const equipmentOccupancy = useMemo(
    () => buildEquipmentOccupancy(activeProjects),
    [activeProjects]
  );
  const conflictedIds = useMemo(
    () => findConflictedProjects(equipmentOccupancy),
    [equipmentOccupancy]
  );

  // Occupancy MINUS the currently-dragged project, so drag-over previews
  // don't count the project's own cells against itself.
  const occupancyForDragPreview = useMemo(() => {
    if (!activeProject) return equipmentOccupancy;
    return buildEquipmentOccupancy(
      activeProjects.filter(p => p.id !== activeProject.id)
    );
  }, [activeProjects, activeProject, equipmentOccupancy]);

  // Shared persist helper — used by both the drag handler and the drawer.
  // Trusts optimistic state; only surfaces errors via alert so silent
  // failures can't hide in the console.
  async function persistProjectPatch(projectId, patch) {
    if (!supabase) return { error: new Error('no supabase client') };
    const { error } = await supabase
      .from('projects')
      .update(patch)
      .eq('id', projectId);
    if (error) {
      console.error('[DispatchBoard] patch failed', { projectId, patch, error });
      alert(`Save failed: ${error.message || error.details || 'unknown error'}`);
      return { error };
    }
    onProjectUpdate && onProjectUpdate(projectId, patch);
    return { ok: true };
  }

  async function persistAssignment(projectId, patch) {
    return persistProjectPatch(projectId, patch);
  }

  function handleDragStart(event) {
    if (!canEdit) return;
    const id = event.active?.id;
    const proj = localProjects.find(p => p.id === id);
    setActiveProject(proj || null);
  }

  function handleDragEnd(event) {
    setActiveProject(null);
    if (!canEdit) return;
    const { active, over } = event;
    if (!over) return;
    const projectId = active.id;
    const dropData = over.data?.current;
    if (!dropData) return;

    let patch = null;

    if (dropData.type === 'cell') {
      const crew = displayCrews.find(c => c.id === dropData.crewId);
      const day = dropData.day;
      if (!crew || !day) return;
      // Block drops on days when the crew member is on PTO.
      // (The DayCell is also useDroppable({ disabled: true }) on PTO days,
      // so this is belt-and-suspenders in case the guard slips.)
      if (isCrewPTO(crew.id, day)) {
        console.warn('[DispatchBoard] drop rejected — crew member is on PTO');
        return;
      }
      // Date moves keep the existing crew. Lead reassignments reset the
      // supporting crew to just the new lead — editing supporting crew is an
      // intentional action in the drawer, not a side effect of a drag.
      // Multi-day spans shift by preserving the calendar-day length: the
      // drop target becomes the new start, and the new end is computed so
      // the whole range slides as one unit.
      const project = localProjects.find(x => x.id === projectId);
      const oldLeadId = getCrewId(project);
      const isLeadChange = oldLeadId !== crew.id;
      const { start: newStart, end: newEnd } = shiftSpan(
        project?.scheduled_date,
        project?.scheduled_end_date,
        toISODate(day)
      );
      patch = {
        assigned_to: crew.id,
        scheduled_date: newStart,
        scheduled_end_date: project?.scheduled_end_date ? newEnd : null,
      };
      if (isLeadChange) {
        patch.assigned_crew = [crew.id];
      }
    } else if (dropData.type === 'queue') {
      // Drag back to holding queue → unschedule (clear the whole span)
      patch = { assigned_to: null, scheduled_date: null, scheduled_end_date: null };
    } else {
      return;
    }

    // Optimistic local update
    setLocalProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...patch } : p));
    persistAssignment(projectId, patch);
  }

  // ───────────────────────────────────────────────────────────────────
  // MOBILE BRANCH — dedicated layout for phones.
  // Shares every bit of state above (localProjects, drawerProject, ptoLookup,
  // equipmentOccupancy, fetchUnavailability, etc.) via props passed straight
  // through. The desktop tree below is never mounted on mobile, so there's no
  // DndContext competing with scroll gestures.
  // ───────────────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <>
        <MobileDispatchBoard
          displayCrews={displayCrews}
          teamMembers={teamMembers}
          holdingQueue={holdingQueue}
          projectsForCell={projectsForCell}
          isCrewPTO={isCrewPTO}
          conflictedIds={conflictedIds}
          calendarWeeks={calendarWeeks}
          setWeekOffset={setWeekOffset}
          navLabel={navLabel}
          todayISO={todayISO}
          selectedDay={mobileSelectedDay}
          setSelectedDay={setMobileSelectedDay}
          segment={mobileSegment}
          setSegment={setMobileSegment}
          onOpenProject={setDrawerProject}
        />
        <DispatchProjectDrawer
          project={drawerProject}
          crewLookup={teamMembers}
          equipmentList={equipmentList}
          equipmentOccupancy={equipmentOccupancy}
          allProjects={activeProjects}
          supabase={supabase}
          profile={profile}
          canEdit={canEdit}
          isMobile={true}
          displayCrews={displayCrews}
          onProjectUpdate={(id, patch) => {
            setLocalProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
            setDrawerProject(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
            persistProjectPatch(id, patch);
          }}
          onClose={() => setDrawerProject(null)}
        />
      </>
    );
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-dark)', color: '#FFF', fontFamily: FONT }}>

        {/* HEADER */}
        <div style={{ padding: '30px 40px', borderBottom: `1px solid ${EDGE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ margin: 0, fontSize: '2.2rem', fontWeight: '800', letterSpacing: '-0.03em', color: 'var(--text-main)' }}>Dispatch Matrix</h1>
              {!canEdit && (
                <span style={{ fontSize: '0.65rem', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: ACCENT.attention, backgroundColor: 'var(--brand-amber-muted)', border: `1px solid ${ACCENT.attention}`, padding: '4px 10px', borderRadius: '999px' }}>
                  View Only
                </span>
              )}
            </div>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              {canEdit
                ? 'Drag projects from the Holding Queue onto a crew + day to schedule.'
                : 'Tap a project for details. Editing is restricted to admins, owners, and PMs.'}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: SURFACE.panel, padding: '6px', borderRadius: '12px', border: `1px solid ${HAIRLINE}` }}>
              <button onClick={() => setWeekOffset(w => w - 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' }}>
                <ChevronLeft size={20} />
              </button>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', color: 'var(--text-main)', minWidth: '160px', textAlign: 'center', letterSpacing: '-0.01em' }}>
                {navLabel}
              </div>
              <button onClick={() => setWeekOffset(w => w + 1)} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center' }}>
                <ChevronRight size={20} />
              </button>
            </div>
            <button
              onClick={toggleViewMode}
              style={{
                backgroundColor: SURFACE.panel,
                border: `1px solid ${HAIRLINE}`,
                borderRadius: '12px',
                padding: '10px 16px',
                color: viewMode === 'month' ? ACCENT.action : 'var(--text-main)',
                fontSize: '0.85rem',
                fontWeight: '600',
                letterSpacing: '-0.01em',
                cursor: 'pointer',
              }}
            >
              {viewMode === 'month' ? 'Week View' : 'Month View'}
            </button>
          </div>
        </div>

        {/* WORKSPACE */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT SIDEBAR: HOLDING QUEUE */}
          <div style={{ width: '220px', flexShrink: 0, backgroundColor: SURFACE.panel, borderRight: `1px solid ${HAIRLINE}`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '24px', borderBottom: `1px solid ${HAIRLINE}` }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', letterSpacing: '-0.01em', fontWeight: '700' }}>
                <AlertCircle size={16} color={ACCENT.attention} /> Holding Queue
              </h3>
            </div>

            <HoldingQueueDroppable>
              {holdingQueue.map(project => (
                <DraggableProjectCard key={project.id} project={project} canEdit={canEdit} onOpen={setDrawerProject} teamLookup={teamMembers} equipmentConflict={conflictedIds.has(project.id)} />
              ))}
              {holdingQueue.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', textAlign: 'center', padding: '24px 0', letterSpacing: '-0.01em' }}>
                  All projects scheduled.
                </div>
              )}
            </HoldingQueueDroppable>
          </div>

          {/* RIGHT AREA: MASTER MATRIX */}
          <div style={{ flex: 1, overflowY: 'auto', backgroundColor: SURFACE.base }}>
            <div style={{ minWidth: `${matrixMinWidth}px`, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>

              {calendarWeeks.map((week, weekIdx) => {
                const isFirstBlock = weekIdx === 0;
                // Sticky header only in week mode (single block).
                // Month mode stacks N blocks; each block has an inline header.
                const headerPosition = !isMonth && isFirstBlock ? 'sticky' : 'static';
                return (
                  <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column' }}>

                    {/* Day Header for THIS week block */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: gridTemplate,
                      borderBottom: `1px solid ${EDGE}`,
                      borderTop: !isFirstBlock ? `1px solid ${HAIRLINE}` : 'none',
                      position: headerPosition,
                      top: 0,
                      zIndex: 10,
                      backgroundColor: SURFACE.panel,
                      backdropFilter: 'blur(10px)',
                    }}>
                      <div style={{
                        padding: isMonth ? '12px 20px' : '20px',
                        fontWeight: '700',
                        color: 'var(--text-muted)',
                        textTransform: 'uppercase',
                        fontSize: '0.7rem',
                        letterSpacing: '1.5px',
                        display: 'flex',
                        alignItems: 'center',
                      }}>
                        {isFirstBlock ? 'Field Crews' : ''}
                      </div>
                      {week.map((day, slotIdx) => {
                        if (!day) {
                          return (
                            <div key={slotIdx} style={{
                              padding: isMonth ? '10px 12px' : '16px 12px',
                              borderLeft: `1px solid ${HAIRLINE}`,
                              backgroundColor: 'transparent',
                              opacity: 0.3,
                            }} />
                          );
                        }
                        const isToday = toISODate(day) === todayISO;
                        return (
                          <div key={slotIdx} style={{
                            padding: isMonth ? '10px 12px' : '16px 12px',
                            borderLeft: `1px solid ${HAIRLINE}`,
                            textAlign: 'center',
                            backgroundColor: isToday ? TODAY_TINT : 'transparent',
                          }}>
                            <div style={{
                              fontSize: '0.66rem',
                              color: isToday ? ACCENT.today : 'var(--text-muted)',
                              fontWeight: '700',
                              textTransform: 'uppercase',
                              letterSpacing: '1.5px',
                              marginBottom: isMonth ? '3px' : '6px',
                            }}>
                              {day.toLocaleDateString('en-US', { weekday: 'short' })}
                            </div>
                            <div style={{
                              fontSize: isMonth ? '0.85rem' : '1rem',
                              fontWeight: '600',
                              color: isToday ? ACCENT.today : 'var(--text-main)',
                              letterSpacing: '-0.01em',
                            }}>
                              {day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Crew Rows for THIS week block */}
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      {displayCrews.map((crew) => (
                        <div key={crew.id} style={{
                          display: 'grid',
                          gridTemplateColumns: gridTemplate,
                          borderBottom: `1px solid ${HAIRLINE}`,
                        }}>

                          {/* Crew Cell — slate avatar, compact in month view */}
                          <div style={{
                            padding: isMonth ? '10px 16px' : '16px',
                            borderRight: `1px solid ${HAIRLINE}`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            backgroundColor: 'transparent',
                          }}>
                            <div style={{
                              width: isMonth ? '28px' : '36px',
                              height: isMonth ? '28px' : '36px',
                              flexShrink: 0,
                              borderRadius: '50%',
                              backgroundColor: 'rgba(148, 163, 184, 0.12)',
                              color: 'var(--text-muted)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: '700',
                              fontSize: isMonth ? '0.78rem' : '0.95rem',
                              letterSpacing: '-0.01em',
                            }}>
                              {crew.first_name?.charAt(0) || 'U'}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                minWidth: 0,
                              }}>
                                <div style={{
                                  fontWeight: '600',
                                  fontSize: isMonth ? '0.82rem' : '0.92rem',
                                  color: 'var(--text-main)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  letterSpacing: '-0.01em',
                                }}>
                                  {crew.first_name} {crew.last_name}
                                </div>
                                {week.some(d => d && isCrewPTO(crew.id, d)) && (
                                  <span
                                    title="This crew has PTO in the visible week"
                                    style={{
                                      fontSize: '0.56rem',
                                      fontWeight: '700',
                                      letterSpacing: '1px',
                                      textTransform: 'uppercase',
                                      color: ACCENT.attention,
                                      backgroundColor: 'var(--brand-amber-muted)',
                                      padding: '2px 6px',
                                      borderRadius: '999px',
                                      flexShrink: 0,
                                    }}
                                  >
                                    PTO
                                  </span>
                                )}
                              </div>
                              {!isMonth && (
                                <div style={{
                                  fontSize: '0.66rem',
                                  color: 'var(--text-muted)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '1px',
                                  marginTop: '3px',
                                }}>
                                  {(crew.role || '').replace('_', ' ')}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Day Cells for this crew × this week */}
                          {week.map((day, slotIdx) => {
                            const ptoRow = day ? isCrewPTO(crew.id, day) : null;
                            const wouldConflict = !!(
                              day && activeProject &&
                              wouldCreateConflict(occupancyForDragPreview, activeProject, toISODate(day))
                            );
                            return (
                              <DayCell
                                key={slotIdx}
                                crewId={crew.id}
                                day={day}
                                isToday={day ? toISODate(day) === todayISO : false}
                                ptoRow={ptoRow}
                                wouldConflict={wouldConflict}
                                minHeight={cellMinHeight}
                                padding={cellPadding}
                                onContextMenu={day && canEdit ? (e) => {
                                  e.preventDefault();
                                  setPtoPopover({
                                    crewId: crew.id,
                                    crewName: `${crew.first_name || ''} ${crew.last_name || ''}`.trim(),
                                    anchorDay: toISODate(day),
                                    x: e.clientX,
                                    y: e.clientY,
                                    existingRow: ptoRow,
                                  });
                                } : undefined}
                              >
                                {day && projectsForCell(crew.id, day).map(p => {
                                  const conflict = isCrewPTO(getCrewId(p), day);
                                  const equipmentConflict = conflictedIds.has(p.id);
                                  const span = dayIndexInSpan(day, p.scheduled_date, p.scheduled_end_date);
                                  // In month mode, only render the first working-day instance of a span
                                  // with a "× N days" caption to avoid repeating the card 5+ times.
                                  if (isMonth && span && span.total > 1 && span.index > 1) return null;
                                  return (
                                    <DraggableProjectCard
                                      key={p.id}
                                      project={p}
                                      compact
                                      dense={isMonth}
                                      canEdit={canEdit}
                                      onOpen={setDrawerProject}
                                      ptoConflict={!!conflict}
                                      equipmentConflict={equipmentConflict}
                                      teamLookup={teamMembers}
                                      spanInfo={span}
                                      isMonthView={isMonth}
                                    />
                                  );
                                })}
                              </DayCell>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {displayCrews.length === 0 && (
                <div style={{ padding: '40px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  No field crews on roster.
                </div>
              )}

              {/* Filler row — only meaningful in week mode (single block).
                  In month mode the stacked week blocks already fill the area. */}
              {!isMonth && (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: gridTemplate, minHeight: '120px' }}>
                  <div style={{ borderRight: `1px solid ${HAIRLINE}` }} />
                  {calendarWeeks[0].map((day, idx) => (
                    <div
                      key={idx}
                      style={{
                        borderRight: `1px solid ${HAIRLINE}`,
                        backgroundColor: day && toISODate(day) === todayISO ? TODAY_TINT : SURFACE.slot,
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={null}>
        {activeProject ? <ProjectCardVisual project={activeProject} dragging /> : null}
      </DragOverlay>

      <DispatchProjectDrawer
        project={drawerProject}
        crewLookup={teamMembers}
        equipmentList={equipmentList}
        equipmentOccupancy={equipmentOccupancy}
        allProjects={activeProjects}
        supabase={supabase}
        profile={profile}
        canEdit={canEdit}
        onProjectUpdate={(id, patch) => {
          setLocalProjects(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
          setDrawerProject(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
          persistProjectPatch(id, patch);
        }}
        onClose={() => setDrawerProject(null)}
      />

      <PTOPopover
        popover={ptoPopover}
        supabase={supabase}
        firmId={profile?.firm_id}
        createdBy={profile?.id}
        onChanged={fetchUnavailability}
        onClose={() => setPtoPopover(null)}
      />
    </DndContext>
  );
}

// ══════════ DISPATCH PROJECT DRAWER ══════════
function DispatchProjectDrawer({ project, crewLookup, equipmentList = [], equipmentOccupancy = null, allProjects = [], supabase, profile = null, canEdit = false, isMobile = false, displayCrews = [], onProjectUpdate, onClose }) {
  const [invoiceState, setInvoiceState] = React.useState('idle'); // idle | sending | sent | error
  const isOpen = !!project;

  // ─── Field-crew role detection ────────────────────────────────
  // Mutually exclusive with canEdit in practice: admins/PMs get the full
  // desktop tooling; field crews get the in-field workflow below.
  const FIELD_ROLES = ['field_crew', 'technician', 'party_chief'];
  const profileRole = (profile?.role || '').toLowerCase().trim();
  const isFieldUser = FIELD_ROLES.includes(profileRole);
  const isAssignedToMe =
    !!project && !!profile?.id && (
      getCrewId(project) === profile.id ||
      (Array.isArray(project.assigned_crew) && project.assigned_crew.includes(profile.id))
    );
  const canDoFieldWork = isFieldUser && isAssignedToMe;

  // ─── Field-crew local state ───────────────────────────────────
  const [photos, setPhotos] = React.useState([]);
  const [uploading, setUploading] = React.useState(false);
  const [localNotes, setLocalNotes] = React.useState('');
  const fileInputRef = React.useRef(null);

  // Mirror server notes into local state whenever the project changes.
  React.useEffect(() => { setLocalNotes(project?.notes || ''); }, [project?.id, project?.notes]);

  // Fetch photos from the existing `project-photos` bucket when the drawer
  // opens. Mirrors the pattern in App.jsx fetchProjectPhotos.
  const fetchPhotos = React.useCallback(async () => {
    if (!supabase || !project?.id) return;
    const { data, error } = await supabase.storage.from('project-photos').list(project.id);
    if (error) { console.error('[Drawer] photo list error:', error); return; }
    if (!data) return;
    const valid = data.filter(f => f.name && f.name !== '.emptyFolderPlaceholder');
    const withUrls = valid.map(f => ({
      name: f.name,
      url: supabase.storage.from('project-photos').getPublicUrl(`${project.id}/${f.name}`).data.publicUrl,
    }));
    setPhotos(withUrls);
  }, [supabase, project?.id]);

  React.useEffect(() => {
    if (!isOpen) { setPhotos([]); return; }
    fetchPhotos();
  }, [isOpen, fetchPhotos]);

  // Save-on-blur for notes, plus a final save on drawer close if dirty.
  // (Covers the "user swiped the drawer shut before blur fired" case.)
  const saveNotesIfDirty = () => {
    if (!project) return;
    if ((localNotes || '') === (project.notes || '')) return;
    onProjectUpdate && onProjectUpdate(project.id, { notes: localNotes || null });
  };
  const handleClose = () => {
    saveNotesIfDirty();
    onClose && onClose();
  };

  // ─── Field actions ────────────────────────────────────────────
  function openRoute() {
    const dest = project?.address || project?.location;
    if (!dest) return;
    const url = `https://maps.apple.com/?daddr=${encodeURIComponent(dest)}`;
    window.open(url, '_blank');
  }
  const startWork = () => project && onProjectUpdate(project.id, { status: 'in_progress' });
  const markComplete = () => project && onProjectUpdate(project.id, { status: 'completed' });

  async function handlePhotoCapture(e) {
    const file = e.target.files?.[0];
    if (!file || !project?.id || !supabase) return;
    setUploading(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}_${safeName}`;
    const { error } = await supabase.storage
      .from('project-photos')
      .upload(`${project.id}/${filename}`, file, {
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
    setUploading(false);
    e.target.value = ''; // allow re-selecting the same file
    if (error) {
      console.error('[Drawer] photo upload error:', error);
      alert(`Photo upload failed: ${error.message || 'unknown error'}`);
      return;
    }
    fetchPhotos();
  }

  // Reset invoice state when project changes
  React.useEffect(() => { setInvoiceState('idle'); }, [project?.id]);

  const crewId = getCrewId(project);
  const crew = crewLookup.find(m => m.id === crewId);
  const crewName = crew ? `${crew.first_name || ''} ${crew.last_name || ''}`.trim() : 'Unassigned';

  // Supporting crew: anyone in assigned_crew who isn't the lead.
  const supportingIds = Array.isArray(project?.assigned_crew)
    ? project.assigned_crew.filter(id => id && id !== crewId)
    : [];
  const supportingMembers = supportingIds.map(id => crewLookup.find(m => m.id === id)).filter(Boolean);

  // Members eligible to join a supporting crew — exclude the lead and office admins.
  const eligibleForCrew = crewLookup.filter(m =>
    m.id !== crewId &&
    !['owner', 'admin'].includes((m.role || '').toLowerCase().trim())
  );

  function updateCrew(nextSupportingIds) {
    if (!project || !onProjectUpdate) return;
    // Store as lead + supporting, deduped, lead always first. The backend
    // column is uuid[]; we keep the lead in the array so the RLS clause
    // `auth.uid() = any(assigned_crew)` covers them too.
    const seen = new Set();
    const next = [];
    if (crewId) { next.push(crewId); seen.add(crewId); }
    for (const id of nextSupportingIds) {
      if (id && !seen.has(id)) { next.push(id); seen.add(id); }
    }
    onProjectUpdate(project.id, { assigned_crew: next });
  }

  const addSupporting = (id) => updateCrew([...supportingIds, id]);
  const removeSupporting = (id) => updateCrew(supportingIds.filter(x => x !== id));

  // Duration stepper — counts WORKING days (Sundays skipped).
  const currentSpan = project?.scheduled_date
    ? dayIndexInSpan(parseISODate(project.scheduled_end_date || project.scheduled_date), project.scheduled_date, project.scheduled_end_date || project.scheduled_date)
    : null;
  const currentDuration = currentSpan?.total || 1;
  const durationEndLabel = project?.scheduled_date
    ? parseISODate(project.scheduled_end_date || project.scheduled_date)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null;

  function setDuration(nextDays) {
    if (!project || !project.scheduled_date || !onProjectUpdate) return;
    const clamped = Math.max(1, Math.min(60, nextDays));
    if (clamped === 1) {
      onProjectUpdate(project.id, { scheduled_end_date: null });
      return;
    }
    const newEnd = computeEndFromWorkingDays(project.scheduled_date, clamped);
    onProjectUpdate(project.id, { scheduled_end_date: newEnd });
  }

  // ─── Equipment ────────────────────────────────────────────────
  // Normalize every id to a string so integer vs string id columns
  // don't cause silent Map lookup failures. The actual storage shape is
  // jsonb[string], so consistency is simplest if we coerce everywhere.
  const projectEquipmentIds = (() => {
    const req = project?.required_equipment;
    if (!req) return [];
    if (Array.isArray(req)) {
      return req
        .map(x => {
          if (x === null || x === undefined) return null;
          if (typeof x === 'string') return x;
          if (typeof x === 'number') return String(x);
          if (typeof x === 'object' && x.id != null) return String(x.id);
          return null;
        })
        .filter(Boolean);
    }
    return [];
  })();

  const equipmentById = new Map(equipmentList.map(e => [String(e.id), e]));
  const selectedEquipment = projectEquipmentIds
    .map(id => equipmentById.get(String(id)))
    .filter(Boolean);
  const availableEquipment = equipmentList.filter(e => !projectEquipmentIds.includes(String(e.id)));

  function updateEquipment(nextIds) {
    if (!project || !onProjectUpdate) return;
    // Store as normalized string ids in a jsonb array.
    const normalized = nextIds.map(id => String(id)).filter(Boolean);
    onProjectUpdate(project.id, { required_equipment: normalized });
  }
  const addEquipment = (id) => updateEquipment([...projectEquipmentIds, String(id)]);
  const removeEquipment = (id) => updateEquipment(projectEquipmentIds.filter(x => String(x) !== String(id)));

  // Conflicts for THIS project (read-only view of what's clashing)
  const myConflicts = project?.id && equipmentOccupancy
    ? conflictsForProject(project.id, equipmentOccupancy)
    : [];
  const projectNameById = new Map(allProjects.map(p => [p.id, p.project_name]));

  const scopeItems = Array.isArray(project?.scope)
    ? project.scope
    : Array.isArray(project?.scope_checklist)
      ? project.scope_checklist
      : [];

  async function handleGenerateInvoice() {
    if (!project || !supabase) return;
    setInvoiceState('sending');
    try {
      const { error } = await supabase.functions.invoke('stripe-create-invoice', {
        body: { project_id: project.id },
      });
      setInvoiceState(error ? 'error' : 'sent');
      if (error) console.error('[DispatchBoard] invoice generation failed:', error);
    } catch (err) {
      console.error('[DispatchBoard] invoice generation threw:', err);
      setInvoiceState('error');
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0,
          backgroundColor: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 200ms ease',
          zIndex: 9990,
        }}
      />

      {/* Drawer panel — Tier 1. On mobile, fills the full screen. */}
      <aside
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: isMobile ? '100vw' : '420px',
          maxWidth: isMobile ? '100vw' : '90vw',
          backgroundColor: SURFACE.panel,
          borderLeft: isMobile ? 'none' : `1px solid ${EDGE}`,
          boxShadow: isMobile ? 'none' : '-24px 0 64px rgba(0,0,0,0.55)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 280ms cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 9991,
          display: 'flex',
          flexDirection: 'column',
          color: 'var(--text-main)',
          fontFamily: FONT,
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px', borderBottom: `1px solid ${HAIRLINE}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.68rem', fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontWeight: '700', color: ACCENT.attention, letterSpacing: '0.1em', marginBottom: '10px' }}>
              {project?.id ? project.id.slice(0, 8).toUpperCase() : ''}
            </div>
            <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '700', lineHeight: '1.2', letterSpacing: '-0.02em', color: 'var(--text-main)' }}>
              {project?.project_name || 'Project'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            style={{
              background: SURFACE.card,
              border: `1px solid ${HAIRLINE}`,
              borderRadius: '8px',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              padding: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            aria-label="Close drawer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

          {/* Field Actions — top of drawer for field crews assigned to this project */}
          {canDoFieldWork && (
            <DrawerSection title="Field Actions" icon={<Play size={14} />}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {/* Route to Site */}
                <button
                  onClick={openRoute}
                  disabled={!(project?.address || project?.location)}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: (project?.address || project?.location) ? ACCENT.action : SURFACE.card,
                    color: (project?.address || project?.location) ? 'var(--text-main)' : 'var(--text-muted)',
                    fontWeight: '700',
                    fontSize: '0.95rem',
                    letterSpacing: '-0.01em',
                    cursor: (project?.address || project?.location) ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    fontFamily: FONT,
                  }}
                >
                  <Navigation size={18} />
                  Route to Site
                </button>

                {/* Start Work / Mark Complete — state-driven */}
                {project?.status === 'completed' ? (
                  <div
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      border: `1px solid ${HAIRLINE}`,
                      backgroundColor: SURFACE.card,
                      color: 'var(--success)',
                      fontWeight: '700',
                      fontSize: '0.92rem',
                      letterSpacing: '-0.01em',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                    }}
                  >
                    <CheckCircle2 size={18} />
                    Completed
                  </div>
                ) : project?.status === 'in_progress' ? (
                  <button
                    onClick={markComplete}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: 'var(--success)',
                      color: 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '0.95rem',
                      letterSpacing: '-0.01em',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      fontFamily: FONT,
                    }}
                  >
                    <CheckCircle2 size={18} />
                    Mark Complete
                  </button>
                ) : (
                  <button
                    onClick={startWork}
                    style={{
                      width: '100%',
                      padding: '14px 18px',
                      borderRadius: '10px',
                      border: 'none',
                      backgroundColor: ACCENT.action,
                      color: 'var(--text-main)',
                      fontWeight: '700',
                      fontSize: '0.95rem',
                      letterSpacing: '-0.01em',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      fontFamily: FONT,
                    }}
                  >
                    <Play size={18} />
                    Start Work
                  </button>
                )}
              </div>
            </DrawerSection>
          )}

          {/* Status stat — single tile, Crew moves to its own section below */}
          <DrawerStat
            label="Status"
            value={String(project?.status || 'pending').toUpperCase()}
            valueDotColor={statusDotColor(project?.status)}
            icon={<CheckCircle2 size={14} />}
          />

          {/* Schedule (mobile + editor only) — drag-and-drop replacement.
              Two selects + an unschedule button so PMs can still reassign
              a project from a phone without fighting touch drag gestures. */}
          {isMobile && canEdit && (
            <DrawerSection title="Schedule" icon={<CheckCircle2 size={14} />}>
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: SURFACE.card,
                border: `1px solid ${HAIRLINE}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                <label style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: '700' }}>
                  Assign to
                  <select
                    value={getCrewId(project) || ''}
                    onChange={(e) => {
                      const crewId = e.target.value || null;
                      const patch = { assigned_to: crewId };
                      // Reassigning the lead on mobile also resets supporting crew,
                      // matching desktop drag-to-reassign semantics.
                      if (crewId && crewId !== getCrewId(project)) {
                        patch.assigned_crew = [crewId];
                      }
                      onProjectUpdate(project.id, patch);
                    }}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: '6px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${HAIRLINE}`,
                      backgroundColor: SURFACE.panel,
                      color: 'var(--text-main)',
                      fontSize: '0.88rem',
                      fontFamily: FONT,
                      cursor: 'pointer',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    <option value="">— Unassigned —</option>
                    {displayCrews.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.first_name} {c.last_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: '700' }}>
                  Scheduled date
                  <input
                    type="date"
                    value={(project?.scheduled_date || '').slice(0, 10)}
                    onChange={(e) => onProjectUpdate(project.id, { scheduled_date: e.target.value || null })}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: '6px',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${HAIRLINE}`,
                      backgroundColor: SURFACE.panel,
                      color: 'var(--text-main)',
                      fontSize: '0.88rem',
                      fontFamily: FONT,
                      boxSizing: 'border-box',
                    }}
                  />
                </label>

                {project?.scheduled_date && (
                  <button
                    onClick={() => onProjectUpdate(project.id, {
                      assigned_to: null,
                      scheduled_date: null,
                      scheduled_end_date: null,
                    })}
                    style={{
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: `1px solid ${HAIRLINE}`,
                      backgroundColor: 'transparent',
                      color: 'var(--text-muted)',
                      fontSize: '0.78rem',
                      fontWeight: '600',
                      letterSpacing: '-0.01em',
                      cursor: 'pointer',
                      fontFamily: FONT,
                    }}
                  >
                    Return to Holding Queue
                  </button>
                )}
              </div>
            </DrawerSection>
          )}

          {/* Crew — party chief + supporting crew chip editor */}
          <DrawerSection title="Crew" icon={<User size={14} />}>
            <div style={{
              padding: '14px 16px',
              borderRadius: '8px',
              backgroundColor: SURFACE.card,
              border: `1px solid ${HAIRLINE}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
            }}>
              {/* Lead — non-editable from this control */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '28px', height: '28px', flexShrink: 0,
                  borderRadius: '50%',
                  backgroundColor: 'rgba(148, 163, 184, 0.18)',
                  color: 'var(--text-main)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: '700', fontSize: '0.78rem',
                }}>
                  {crew?.first_name?.charAt(0) || '?'}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: '0.82rem', fontWeight: '600', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                    {crewName}
                  </div>
                  <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700', marginTop: '2px' }}>
                    Party Chief · Lead
                  </div>
                </div>
              </div>

              {/* Supporting crew chips */}
              {supportingMembers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {supportingMembers.map(m => (
                    <span
                      key={m.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '5px 6px 5px 10px',
                        borderRadius: '999px',
                        backgroundColor: 'rgba(148, 163, 184, 0.12)',
                        border: `1px solid ${HAIRLINE}`,
                        fontSize: '0.76rem',
                        color: 'var(--text-main)',
                        fontWeight: '600',
                      }}
                    >
                      {m.first_name} {m.last_name}
                      {canEdit && (
                        <button
                          onClick={() => removeSupporting(m.id)}
                          title="Remove from crew"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >×</button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {/* Add picker — shown only for editors */}
              {canEdit && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addSupporting(e.target.value);
                    e.target.value = '';
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${HAIRLINE}`,
                    backgroundColor: SURFACE.panel,
                    color: 'var(--text-main)',
                    fontSize: '0.8rem',
                    fontFamily: FONT,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">+ Add crew member…</option>
                  {eligibleForCrew
                    .filter(m => !supportingIds.includes(m.id))
                    .map(m => (
                      <option key={m.id} value={m.id}>
                        {m.first_name} {m.last_name} — {m.role}
                      </option>
                    ))}
                </select>
              )}

              {supportingMembers.length === 0 && !canEdit && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  Solo — no supporting crew assigned.
                </div>
              )}
            </div>
          </DrawerSection>

          {/* Duration — working days, Sundays skipped */}
          {project?.scheduled_date && (
            <DrawerSection title="Duration" icon={<CheckCircle2 size={14} />}>
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: SURFACE.card,
                border: `1px solid ${HAIRLINE}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>
                    {currentDuration} working day{currentDuration !== 1 ? 's' : ''}
                  </div>
                  {durationEndLabel && currentDuration > 1 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                      Ends {durationEndLabel} · Sundays skipped
                    </div>
                  )}
                  {currentDuration === 1 && (
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                      Single-day job
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <button
                      onClick={() => setDuration(currentDuration - 1)}
                      disabled={currentDuration <= 1}
                      style={{
                        width: '30px', height: '30px',
                        borderRadius: '8px',
                        border: `1px solid ${HAIRLINE}`,
                        backgroundColor: SURFACE.panel,
                        color: 'var(--text-main)',
                        cursor: currentDuration <= 1 ? 'not-allowed' : 'pointer',
                        opacity: currentDuration <= 1 ? 0.4 : 1,
                        fontSize: '1rem',
                        fontWeight: '700',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >−</button>
                    <div style={{
                      minWidth: '28px',
                      textAlign: 'center',
                      fontSize: '0.92rem',
                      fontWeight: '700',
                      color: 'var(--text-main)',
                      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                    }}>
                      {currentDuration}
                    </div>
                    <button
                      onClick={() => setDuration(currentDuration + 1)}
                      disabled={currentDuration >= 60}
                      style={{
                        width: '30px', height: '30px',
                        borderRadius: '8px',
                        border: `1px solid ${HAIRLINE}`,
                        backgroundColor: SURFACE.panel,
                        color: 'var(--text-main)',
                        cursor: 'pointer',
                        fontSize: '1rem',
                        fontWeight: '700',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >+</button>
                  </div>
                )}
              </div>
            </DrawerSection>
          )}

          {/* Equipment — multi-select chip input */}
          <DrawerSection title="Equipment" icon={<Receipt size={14} />}>
            <div style={{
              padding: '14px 16px',
              borderRadius: '8px',
              backgroundColor: SURFACE.card,
              border: `1px solid ${HAIRLINE}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}>
              {selectedEquipment.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {selectedEquipment.map(eq => (
                    <span
                      key={eq.id}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '5px 6px 5px 10px',
                        borderRadius: '999px',
                        backgroundColor: 'var(--brand-amber-muted)',
                        border: `1px solid rgba(212, 145, 42, 0.35)`,
                        fontSize: '0.74rem',
                        color: 'var(--text-main)',
                        fontWeight: '600',
                      }}
                    >
                      <span style={{ color: ACCENT.attention, fontFamily: "'JetBrains Mono', 'SF Mono', monospace", fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {eq.category || 'EQ'}
                      </span>
                      {eq.model}
                      {canEdit && (
                        <button
                          onClick={() => removeEquipment(eq.id)}
                          title="Remove from project"
                          style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: 'none',
                            borderRadius: '50%',
                            width: '18px',
                            height: '18px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.85rem',
                            lineHeight: 1,
                            padding: 0,
                          }}
                        >×</button>
                      )}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                  No equipment assigned.
                </div>
              )}

              {canEdit && availableEquipment.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) addEquipment(e.target.value);
                    e.target.value = '';
                  }}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    border: `1px solid ${HAIRLINE}`,
                    backgroundColor: SURFACE.panel,
                    color: 'var(--text-main)',
                    fontSize: '0.8rem',
                    fontFamily: FONT,
                    cursor: 'pointer',
                  }}
                >
                  <option value="">+ Add equipment…</option>
                  {availableEquipment.map(eq => (
                    <option key={eq.id} value={eq.id}>
                      {eq.category ? `${eq.category} · ` : ''}{eq.model}{eq.serial_number ? ` (${eq.serial_number})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </DrawerSection>

          {/* Conflicts — surfaces only if this project actually clashes */}
          {myConflicts.length > 0 && (
            <DrawerSection title="Conflicts" icon={<AlertCircle size={14} />}>
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(239, 68, 68, 0.08)',
                border: `1px solid var(--error)`,
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}>
                {myConflicts.slice(0, 8).map((c, i) => {
                  const eq = equipmentById.get(c.equipmentId);
                  const eqLabel = eq ? `${eq.category ? eq.category + ' — ' : ''}${eq.model}` : c.equipmentId.slice(0, 8);
                  const dateLabel = parseISODate(c.date)?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  return (
                    <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-main)', lineHeight: '1.45' }}>
                      <div style={{ fontWeight: '600', color: 'var(--error)', letterSpacing: '-0.01em' }}>
                        {eqLabel}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {dateLabel} · also on{' '}
                        {c.otherProjectIds.map((id, idx) => (
                          <span key={id}>
                            {idx > 0 ? ', ' : ''}
                            <strong style={{ color: 'var(--text-main)' }}>
                              {projectNameById.get(id) || id.slice(0, 8)}
                            </strong>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {myConflicts.length > 8 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    …and {myConflicts.length - 8} more
                  </div>
                )}
              </div>
            </DrawerSection>
          )}

          {/* Site — drive context. Surfaces project.location + project.address if present. */}
          {(project?.location || project?.address) && (
            <DrawerSection title="Site" icon={<MapPin size={14} />}>
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: SURFACE.card,
                border: `1px solid ${HAIRLINE}`,
                fontSize: '0.85rem',
                lineHeight: '1.5',
                color: 'var(--text-main)',
              }}>
                {project?.location && (
                  <div style={{ fontWeight: '600', letterSpacing: '-0.01em' }}>
                    {project.location}
                  </div>
                )}
                {project?.address && (
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: project?.location ? '4px' : 0 }}>
                    {project.address}
                  </div>
                )}
              </div>
            </DrawerSection>
          )}

          {/* Scope */}
          <DrawerSection title="Scope" icon={<FileText size={14} />}>
            {scopeItems.length > 0 ? (
              <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {scopeItems.map((item, i) => {
                  const label = typeof item === 'string' ? item : (item.label || item.name || JSON.stringify(item));
                  const done = typeof item === 'object' && (item.done || item.complete || item.completed);
                  return (
                    <li key={i} style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      backgroundColor: SURFACE.card,
                      border: `1px solid ${HAIRLINE}`,
                      fontSize: '0.85rem',
                      color: done ? 'var(--text-muted)' : 'var(--text-main)',
                      textDecoration: done ? 'line-through' : 'none',
                      display: 'flex', alignItems: 'center', gap: '10px',
                    }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        backgroundColor: done ? 'var(--success)' : 'var(--text-muted)',
                        flexShrink: 0,
                      }} />
                      {label}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <DrawerEmpty>No scope items defined.</DrawerEmpty>
            )}
          </DrawerSection>

          {/* Notes — editable for field crews + editors, read-only otherwise */}
          <DrawerSection title="Notes" icon={<FileText size={14} />}>
            {(canEdit || canDoFieldWork) ? (
              <textarea
                value={localNotes}
                onChange={(e) => setLocalNotes(e.target.value)}
                onBlur={saveNotesIfDirty}
                placeholder="Field notes, observations, monument recoveries, client comments…"
                rows={5}
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  borderRadius: '8px',
                  backgroundColor: SURFACE.card,
                  border: `1px solid ${HAIRLINE}`,
                  fontSize: '0.85rem',
                  lineHeight: '1.55',
                  color: 'var(--text-main)',
                  fontFamily: FONT,
                  resize: 'vertical',
                  boxSizing: 'border-box',
                  outline: 'none',
                }}
              />
            ) : project?.notes ? (
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: SURFACE.card,
                border: `1px solid ${HAIRLINE}`,
                fontSize: '0.85rem',
                lineHeight: '1.55',
                color: 'var(--text-main)',
                whiteSpace: 'pre-wrap',
              }}>
                {project.notes}
              </div>
            ) : (
              <DrawerEmpty>No notes attached.</DrawerEmpty>
            )}
          </DrawerSection>

          {/* Photos — visible to field crews + editors. Camera capture on iOS via capture="environment". */}
          {(canEdit || canDoFieldWork) && (
            <DrawerSection title="Photos" icon={<Camera size={14} />}>
              <div style={{
                padding: '14px 16px',
                borderRadius: '8px',
                backgroundColor: SURFACE.card,
                border: `1px solid ${HAIRLINE}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                {canDoFieldWork && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={handlePhotoCapture}
                    />
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      style={{
                        width: '100%',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: `1px solid ${HAIRLINE}`,
                        backgroundColor: uploading ? SURFACE.card : ACCENT.action,
                        color: 'var(--text-main)',
                        fontWeight: '700',
                        fontSize: '0.88rem',
                        letterSpacing: '-0.01em',
                        cursor: uploading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '10px',
                        fontFamily: FONT,
                        opacity: uploading ? 0.7 : 1,
                      }}
                    >
                      <Camera size={16} />
                      {uploading ? 'Uploading…' : 'Take Photo'}
                    </button>
                  </>
                )}

                {photos.length > 0 ? (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: '6px',
                    maxHeight: '240px',
                    overflowY: 'auto',
                  }}>
                    {photos.map(p => (
                      <a
                        key={p.name}
                        href={p.url}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          aspectRatio: '1',
                          overflow: 'hidden',
                          borderRadius: '6px',
                          border: `1px solid ${HAIRLINE}`,
                          display: 'block',
                        }}
                      >
                        <img
                          src={p.url}
                          alt=""
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
                    {canDoFieldWork
                      ? 'No photos yet — tap Take Photo to capture the first one.'
                      : 'No photos yet.'}
                  </div>
                )}
              </div>
            </DrawerSection>
          )}
        </div>

        {/* Footer — Tier 1 (sits WITH the drawer body, not below it) */}
        {canEdit ? (
        <div style={{ padding: '20px 28px', borderTop: `1px solid ${EDGE}`, backgroundColor: SURFACE.panel }}>
          <button
            onClick={handleGenerateInvoice}
            disabled={!project || invoiceState === 'sending'}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: invoiceState === 'sent' ? 'var(--success)' : ACCENT.action,
              color: 'var(--text-main)',
              fontWeight: '600',
              fontSize: '0.92rem',
              letterSpacing: '-0.01em',
              cursor: invoiceState === 'sending' ? 'wait' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: invoiceState === 'sending' ? 0.7 : 1,
              transition: 'background-color 150ms ease, opacity 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (invoiceState === 'idle' || invoiceState === 'error') {
                e.currentTarget.style.backgroundColor = 'var(--brand-teal-light)';
              }
            }}
            onMouseLeave={(e) => {
              if (invoiceState === 'idle' || invoiceState === 'error') {
                e.currentTarget.style.backgroundColor = ACCENT.action;
              }
            }}
          >
            <Receipt size={18} />
            {invoiceState === 'idle' && 'Generate Invoice'}
            {invoiceState === 'sending' && 'Generating…'}
            {invoiceState === 'sent' && 'Invoice Sent'}
            {invoiceState === 'error' && 'Retry'}
          </button>
        </div>
        ) : (
          <div style={{ padding: '16px 28px', borderTop: `1px solid ${EDGE}`, backgroundColor: SURFACE.panel, textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
            Read-only · contact a PM or admin to edit
          </div>
        )}
      </aside>
    </>
  );
}

function DrawerStat({ label, value, valueDotColor, icon }) {
  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: '10px',
      backgroundColor: SURFACE.card,
      border: `1px solid ${HAIRLINE}`,
      minWidth: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: '700', marginBottom: '10px' }}>
        {icon} {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        {valueDotColor && (
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: valueDotColor, flexShrink: 0 }} />
        )}
        <div style={{ fontSize: '0.92rem', fontWeight: '600', color: 'var(--text-main)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </div>
      </div>
    </div>
  );
}

function DrawerSection({ title, icon, children }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1.5px', fontWeight: '700', marginBottom: '12px' }}>
        {icon} {title}
      </div>
      {children}
    </div>
  );
}

function DrawerEmpty({ children }) {
  return (
    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', padding: '12px 0' }}>
      {children}
    </div>
  );
}

// ══════════ HOLDING QUEUE DROPPABLE (lets you drop back to unschedule) ══════════
function HoldingQueueDroppable({ children }) {
  const { setNodeRef, isOver } = useDroppable({ id: 'holding-queue', data: { type: 'queue' } });
  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        backgroundColor: isOver ? 'var(--brand-amber-muted)' : 'transparent',
        outline: isOver ? `1px dashed ${ACCENT.attention}` : 'none',
        outlineOffset: '-8px',
        transition: 'background-color 120ms ease',
      }}
    >
      {children}
    </div>
  );
}

// ══════════ DAY CELL DROPPABLE ══════════
// Accepts a Date directly (or null for out-of-month placeholder slots).
// The drop payload carries the day Date so handleDragEnd can use it without
// any index lookup — important because month view stacks multiple week blocks.
function DayCell({ crewId, day, isToday, ptoRow = null, wouldConflict = false, minHeight = 120, padding = '10px', onContextMenu, children }) {
  const isPlaceholder = !day;
  const isPTO = !!ptoRow;
  const isoKey = day ? toISODate(day) : `placeholder-${crewId}`;
  const { setNodeRef, isOver } = useDroppable({
    id: `cell-${crewId}-${isoKey}`,
    data: { type: 'cell', crewId, day },
    disabled: isPlaceholder || isPTO,
  });
  // PTO cells: amber tint + bold amber diagonal stripes. Uses the same brand
  // amber as the "PTO" chip in the crew row so the two read as one signal.
  const ptoStripes = 'repeating-linear-gradient(45deg, rgba(212, 145, 42, 0.28) 0 10px, rgba(212, 145, 42, 0.06) 10px 20px)';
  const ptoBg = 'rgba(212, 145, 42, 0.10)';
  // Equipment-conflict drag-over: red tint + red dashed outline, instead of
  // the usual teal lifted state. Drop is still allowed (override permitted).
  const isConflictOver = isOver && wouldConflict && !isPTO && !isPlaceholder;
  return (
    <div
      ref={setNodeRef}
      onContextMenu={onContextMenu}
      title={isPTO ? `PTO${ptoRow.reason ? ' — ' + ptoRow.reason : ''}` : undefined}
      style={{
        position: 'relative',
        padding,
        borderRight: `1px solid ${HAIRLINE}`,
        minHeight: `${minHeight}px`,
        minWidth: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backgroundColor: isPlaceholder
          ? 'transparent'
          : isPTO
            ? ptoBg
            : isConflictOver
              ? 'rgba(239, 68, 68, 0.14)'
              : isOver
                ? SURFACE.lifted
                : isToday
                  ? TODAY_TINT
                  : SURFACE.slot,
        backgroundImage: isPTO ? ptoStripes : 'none',
        outline: isPTO
          ? `1px dashed rgba(212, 145, 42, 0.55)`
          : isConflictOver
            ? `1px dashed var(--error)`
            : isOver && !isPlaceholder
              ? `1px dashed ${ACCENT.action}`
              : 'none',
        outlineOffset: '-4px',
        transition: 'background-color 120ms ease',
        opacity: isPlaceholder ? 0.35 : 1,
        cursor: isPTO ? 'not-allowed' : 'default',
      }}
    >
      {isPTO && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontSize: '0.62rem',
            fontWeight: '800',
            letterSpacing: '2px',
            color: 'rgba(212, 145, 42, 0.7)',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          OFF
        </div>
      )}
      {children}
    </div>
  );
}

// ══════════ DRAGGABLE PROJECT CARD ══════════
function DraggableProjectCard({ project, compact = false, dense = false, canEdit = false, ptoConflict = false, equipmentConflict = false, teamLookup = [], spanInfo = null, isMonthView = false, onOpen }) {
  // Read-only viewers (field crews, technicians, etc.) get a static card
  // that still opens the drawer but cannot be dragged.
  if (!canEdit) {
    return (
      <div
        onClick={() => onOpen && onOpen(project)}
        style={{ cursor: 'pointer', minWidth: 0 }}
      >
        <ProjectCardVisual project={project} compact={compact} dense={dense} ptoConflict={ptoConflict} equipmentConflict={equipmentConflict} teamLookup={teamLookup} spanInfo={spanInfo} isMonthView={isMonthView} />
      </div>
    );
  }

  // Editor (admin / owner / pm) — full drag-and-drop card
  return <EditableProjectCard project={project} compact={compact} dense={dense} ptoConflict={ptoConflict} equipmentConflict={equipmentConflict} teamLookup={teamLookup} spanInfo={spanInfo} isMonthView={isMonthView} onOpen={onOpen} />;
}

function EditableProjectCard({ project, compact, dense, ptoConflict, equipmentConflict, teamLookup, spanInfo, isMonthView, onOpen }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: project.id,
    data: { type: 'project', project },
  });
  // The PointerSensor uses a 4px activation distance, so a true click
  // (pointer down + up with no drag) still fires onClick here.
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return;
        e.stopPropagation();
        onOpen && onOpen(project);
      }}
      style={{
        opacity: isDragging ? 0.35 : 1,
        cursor: 'grab',
        touchAction: 'none',
        minWidth: 0,
      }}
    >
      <ProjectCardVisual project={project} compact={compact} dense={dense} ptoConflict={ptoConflict} equipmentConflict={equipmentConflict} teamLookup={teamLookup} spanInfo={spanInfo} isMonthView={isMonthView} />
    </div>
  );
}

// Status → dot color. One glanceable signal, no competing pill.
function statusDotColor(status) {
  switch ((status || '').toLowerCase()) {
    case 'in_progress':
    case 'active':       return ACCENT.action;          // teal
    case 'scheduled':    return ACCENT.attention;       // amber
    case 'completed':    return 'var(--success)';
    case 'pending':
    default:             return 'var(--text-muted)';
  }
}

// ══════════ CREW AVATAR STACK ══════════
// Small horizontal stack of crew-member initials. Max 3 visible, +N overflow.
// Excludes the lead (assigned_to) — the lead is implicit from the row context.
function CrewAvatarStack({ crewIds = [], leadId, teamLookup = [], size = 16 }) {
  const byId = new Map(teamLookup.map(m => [m.id, m]));
  const supporting = (Array.isArray(crewIds) ? crewIds : [])
    .filter(id => id && id !== leadId)
    .map(id => byId.get(id))
    .filter(Boolean);
  if (supporting.length === 0) return null;

  const visible = supporting.slice(0, 3);
  const overflow = supporting.length - visible.length;
  const names = supporting.map(m => `${m.first_name || ''} ${m.last_name || ''}`.trim()).join(', ');

  return (
    <div
      title={`Crew: ${names}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '-4px',
        marginLeft: '2px',
      }}
    >
      {visible.map((m, i) => (
        <div
          key={m.id}
          style={{
            width: `${size}px`,
            height: `${size}px`,
            borderRadius: '50%',
            backgroundColor: 'rgba(148, 163, 184, 0.18)',
            color: 'var(--text-main)',
            border: `1.5px solid ${SURFACE.card.replace('color-mix(in srgb, var(--bg-surface) 96%, white)', 'var(--bg-surface)')}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: `${Math.max(8, size - 8)}px`,
            fontWeight: '700',
            letterSpacing: '-0.01em',
            marginLeft: i === 0 ? 0 : '-4px',
            zIndex: visible.length - i,
          }}
        >
          {(m.first_name || '?').charAt(0).toUpperCase()}
        </div>
      ))}
      {overflow > 0 && (
        <div
          style={{
            marginLeft: '-4px',
            padding: '0 5px',
            height: `${size}px`,
            borderRadius: '999px',
            backgroundColor: 'rgba(148, 163, 184, 0.18)',
            color: 'var(--text-muted)',
            fontSize: `${Math.max(8, size - 8)}px`,
            fontWeight: '700',
            display: 'flex',
            alignItems: 'center',
          }}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ══════════ PURE VISUAL CARD ══════════
// `compact`     = day-cell variant (smaller padding/text).
// `dense`       = month-mode day cell — even tighter, hide the location row.
// `ptoConflict` = project is scheduled on a day the assigned crew is now on PTO.
//                 Soft warning: amber badge, no auto-unschedule.
function ProjectCardVisual({ project, compact = false, dense = false, dragging = false, ptoConflict = false, equipmentConflict = false, teamLookup = [], spanInfo = null, isMonthView = false }) {
  // Location renders unless we're in dense (month-mode) day cells.
  const showLocation = project.location && !dense;
  const showCrewStack = Array.isArray(project.assigned_crew) && project.assigned_crew.length > 0;
  const isMultiDay = !!(spanInfo && spanInfo.total > 1);
  // In month view, a multi-day span only renders its first instance with
  // a "× N days" caption. In week view, each instance renders "Day N / M".
  const spanCaption = isMultiDay
    ? (isMonthView ? `× ${spanInfo.total} days` : `Day ${spanInfo.index} / ${spanInfo.total}`)
    : null;
  // Border hierarchy: dragging teal > equipment red > PTO amber > hairline.
  const borderColor = dragging
    ? ACCENT.action
    : equipmentConflict
      ? 'var(--error)'
      : ptoConflict
        ? ACCENT.attention
        : HAIRLINE;
  return (
    <div style={{
      position: 'relative',
      backgroundColor: dragging ? SURFACE.lifted : SURFACE.card,
      border: `1px solid ${borderColor}`,
      borderRadius: '10px',
      padding: compact ? '10px 12px' : '14px',
      // No resting shadow — cards sit IN the grid, not ON it.
      // Dragging gets a soft directional shadow only.
      boxShadow: dragging
        ? '0 16px 32px -8px rgba(0,0,0,0.5)'
        : 'none',
      transform: dragging ? 'rotate(-1deg)' : 'none',
    }}>
      {equipmentConflict && (
        <div
          title="Equipment conflict — this project shares equipment with another on the same day"
          style={{
            position: 'absolute',
            top: '-6px',
            left: '-6px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: 'var(--error)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '0.68rem',
            lineHeight: 1,
            border: `2px solid ${SURFACE.panel}`,
            zIndex: 2,
          }}
        >
          !
        </div>
      )}
      {ptoConflict && (
        <div
          title="Scheduling conflict — assigned crew is on PTO this day"
          style={{
            position: 'absolute',
            top: '-6px',
            right: '-6px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: ACCENT.attention,
            color: 'var(--bg-dark)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: '800',
            fontSize: '0.68rem',
            lineHeight: 1,
            border: `2px solid ${SURFACE.panel}`,
            zIndex: 2,
          }}
        >
          !
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: showLocation ? (compact ? '6px' : '8px') : (compact ? '8px' : '12px'), gap: '10px' }}>
        <h4 style={{
          margin: 0,
          fontSize: compact ? '0.8rem' : '0.85rem',
          fontWeight: '600',
          color: 'var(--text-main)',
          lineHeight: '1.3',
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {project.project_name}
        </h4>
        {/* status dot — single glanceable signal */}
        <span
          title={String(project.status || 'pending')}
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: statusDotColor(project.status),
            flexShrink: 0,
            marginTop: '5px',
          }}
        />
      </div>
      {spanCaption && (
        <div style={{
          fontSize: '0.6rem',
          fontWeight: '700',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: ACCENT.action,
          backgroundColor: 'rgba(13, 79, 79, 0.18)',
          padding: '2px 6px',
          borderRadius: '4px',
          display: 'inline-block',
          alignSelf: 'flex-start',
          marginBottom: compact ? '6px' : '10px',
        }}>
          {spanCaption}
        </div>
      )}

      {showLocation && (
        <div style={{
          fontSize: compact ? '0.7rem' : '0.75rem',
          color: 'var(--text-muted)',
          marginBottom: compact ? '8px' : '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          <MapPin size={compact ? 11 : 12} style={{ flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{project.location}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
        <span style={{
          fontSize: '0.62rem',
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          fontWeight: '700',
          color: ACCENT.attention,
          backgroundColor: 'var(--brand-amber-muted)',
          padding: '3px 7px',
          borderRadius: '4px',
          letterSpacing: '0.05em',
        }}>
          {project.id.slice(0, 6).toUpperCase()}
        </span>
        {showCrewStack && (
          <CrewAvatarStack
            crewIds={project.assigned_crew}
            leadId={getCrewId(project)}
            teamLookup={teamLookup}
            size={compact ? 16 : 18}
          />
        )}
      </div>
    </div>
  );
}

// ══════════ PTO POPOVER ══════════
// Triggered by right-click on a day cell. Edits `crew_unavailability`.
// When `popover.existingRow` is set, the popover edits/deletes that row;
// otherwise it creates a new one anchored to the clicked day.
function PTOPopover({ popover, supabase, firmId, createdBy, onChanged, onClose }) {
  const [start, setStart] = React.useState('');
  const [end, setEnd] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!popover) return;
    if (popover.existingRow) {
      setStart(popover.existingRow.start_date || popover.anchorDay);
      setEnd(popover.existingRow.end_date || popover.anchorDay);
      setReason(popover.existingRow.reason || '');
    } else {
      setStart(popover.anchorDay);
      setEnd(popover.anchorDay);
      setReason('');
    }
  }, [popover?.crewId, popover?.anchorDay, popover?.existingRow?.id]);

  // Dismiss on Escape
  React.useEffect(() => {
    if (!popover) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [popover, onClose]);

  if (!popover) return null;

  const isEdit = !!popover.existingRow;

  async function handleSave() {
    if (!supabase || !firmId) return;
    if (!start || !end) return;
    if (new Date(end) < new Date(start)) return;
    setBusy(true);
    let ok = false;
    if (isEdit) {
      const { error } = await supabase
        .from('crew_unavailability')
        .update({ start_date: start, end_date: end, reason: reason || null })
        .eq('id', popover.existingRow.id);
      if (error) console.error('[PTOPopover] update failed:', error);
      else ok = true;
    } else {
      const { error } = await supabase
        .from('crew_unavailability')
        .insert([{
          user_id: popover.crewId,
          firm_id: firmId,
          start_date: start,
          end_date: end,
          reason: reason || null,
          created_by: createdBy || null,
        }]);
      if (error) console.error('[PTOPopover] insert failed:', error);
      else ok = true;
    }
    setBusy(false);
    // Local fast-path refetch — don't wait on realtime.
    if (ok && onChanged) await onChanged();
    onClose();
  }

  async function handleDelete() {
    if (!supabase || !isEdit) return;
    setBusy(true);
    const { error } = await supabase
      .from('crew_unavailability')
      .delete()
      .eq('id', popover.existingRow.id);
    if (error) console.error('[PTOPopover] delete failed:', error);
    setBusy(false);
    if (!error && onChanged) await onChanged();
    onClose();
  }

  // Clamp so the popover stays inside the viewport even when right-clicking near an edge.
  const POPOVER_W = 280;
  const POPOVER_H = 260;
  const x = Math.min(popover.x, window.innerWidth - POPOVER_W - 16);
  const y = Math.min(popover.y, window.innerHeight - POPOVER_H - 16);

  return (
    <>
      {/* click-outside backdrop */}
      <div
        onClick={onClose}
        onContextMenu={(e) => { e.preventDefault(); onClose(); }}
        style={{ position: 'fixed', inset: 0, zIndex: 9994, background: 'transparent' }}
      />
      <div
        style={{
          position: 'fixed',
          top: y,
          left: x,
          width: `${POPOVER_W}px`,
          zIndex: 9995,
          backgroundColor: SURFACE.panel,
          border: `1px solid ${EDGE}`,
          borderRadius: '12px',
          boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
          padding: '16px',
          color: 'var(--text-main)',
          fontFamily: FONT,
        }}
      >
        <div style={{
          fontSize: '0.66rem',
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '1.5px',
          fontWeight: '700',
          marginBottom: '4px',
        }}>
          {isEdit ? 'Edit Time Off' : 'Mark Unavailable'}
        </div>
        <div style={{
          fontSize: '0.95rem',
          fontWeight: '600',
          color: 'var(--text-main)',
          letterSpacing: '-0.01em',
          marginBottom: '14px',
        }}>
          {popover.crewName}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
          <label style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
            Start
            <input
              type="date"
              value={start}
              onChange={(e) => setStart(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '6px',
                border: `1px solid ${HAIRLINE}`,
                backgroundColor: SURFACE.card,
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                fontFamily: FONT,
                boxSizing: 'border-box',
              }}
            />
          </label>
          <label style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
            End
            <input
              type="date"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '4px',
                padding: '8px 10px',
                borderRadius: '6px',
                border: `1px solid ${HAIRLINE}`,
                backgroundColor: SURFACE.card,
                color: 'var(--text-main)',
                fontSize: '0.82rem',
                fontFamily: FONT,
                boxSizing: 'border-box',
              }}
            />
          </label>
        </div>

        <label style={{ fontSize: '0.66rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>
          Reason
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Vacation, sick, training…"
            style={{
              display: 'block',
              width: '100%',
              marginTop: '4px',
              padding: '8px 10px',
              borderRadius: '6px',
              border: `1px solid ${HAIRLINE}`,
              backgroundColor: SURFACE.card,
              color: 'var(--text-main)',
              fontSize: '0.82rem',
              fontFamily: FONT,
              boxSizing: 'border-box',
            }}
          />
        </label>

        <div style={{ display: 'flex', gap: '8px', marginTop: '14px', justifyContent: 'flex-end' }}>
          {isEdit && (
            <button
              onClick={handleDelete}
              disabled={busy}
              style={{
                padding: '8px 14px',
                borderRadius: '8px',
                border: `1px solid var(--error)`,
                backgroundColor: 'transparent',
                color: 'var(--error)',
                fontSize: '0.78rem',
                fontWeight: '600',
                cursor: busy ? 'wait' : 'pointer',
                marginRight: 'auto',
              }}
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            disabled={busy}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: `1px solid ${HAIRLINE}`,
              backgroundColor: 'transparent',
              color: 'var(--text-muted)',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={busy || !start || !end}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: ACCENT.action,
              color: 'var(--text-main)',
              fontSize: '0.78rem',
              fontWeight: '600',
              cursor: busy ? 'wait' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {isEdit ? 'Save' : 'Mark Off'}
          </button>
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════
// MOBILE DISPATCH BOARD — dedicated phone layout
// ══════════════════════════════════════════════════════════════════
// Branches from the desktop tree when viewport ≤ 768px. Single-column
// "today's board" layout built around a day selector + segmented
// Crews/Queue control. No drag-and-drop. Shares all state with the
// parent DispatchBoard component via props.
function MobileDispatchBoard({
  displayCrews,
  teamMembers,
  holdingQueue,
  projectsForCell,
  isCrewPTO,
  conflictedIds,
  calendarWeeks,
  setWeekOffset,
  navLabel,
  todayISO,
  selectedDay,
  setSelectedDay,
  segment,
  setSegment,
  onOpenProject,
}) {
  // Flatten calendarWeeks to the visible day list (Mon–Sat, current week).
  const visibleDays = useMemo(
    () => (calendarWeeks[0] || []).filter(Boolean),
    [calendarWeeks]
  );

  // If the selected day falls outside the visible week (user nav'd weeks),
  // snap to the first visible day. Also ensures today-on-mount is respected.
  useEffect(() => {
    if (visibleDays.length === 0) return;
    const hit = visibleDays.find(d => toISODate(d) === selectedDay);
    if (!hit) setSelectedDay(toISODate(visibleDays[0]));
  }, [visibleDays, selectedDay, setSelectedDay]);

  const selectedDayObj = visibleDays.find(d => toISODate(d) === selectedDay) || visibleDays[0] || null;
  const queueCount = holdingQueue.length;

  // PTO indicator per day pill — true if ANY crew has PTO on that day.
  const dayHasPTO = (day) => displayCrews.some(c => isCrewPTO(c.id, day));

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: SURFACE.base,
      color: 'var(--text-main)',
      fontFamily: FONT,
      overflowX: 'hidden',
    }}>

      {/* ─── HEADER ─────────────────────────────────────── */}
      <div style={{
        padding: '14px 16px 12px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        borderBottom: `1px solid ${HAIRLINE}`,
        backgroundColor: SURFACE.panel,
        flexShrink: 0,
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '1.1rem',
          fontWeight: '700',
          letterSpacing: '-0.02em',
          color: 'var(--text-main)',
        }}>
          Dispatch
        </h1>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '2px',
          backgroundColor: SURFACE.card,
          border: `1px solid ${HAIRLINE}`,
          borderRadius: '999px',
          padding: '2px',
        }}>
          <button
            onClick={() => setWeekOffset(w => w - 1)}
            style={{
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: '999px',
              color: 'var(--text-main)', cursor: 'pointer', padding: 0,
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <div style={{
            minWidth: '92px',
            textAlign: 'center',
            fontSize: '0.78rem',
            fontWeight: '700',
            color: 'var(--text-main)',
            letterSpacing: '-0.01em',
            padding: '0 4px',
          }}>
            {(navLabel || '').replace('Week of ', '')}
          </div>
          <button
            onClick={() => setWeekOffset(w => w + 1)}
            style={{
              width: '32px', height: '32px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: '999px',
              color: 'var(--text-main)', cursor: 'pointer', padding: 0,
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* ─── DAY PILL STRIP ─────────────────────────────── */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '12px 16px',
        overflowX: 'auto',
        overflowY: 'hidden',
        scrollSnapType: 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        borderBottom: `1px solid ${HAIRLINE}`,
        backgroundColor: SURFACE.panel,
        flexShrink: 0,
      }}>
        {visibleDays.map((day, i) => (
          <MobileDayPill
            key={i}
            day={day}
            isSelected={toISODate(day) === selectedDay}
            isToday={toISODate(day) === todayISO}
            hasPTO={dayHasPTO(day)}
            onPress={() => setSelectedDay(toISODate(day))}
          />
        ))}
      </div>

      {/* ─── SEGMENTED CONTROL ──────────────────────────── */}
      <div style={{
        display: 'flex',
        padding: '12px 16px 8px',
        gap: '8px',
        flexShrink: 0,
      }}>
        <MobileSegment
          label={`Queue (${queueCount})`}
          active={segment === 'queue'}
          onPress={() => setSegment('queue')}
        />
        <MobileSegment
          label="Crews"
          active={segment === 'crews'}
          onPress={() => setSegment('crews')}
        />
      </div>

      {/* ─── BODY ─────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        padding: '4px 16px 96px', // bottom padding for fixed mobile nav
      }}>
        {segment === 'queue' ? (
          <MobileQueueList
            projects={holdingQueue}
            teamLookup={teamMembers}
            conflictedIds={conflictedIds}
            onOpen={onOpenProject}
          />
        ) : (
          <MobileCrewList
            displayCrews={displayCrews}
            selectedDay={selectedDayObj}
            projectsForCell={projectsForCell}
            isCrewPTO={isCrewPTO}
            teamLookup={teamMembers}
            conflictedIds={conflictedIds}
            onOpen={onOpenProject}
          />
        )}
      </div>
    </div>
  );
}

// ─── MOBILE DAY PILL ──────────────────────────────────────────
function MobileDayPill({ day, isSelected, isToday, hasPTO, onPress }) {
  const weekday = day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const dateNum = day.getDate();
  return (
    <button
      onClick={onPress}
      style={{
        position: 'relative',
        flexShrink: 0,
        scrollSnapAlign: 'start',
        width: '56px',
        height: '64px',
        borderRadius: '12px',
        border: `1px solid ${isSelected ? ACCENT.action : isToday ? 'var(--brand-teal-light)' : HAIRLINE}`,
        backgroundColor: isSelected ? ACCENT.action : isToday ? TODAY_TINT : SURFACE.card,
        color: isSelected ? '#fff' : isToday ? 'var(--brand-teal-light)' : 'var(--text-main)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '3px',
        padding: 0,
        fontFamily: FONT,
        transition: 'background-color 120ms ease',
      }}
    >
      <div style={{
        fontSize: '0.58rem',
        fontWeight: '700',
        letterSpacing: '1px',
        opacity: isSelected ? 0.85 : 0.7,
      }}>
        {weekday}
      </div>
      <div style={{
        fontSize: '1.1rem',
        fontWeight: '700',
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}>
        {dateNum}
      </div>
      {hasPTO && (
        <span
          style={{
            position: 'absolute',
            bottom: '6px',
            right: '6px',
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: ACCENT.attention,
            boxShadow: '0 0 0 1.5px ' + (isSelected ? ACCENT.action : SURFACE.card),
          }}
        />
      )}
    </button>
  );
}

// ─── MOBILE SEGMENT BUTTON ────────────────────────────────────
function MobileSegment({ label, active, onPress }) {
  return (
    <button
      onClick={onPress}
      style={{
        flex: 1,
        height: '40px',
        borderRadius: '10px',
        border: `1px solid ${active ? ACCENT.action : HAIRLINE}`,
        backgroundColor: active ? 'rgba(13, 79, 79, 0.18)' : SURFACE.card,
        color: active ? 'var(--text-main)' : 'var(--text-muted)',
        fontSize: '0.82rem',
        fontWeight: '700',
        letterSpacing: '-0.01em',
        cursor: 'pointer',
        fontFamily: FONT,
      }}
    >
      {label}
    </button>
  );
}

// ─── MOBILE CREW LIST ─────────────────────────────────────────
function MobileCrewList({ displayCrews, selectedDay, projectsForCell, isCrewPTO, teamLookup, conflictedIds, onOpen }) {
  if (!selectedDay) {
    return (
      <div style={{ padding: '32px 16px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
        No day selected.
      </div>
    );
  }
  if (displayCrews.length === 0) {
    return (
      <div style={{ padding: '32px 16px', color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
        No field crews on roster.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingTop: '8px' }}>
      {displayCrews.map(crew => (
        <MobileCrewSection
          key={crew.id}
          crew={crew}
          selectedDay={selectedDay}
          ptoRow={isCrewPTO(crew.id, selectedDay)}
          projects={projectsForCell(crew.id, selectedDay)}
          teamLookup={teamLookup}
          conflictedIds={conflictedIds}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// ─── MOBILE CREW SECTION ──────────────────────────────────────
function MobileCrewSection({ crew, selectedDay, ptoRow, projects, teamLookup, conflictedIds, onOpen }) {
  const name = `${crew.first_name || ''} ${crew.last_name || ''}`.trim();
  const role = (crew.role || '').replace('_', ' ');
  return (
    <div>
      {/* Crew header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        marginBottom: '10px',
        padding: '0 2px',
      }}>
        <div style={{
          width: '36px',
          height: '36px',
          flexShrink: 0,
          borderRadius: '50%',
          backgroundColor: 'rgba(148, 163, 184, 0.18)',
          color: 'var(--text-main)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: '700',
          fontSize: '0.95rem',
          letterSpacing: '-0.01em',
        }}>
          {(crew.first_name || '?').charAt(0).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontWeight: '700',
            fontSize: '0.95rem',
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
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '1.5px',
            marginTop: '2px',
          }}>
            {role}
          </div>
        </div>
        {ptoRow && (
          <span style={{
            fontSize: '0.56rem',
            fontWeight: '700',
            letterSpacing: '1px',
            textTransform: 'uppercase',
            color: ACCENT.attention,
            backgroundColor: 'var(--brand-amber-muted)',
            padding: '3px 8px',
            borderRadius: '999px',
            flexShrink: 0,
          }}>
            PTO
          </span>
        )}
      </div>

      {/* Crew content: PTO block, projects, or empty state */}
      {ptoRow ? (
        <div
          style={{
            padding: '16px 14px',
            borderRadius: '10px',
            backgroundColor: 'rgba(212, 145, 42, 0.10)',
            backgroundImage: 'repeating-linear-gradient(45deg, rgba(212, 145, 42, 0.28) 0 10px, rgba(212, 145, 42, 0.06) 10px 20px)',
            border: `1px dashed rgba(212, 145, 42, 0.55)`,
            textAlign: 'center',
            color: 'rgba(212, 145, 42, 0.85)',
            fontSize: '0.78rem',
            fontWeight: '700',
            letterSpacing: '1.5px',
            textTransform: 'uppercase',
            textShadow: '0 1px 2px rgba(0,0,0,0.5)',
          }}
        >
          OFF {ptoRow.reason ? `· ${ptoRow.reason}` : ''}
        </div>
      ) : projects.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {projects.map(p => {
            const span = dayIndexInSpan(selectedDay, p.scheduled_date, p.scheduled_end_date);
            return (
              <div
                key={p.id}
                onClick={() => onOpen(p)}
                style={{ cursor: 'pointer', minWidth: 0 }}
              >
                <ProjectCardVisual
                  project={p}
                  compact={false}
                  dense={false}
                  ptoConflict={false}
                  equipmentConflict={conflictedIds.has(p.id)}
                  teamLookup={teamLookup}
                  spanInfo={span}
                  isMonthView={false}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          padding: '18px 14px',
          borderRadius: '10px',
          border: `1px dashed ${HAIRLINE}`,
          backgroundColor: SURFACE.slot,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.78rem',
          fontStyle: 'italic',
        }}>
          No jobs scheduled
        </div>
      )}
    </div>
  );
}

// ─── MOBILE QUEUE LIST ────────────────────────────────────────
function MobileQueueList({ projects, teamLookup, conflictedIds, onOpen }) {
  if (projects.length === 0) {
    return (
      <div style={{
        padding: '48px 16px',
        color: 'var(--text-muted)',
        textAlign: 'center',
        fontSize: '0.85rem',
        letterSpacing: '-0.01em',
      }}>
        All projects scheduled.
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', paddingTop: '8px' }}>
      {projects.map(p => (
        <div
          key={p.id}
          onClick={() => onOpen(p)}
          style={{ cursor: 'pointer', minWidth: 0 }}
        >
          <ProjectCardVisual
            project={p}
            compact={false}
            dense={false}
            equipmentConflict={conflictedIds.has(p.id)}
            teamLookup={teamLookup}
          />
        </div>
      ))}
    </div>
  );
}
