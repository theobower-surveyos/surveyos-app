import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ArrowLeft, Calendar as CalIcon, Users, Truck, AlertTriangle, ShieldCheck, Clock, Activity } from 'lucide-react';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";
const ASSIGNED_PREFIX = 'assigned::';

const crews = [
  { id: 'c1', name: 'Crew Alpha', type: '3-Man Boundary', equipment: 'Trimble S7, R12i' },
  { id: 'c2', name: 'Crew Bravo', type: '2-Man Topo', equipment: 'Leica RTC360' },
  { id: 'c3', name: 'Crew Charlie', type: '1-Man Drone', equipment: 'DJI Matrice 300' }
];

// Map crew name -> local crew id
function crewIdFromName(name) {
  const match = crews.find(c => c.name === name);
  return match ? match.id : null;
}

// Map local crew id -> crew name
function crewNameFromId(id) {
  const match = crews.find(c => c.id === id);
  return match ? match.name : null;
}

// Normalize a Supabase project row into the shape our UI expects
// All IDs are coerced to strings to prevent type mismatches with dnd-kit
function normalizeProject(row, focusId) {
  const projId = String(row.id);
  return {
    id: projId,
    name: row.project_name || 'Untitled',
    type: row.fee_type || 'Survey',
    hours: row.hours_estimated || 0,
    focus: projId === String(focusId),
    crew_name: row.crew_name || null,
  };
}

