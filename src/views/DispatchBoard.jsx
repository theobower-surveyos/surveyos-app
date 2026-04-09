import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function DispatchBoard({ projects = [], teamMembers = [] }) {
  const navigate = useNavigate();
  
  // Date Engine
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const getStartOfWeek = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(d.setDate(diff));
  };

  const startOfWeek = getStartOfWeek(currentDate);
  const weekDates = Array.from({ length: 5 }).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(d.getDate() + i);
    return d;
  });

  const nextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(currentDate.getDate() + 7);
    setCurrentDate(next);
  };

  const prevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(currentDate.getDate() - 7);
    setCurrentDate(prev);
  };

  // Mock Crews (Fallback if database is empty)
  const crews = teamMembers.filter(m => m.role === 'field_crew').length > 0 
    ? teamMembers.filter(m => m.role === 'field_crew') 
    : [
        { id: 'crew-alpha', first_name: 'Crew Alpha (Robotic)' },
        { id: 'crew-bravo', first_name: 'Crew Bravo (GNSS)' },
        { id: 'crew-charlie', first_name: 'Crew Charlie (Drone)' }
      ];

  const formatDate = (date) => date.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
  const formatMonth = (date) => date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div style={{ width: '100%', maxWidth: '1600px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>
      
      {/* ══════════ CSS ENGINE ══════════ */}
      <style>{`
        .dispatch-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .glass-panel { background: rgba(15, 110, 86, 0.05); border: 1px solid rgba(15, 110, 86, 0.2); backdrop-filter: blur(10px); border-radius: 16px; padding: 24px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
        .grid-header { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 1px; color: var(--text-muted); font-weight: 700; padding: 12px; border-bottom: 1px solid var(--border-subtle); }
        .grid-cell { padding: 12px; border-bottom: 1px solid rgba(255,255,255,0.05); border-right: 1px solid rgba(255,255,255,0.05); min-height: 100px; }
        .job-card { background: rgba(13, 79, 79, 0.4); border: 1px solid var(--brand-teal); border-radius: 8px; padding: 8px 12px; cursor: pointer; transition: all 0.2s; margin-bottom: 8px; }
        .job-card:hover { transform: translateY(-2px); box-shadow: 0 4px 12px rgba(13, 79, 79, 0.4); background: rgba(13, 79, 79, 0.6); }
        
        /* Mobile vs Desktop Switch */
        .dispatch-desktop { display: block; }
        .dispatch-mobile { display: none; }
        
        @media (max-width: 768px) {
          .dispatch-desktop { display: none; }
          .dispatch-mobile { display: block; }
          .dispatch-header { flex-direction: column; align-items: flex-start; gap: 16px; }
        }
      `}</style>

      {/* ══════════ HEADER CONTROLS ══════════ */}
      <div className="dispatch-header">
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2.2em', fontWeight: '800' }}>Dispatch Operations</h1>
          <span style={{ color: 'var(--brand-teal)', fontWeight: 'bold', letterSpacing: '1px' }}>{formatMonth(startOfWeek).toUpperCase()}</span>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <button onClick={prevWeek} style={{ padding: '8px 16px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', borderRight: '1px solid var(--border-subtle)' }}>← Prev</button>
            <div style={{ padding: '8px 16px', color: 'var(--text-muted)', fontSize: '0.9em', fontWeight: '600' }}>Week of {startOfWeek.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}</div>
            <button onClick={nextWeek} style={{ padding: '8px 16px', background: 'none', border: 'none', color: '#fff', cursor: 'pointer', borderLeft: '1px solid var(--border-subtle)' }}>Next →</button>
          </div>
          <button onClick={() => navigate('/')} style={{ backgroundColor: 'var(--brand-teal)', color: '#fff', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer' }}>
            + Assign Crew
          </button>
        </div>
      </div>

      {/* ══════════ DESKTOP VIEW: RESOURCE MATRIX ══════════ */}
      <div className="dispatch-desktop glass-panel">
        <div style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px 8px 0 0' }}>
          <div className="grid-header" style={{ borderRight: '1px solid var(--border-subtle)' }}>Resource / Crew</div>
          {weekDates.map((date, i) => (
            <div key={i} className="grid-header" style={{ borderRight: i === 4 ? 'none' : '1px solid var(--border-subtle)' }}>
              {formatDate(date)}
            </div>
          ))}
        </div>

        {crews.map((crew, crewIdx) => (
          <div key={crew.id} style={{ display: 'grid', gridTemplateColumns: '200px repeat(5, 1fr)' }}>
            {/* Crew Name Column */}
            <div className="grid-cell" style={{ display: 'flex', alignItems: 'center', fontWeight: '600', color: '#fff', borderRight: '1px solid var(--border-subtle)', backgroundColor: 'rgba(255,255,255,0.02)' }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--brand-teal)', marginRight: '10px' }}></div>
              {crew.first_name}
            </div>

            {/* Days Columns */}
            {weekDates.map((date, dateIdx) => {
              // Note: In production, filter projects by scheduled_date === date AND assigned_crew === crew.id
              // For UI mock, we will randomly assign the unassigned projects to show the UI
              const daysProjects = projects.filter(p => p.status !== 'completed').slice(0, (crewIdx + dateIdx) % 3 === 0 ? 1 : 0);

              return (
                <div key={dateIdx} className="grid-cell" style={{ borderRight: dateIdx === 4 ? 'none' : '1px solid var(--border-subtle)' }}>
                  {daysProjects.map((proj, i) => (
                    <div key={i} className="job-card" onClick={() => navigate(`/project/${proj.id}`)}>
                      <div style={{ fontSize: '0.85em', fontWeight: '600', color: '#fff', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.project_name}</div>
                      <div style={{ fontSize: '0.7em', color: 'var(--brand-teal)', textTransform: 'uppercase' }}>{proj.status}</div>
                    </div>
                  ))}
                  {daysProjects.length === 0 && (
                    <div style={{ color: 'rgba(255,255,255,0.1)', fontSize: '0.8em', textAlign: 'center', marginTop: '20px' }}>Open</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* ══════════ MOBILE VIEW: VERTICAL AGENDA ══════════ */}
      <div className="dispatch-mobile">
        {weekDates.map((date, i) => (
          <div key={i} style={{ marginBottom: '24px' }}>
            <div style={{ borderBottom: '1px solid var(--brand-teal)', paddingBottom: '8px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2em' }}>{date.toLocaleDateString('en-US', { weekday: 'long' })}</h3>
              <span style={{ color: 'var(--brand-teal)', fontSize: '0.85em', fontWeight: 'bold' }}>{date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {/* Fallback mock UI for mobile agenda */}
              <div className="glass-panel" style={{ padding: '16px' }} onClick={() => navigate('/project/demo')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <span style={{ display: 'inline-block', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(52, 211, 153, 0.2)', color: '#34D399', fontSize: '0.7em', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '8px' }}>Staking</span>
                    <div style={{ fontWeight: '700', color: '#fff', fontSize: '1.1em' }}>Vistancia Parcel 7B</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontSize: '0.75em', color: 'var(--text-muted)' }}>Assigned</span>
                    <span style={{ color: 'var(--brand-amber)', fontWeight: 'bold', fontSize: '0.9em' }}>Crew Alpha</span>
                  </div>
                </div>
                <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                  📍 28411 N 124th Dr, Peoria, AZ
                </div>
              </div>

              {i % 2 !== 0 && (
                 <div className="glass-panel" style={{ padding: '16px', borderStyle: 'dashed' }}>
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9em' }}>No additional dispatches scheduled.</div>
                 </div>
              )}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}