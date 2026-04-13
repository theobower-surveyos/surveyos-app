// ================================================================
// Dispatch Board — Equipment Conflict Detection
// ================================================================
// Pure helpers over an array of scheduled projects. No React, no
// Supabase. Consumes the same `required_equipment` jsonb array and
// `scheduled_date / scheduled_end_date` range that the dispatch
// board already reads.
//
// A conflict is: two or more distinct projects requiring the SAME
// equipment uuid on the SAME calendar day, where both projects are
// scheduled (have a start date) and neither is completed/archived.
//
// Multi-day spans are respected — each working day of a span
// contributes to the occupancy map, so a 3-day topo holding a GPS
// rover blocks that rover across all 3 days.
// ================================================================

// ─── Local-midnight ISO date helpers (no TZ drift) ────────────────
function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseISODate(iso) {
  if (!iso) return null;
  const s = typeof iso === 'string' ? iso.slice(0, 10) : iso;
  return new Date(s + 'T00:00:00');
}

// Extract the list of equipment uuids from a project's required_equipment.
// Tolerates several legacy shapes: uuid[] sent as array, jsonb array of
// strings, jsonb array of {id, ...}, or null.
function normalizeEquipmentList(req) {
  if (!req) return [];
  if (Array.isArray(req)) {
    return req
      .map(x => typeof x === 'string' ? x : (x && x.id) || null)
      .filter(Boolean);
  }
  return [];
}

// ─── Occupancy map ────────────────────────────────────────────────
// Returns: Map< equipmentId, Map< isoDate, Set<projectId> > >
export function buildEquipmentOccupancy(projects) {
  const map = new Map();
  if (!Array.isArray(projects)) return map;

  for (const p of projects) {
    if (!p || !p.scheduled_date) continue;
    if (p.status === 'completed' || p.status === 'archived') continue;

    const equipmentIds = normalizeEquipmentList(p.required_equipment);
    if (equipmentIds.length === 0) continue;

    const start = parseISODate(p.scheduled_date);
    const end = parseISODate(p.scheduled_end_date || p.scheduled_date);
    if (!start || !end) continue;

    // Walk every calendar day in the span (including Sundays — equipment
    // is still occupied on a weekend, even if no crew is working that day).
    const cursor = new Date(start);
    while (cursor <= end) {
      const iso = toISODate(cursor);
      for (const eqId of equipmentIds) {
        let byDate = map.get(eqId);
        if (!byDate) { byDate = new Map(); map.set(eqId, byDate); }
        let projectsOnDay = byDate.get(iso);
        if (!projectsOnDay) { projectsOnDay = new Set(); byDate.set(iso, projectsOnDay); }
        projectsOnDay.add(p.id);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  return map;
}

// ─── Conflict set ──────────────────────────────────────────────────
// Returns: Set<projectId> — every project that has at least one equipment
// conflict with another project on at least one day.
export function findConflictedProjects(occupancy) {
  const conflicted = new Set();
  if (!occupancy) return conflicted;
  for (const byDate of occupancy.values()) {
    for (const projectsOnDay of byDate.values()) {
      if (projectsOnDay.size > 1) {
        for (const projId of projectsOnDay) conflicted.add(projId);
      }
    }
  }
  return conflicted;
}

// ─── Per-project conflict detail (for drawer "Conflicts" section) ──
// Returns: Array<{ equipmentId, date, otherProjectIds: string[] }>
// Use this inside the drawer to show a reader-friendly list of what is
// actually conflicting for the scoped project.
export function conflictsForProject(projectId, occupancy) {
  const results = [];
  if (!projectId || !occupancy) return results;
  for (const [equipmentId, byDate] of occupancy.entries()) {
    for (const [iso, projectsOnDay] of byDate.entries()) {
      if (projectsOnDay.size > 1 && projectsOnDay.has(projectId)) {
        const others = [...projectsOnDay].filter(id => id !== projectId);
        results.push({ equipmentId, date: iso, otherProjectIds: others });
      }
    }
  }
  return results;
}

// ─── Would-conflict predicate (used during drag-over) ──────────────
// Given an occupancy map built WITHOUT the dragged project, return true
// if scheduling `projectBeingMoved` onto `newStartISO` (with its existing
// span length and existing required_equipment) would land on at least
// one day where its equipment is already occupied.
export function wouldCreateConflict(occupancy, projectBeingMoved, newStartISO) {
  if (!occupancy || !projectBeingMoved) return false;
  const equipmentIds = normalizeEquipmentList(projectBeingMoved.required_equipment);
  if (equipmentIds.length === 0) return false;

  const originalStart = parseISODate(projectBeingMoved.scheduled_date);
  const originalEnd = parseISODate(projectBeingMoved.scheduled_end_date || projectBeingMoved.scheduled_date);
  const newStart = parseISODate(newStartISO);
  if (!newStart) return false;

  // Preserve the calendar-day length of the span. If originally unscheduled,
  // treat it as a single day at the drop target.
  let lengthMs = 0;
  if (originalStart && originalEnd) {
    lengthMs = originalEnd.getTime() - originalStart.getTime();
  }
  const newEnd = new Date(newStart.getTime() + lengthMs);

  const cursor = new Date(newStart);
  while (cursor <= newEnd) {
    const iso = toISODate(cursor);
    for (const eqId of equipmentIds) {
      const byDate = occupancy.get(eqId);
      if (!byDate) continue;
      const projectsOnDay = byDate.get(iso);
      if (!projectsOnDay) continue;
      // Ignore the project's own occupancy (it's moving).
      const otherUsers = [...projectsOnDay].filter(id => id !== projectBeingMoved.id);
      if (otherUsers.length > 0) return true;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return false;
}