// ── Draggable project card in the holding pen ──
function DraggableProject({ proj }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: proj.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={{
      width: '260px', padding: '12px', backgroundColor: proj.focus ? 'rgba(255, 159, 10, 0.1)' : '#141414',
      border: `1px solid ${proj.focus ? 'rgba(255, 159, 10, 0.5)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: '8px', cursor: isDragging ? 'grabbing' : 'grab', flexShrink: 0,
      boxShadow: proj.focus ? '0 0 15px rgba(255, 159, 10, 0.1)' : 'none',
      opacity: isDragging ? 0.4 : 1,
      touchAction: 'none',
    }}>
      <ProjectCardContent proj={proj} />
    </div>
  );
}

// ── Draggable assigned chip on the timeline ──
function DraggableAssignedChip({ proj, onEditHours }) {
  const draggableId = `${ASSIGNED_PREFIX}${proj.id}`;
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: draggableId });

  function handleEditClick(e) {
    e.stopPropagation();
    e.preventDefault();
    const input = window.prompt('Adjust Estimated Hours:', proj.hours);
    if (input !== null) {
      const parsed = parseFloat(input);
      if (!isNaN(parsed) && parsed > 0) onEditHours(proj.id, parsed);
    }
  }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        padding: '10px', marginBottom: '6px',
        backgroundColor: 'rgba(0, 122, 255, 0.1)', border: '1px solid rgba(0, 122, 255, 0.4)',
        borderRadius: '8px', borderLeft: '4px solid #007AFF',
        cursor: isDragging ? 'grabbing' : 'grab',
        opacity: isDragging ? 0.4 : 1,
        touchAction: 'none',
      }}
    >
      <div style={{ fontSize: '0.7rem', fontWeight: '700', color: '#007AFF', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {proj.name}
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ color: '#A1A1AA', fontFamily: MONO }}>{proj.hours}h</span>
          <button
            onPointerDown={e => e.stopPropagation()}
            onClick={handleEditClick}
            style={{
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '4px', padding: '2px 6px', cursor: 'pointer',
              fontSize: '0.65rem', fontWeight: '700', color: '#A1A1AA', lineHeight: 1,
            }}
          >
            Edit
          </button>
        </span>
      </div>
      <div style={{ fontSize: '0.75rem', fontWeight: '500', color: '#A1A1AA', fontFamily: MONO, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.id.slice(0, 8)}</div>
    </div>
  );
}

// ── Shared card content (used in holding pen card + drag overlay) ──
function ProjectCardContent({ proj }) {
  return (
    <>
      <div style={{ fontSize: '0.7rem', fontWeight: '700', color: proj.focus ? '#FF9F0A' : '#555', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
        {proj.id.slice(0, 8)}
        {proj.focus && <span style={{ color: '#FF9F0A' }}>Incoming Route</span>}
      </div>
      <div style={{ fontSize: '0.9rem', fontWeight: '600', color: '#FFF', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.name}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#A1A1AA', fontFamily: MONO }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><ShieldCheck size={12}/> {proj.type}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12}/> {proj.hours}h</span>
      </div>
    </>
  );
}

// ── Droppable timeline cell ──
function DroppableCell({ crewId, day, children }) {
  const cellId = `${crewId}-${day}`;
  const { isOver, setNodeRef } = useDroppable({ id: cellId });
  return (
    <div ref={setNodeRef} style={{
      minHeight: '80px', padding: '8px', position: 'relative',
      backgroundColor: isOver ? 'rgba(0, 122, 255, 0.08)' : 'transparent',
      border: isOver ? '1px dashed rgba(0, 122, 255, 0.5)' : '1px solid transparent',
      borderRight: '1px solid rgba(255,255,255,0.04)',
      transition: 'background-color 150ms ease, border 150ms ease',
    }}>
      {children}
    </div>
  );
}

// ── Droppable holding pen wrapper ──
function DroppableHoldingPen({ children }) {
  const { isOver, setNodeRef } = useDroppable({ id: 'unassigned-zone' });
  return (
    <div ref={setNodeRef} style={{
      flex: 1, padding: '16px', display: 'flex', gap: '16px', overflowX: 'auto',
      backgroundColor: isOver ? 'rgba(255, 159, 10, 0.06)' : 'transparent',
      border: isOver ? '1px dashed rgba(255, 159, 10, 0.4)' : '1px solid transparent',
      transition: 'background-color 150ms ease, border 150ms ease',
    }}>
      {children}
    </div>
  );
}

export default function DispatchBoard() {
  const navigate = useNavigate();
  const { id } = useParams();

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

  const [loading, setLoading] = useState(true);
  const [unassignedQueue, setUnassignedQueue] = useState([]);
  const [assignedProjects, setAssignedProjects] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // ── Fetch projects from Supabase on mount ──
  useEffect(() => {
    async function fetchProjects() {
      try {
        const { data, error } = await supabase.from('projects').select('*').neq('status', 'archived').order('created_at', { ascending: false });
        if (error) { console.error('[Dispatch] fetch error:', error.message); return; }
        if (!data) return;

        const unassigned = [];
        const assigned = [];

        for (const row of data) {
          const proj = normalizeProject(row, id);
          if (proj.crew_name) {
            const crewId = crewIdFromName(proj.crew_name);
            if (crewId) {
              assigned.push({ ...proj, crewId, day: row.scheduled_day || 'Monday' });
            } else {
              // crew_name doesn't match any known crew — treat as unassigned
              unassigned.push(proj);
            }
          } else {
            unassigned.push(proj);
          }
        }

        setUnassignedQueue(unassigned);
        setAssignedProjects(assigned);
      } catch (err) {
        console.error('[Dispatch] exception:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProjects();
  }, [id]);

  function handleEditHours(projId, newHours) {
    setAssignedProjects(prev => prev.map(p => p.id === projId ? { ...p, hours: newHours } : p));
    supabase.from('projects').update({ hours_estimated: newHours }).eq('id', projId).then(({ error }) => {
      if (error) console.error('[Dispatch] hours update failed:', error.message);
    });
  }

  function handleDragStart(event) {
    setActiveId(event.active.id);
  }

  function handleDragEnd(event) {
    setActiveId(null);
    const { over } = event;
    if (!over) return;

    const rawActiveId = String(event.active.id);
    const isAssigned = rawActiveId.startsWith(ASSIGNED_PREFIX);
    const projectId = isAssigned ? rawActiveId.slice(ASSIGNED_PREFIX.length) : rawActiveId;
    const targetId = String(over.id);

    // ── Scenario 3: Anything -> Holding Pen (unassign) ──
    if (targetId === 'unassigned-zone') {
      if (!isAssigned) return; // already in pen, no-op

      const proj = assignedProjects.find(p => p.id === projectId);
      if (!proj) return;

      // Snapshot for rollback
      const snapshotAssigned = [...assignedProjects];
      const snapshotUnassigned = [...unassignedQueue];

      // Optimistic: move immediately
      const { crewId: _, day: __, ...clean } = proj;
      setAssignedProjects(prev => prev.filter(p => p.id !== projectId));
      setUnassignedQueue(prev => [...prev, { ...clean, crew_name: null }]);

      // Persist in background, rollback on failure
      supabase.from('projects').update({ crew_name: null, scheduled_day: null }).eq('id', projectId)
        .then(({ error }) => {
          if (error) {
            console.error('[Dispatch] unassign failed:', error.message);
            alert(`Failed to unassign project: ${error.message}`);
            setAssignedProjects(snapshotAssigned);
            setUnassignedQueue(snapshotUnassigned);
          }
        });
      return;
    }

    // Parse timeline cell ID: "crewId-Day"
    const separatorIdx = targetId.indexOf('-');
    if (separatorIdx === -1) return;
    const crewId = targetId.slice(0, separatorIdx);
    const day = targetId.slice(separatorIdx + 1);
    const targetCrewName = crewNameFromId(crewId);
    if (!targetCrewName) return;

    if (isAssigned) {
      // ── Scenario 2: Timeline -> Timeline (move) ──
      const snapshotAssigned = [...assignedProjects];

      setAssignedProjects(prev => prev.map(p =>
        p.id === projectId ? { ...p, crewId, day, crew_name: targetCrewName } : p
      ));

      supabase.from('projects').update({ crew_name: targetCrewName, scheduled_day: day }).eq('id', projectId)
        .then(({ error }) => {
          if (error) {
            console.error('[Dispatch] move failed:', error.message);
            alert(`Failed to move project: ${error.message}`);
            setAssignedProjects(snapshotAssigned);
          }
        });
    } else {
      // ── Scenario 1: Holding Pen -> Timeline (assign) ──
      const proj = unassignedQueue.find(p => p.id === projectId);
      if (!proj) return;

      // Snapshot for rollback
      const snapshotUnassigned = [...unassignedQueue];
      const snapshotAssigned = [...assignedProjects];

      // Optimistic: move immediately
      setUnassignedQueue(prev => prev.filter(p => p.id !== projectId));
      setAssignedProjects(prev => [...prev, { ...proj, crewId, day, crew_name: targetCrewName }]);

      supabase.from('projects').update({ crew_name: targetCrewName, scheduled_day: day }).eq('id', projectId)
        .then(({ error }) => {
          if (error) {
            console.error('[Dispatch] assign failed:', error.message);
            alert(`Failed to assign project: ${error.message}`);
            setUnassignedQueue(snapshotUnassigned);
            setAssignedProjects(snapshotAssigned);
          }
        });
    }
  }

  // Resolve the overlay card for whichever type is being dragged
  const isActiveAssigned = activeId?.startsWith(ASSIGNED_PREFIX);
  const activeProjectId = isActiveAssigned ? activeId?.slice(ASSIGNED_PREFIX.length) : activeId;
  const activeProject = isActiveAssigned
    ? assignedProjects.find(p => p.id === activeProjectId)
    : unassignedQueue.find(p => p.id === activeProjectId);

  if (loading) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: FONT }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Activity size={32} color="#FF9F0A" />
          <span style={{ fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.8rem', color: '#A1A1AA' }}>Loading Dispatch Matrix...</span>
        </div>
      </div>
    );
  }

  return (
    <DndContext onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#050505', color: '#FFF', fontFamily: FONT }}>

        {/* HEADER */}
        <div style={{ padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div>
            <button
              onClick={() => navigate('/')}
              style={{ background: 'transparent', border: 'none', color: '#007AFF', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: 0, marginBottom: '8px', fontSize: '0.9rem', fontWeight: '600' }}
            >
              <ArrowLeft size={16} /> Back to Command Center
            </button>
            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <CalIcon color="#FF9F0A" size={24} /> Global Resource Matrix
            </h1>
          </div>
          <div style={{ display: 'flex', gap: '16px' }}>
            <div style={{ padding: '8px 16px', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '0.85rem', fontWeight: '600', color: '#A1A1AA' }}>Week 14: Apr 6 - Apr 10</div>
          </div>
        </div>

        {/* MATRIX BODY */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* LEFT COLUMN: CREWS */}
          <div style={{ width: '280px', borderRight: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0A0A0A', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: '0.75rem', fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: '1px' }}>
              Active Resources
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {crews.map(crew => (
                <div key={crew.id} style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Users size={16} color="#34D399" /> {crew.name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#A1A1AA', marginBottom: '8px' }}>{crew.type}</div>
                  <div style={{ fontSize: '0.75rem', color: '#555', fontFamily: MONO, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Truck size={13} /> {crew.equipment}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT COLUMN: TIMELINE */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
            {/* Timeline Header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', borderBottom: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0A0A0A' }}>
              {days.map(day => (
                <div key={day} style={{ padding: '16px', fontSize: '0.85rem', fontWeight: '600', color: '#A1A1AA', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
                  {day}
                </div>
              ))}
            </div>

            {/* Timeline Grid: one row per crew, one cell per day */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {crews.map(crew => (
                <div key={crew.id} style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(200px, 1fr))', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  {days.map(day => {
                    const cellProjects = assignedProjects.filter(p => p.crewId === crew.id && p.day === day);
                    return (
                      <DroppableCell key={`${crew.id}-${day}`} crewId={crew.id} day={day}>
                        {cellProjects.map(p => (
                          <DraggableAssignedChip key={p.id} proj={p} onEditHours={handleEditHours} />
                        ))}
                      </DroppableCell>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* BOTTOM DRAWER: UNASSIGNED QUEUE (droppable) */}
        <div style={{ height: '140px', borderTop: '1px solid rgba(255,255,255,0.06)', backgroundColor: '#0A0A0A', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.75rem', fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Holding Pen: Unassigned Projects</span>
            <span style={{ color: '#FF9F0A', display: 'flex', alignItems: 'center', gap: '4px' }}><AlertTriangle size={12}/> Drag to assign</span>
          </div>
          <DroppableHoldingPen>
            {unassignedQueue.length > 0 ? (
              unassignedQueue.map(proj => <DraggableProject key={proj.id} proj={proj} />)
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', color: '#555', fontStyle: 'italic', fontSize: '0.9rem' }}>
                All projects assigned. Drag here to unassign.
              </div>
            )}
          </DroppableHoldingPen>
        </div>

      </div>

      {/* Drag overlay: floating card that follows the cursor */}
      <DragOverlay>
        {activeProject ? (
          <div style={{
            width: '260px', padding: '12px',
            backgroundColor: isActiveAssigned ? 'rgba(0, 122, 255, 0.15)' : 'rgba(255, 159, 10, 0.15)',
            border: `1px solid ${isActiveAssigned ? 'rgba(0, 122, 255, 0.6)' : 'rgba(255, 159, 10, 0.6)'}`,
            borderRadius: '8px',
            boxShadow: `0 8px 32px ${isActiveAssigned ? 'rgba(0, 122, 255, 0.25)' : 'rgba(255, 159, 10, 0.25)'}`,
            fontFamily: FONT,
          }}>
            <ProjectCardContent proj={activeProject} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
