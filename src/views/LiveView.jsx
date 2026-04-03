import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, Clock, DollarSign, AlertOctagon, Activity, Users, MapPin } from 'lucide-react';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export default function LiveView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!id) { setError('No project ID provided'); setLoading(false); return; }
    let cancelled = false;
    async function fetchProject() {
      try {
        const { data, error: fetchErr } = await supabase.from('projects').select('*').eq('id', id).single();
        if (cancelled) return;
        if (fetchErr || !data) { setError(fetchErr?.message || 'Project not found'); }
        else setProject(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchProject();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: FONT }}>
        <div style={{ animation: 'pulse 1.5s infinite', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Activity size={32} color="#007AFF" />
          <span style={{ fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.8rem', color: '#A1A1AA' }}>Loading Telemetry...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', backgroundColor: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: FONT }}>
        <div style={{ textAlign: 'center', maxWidth: '400px' }}>
          <AlertOctagon size={40} color="#FF453A" style={{ marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: '700' }}>Project Not Found</h2>
          <p style={{ color: '#A1A1AA', fontSize: '0.9rem', margin: '0 0 24px' }}>{error}</p>
          <button onClick={() => navigate('/')} style={{ padding: '10px 24px', backgroundColor: '#007AFF', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem' }}>
            <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />Back to Command Center
          </button>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const budgetAllocated = project.budget_allocated || 0;
  const budgetSpent = project.budget_spent || 0;
  const hoursEstimated = project.hours_estimated || 0;
  const hoursActual = project.hours_actual || 0;
  const budgetBurn = budgetAllocated > 0 ? Math.round((budgetSpent / budgetAllocated) * 100) : 0;
  const timeBurn = hoursEstimated > 0 ? Math.round((hoursActual / hoursEstimated) * 100) : 0;
  const statusLabel = (project.status || 'pending').toUpperCase();
  const statusColor = statusLabel === 'ACTIVE' || statusLabel === 'IN_PROGRESS' ? '#34D399' : statusLabel === 'PENDING' ? '#FF9F0A' : '#A1A1AA';

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#050505', backgroundImage: 'radial-gradient(circle at 50% -10%, #333333 0%, #050505 80%)', color: '#FFF', fontFamily: FONT, padding: '40px' }}>

      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px' }}>
        <div>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'transparent', border: 'none', color: '#007AFF', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: 0, marginBottom: '16px', fontSize: '0.9rem', fontWeight: '600' }}
          >
            <ArrowLeft size={16} /> Back to Command Center
          </button>
          <h1 style={{ margin: 0, fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.03em' }}>{project.project_name}</h1>
          <div style={{ display: 'flex', gap: '16px', marginTop: '12px', fontFamily: MONO, fontSize: '0.85rem', color: '#A1A1AA' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={14} color="#34D399"/> {project.location || 'No location set'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Users size={14} color="#007AFF"/> {project.crew_name || 'Unassigned'}</span>
            <span>ID: {project.id?.slice(0, 8)}</span>
          </div>
        </div>
        <div style={{ padding: '8px 16px', backgroundColor: `${statusColor}1A`, border: `1px solid ${statusColor}4D`, borderRadius: '8px', color: statusColor, fontWeight: '700', letterSpacing: '1px', fontSize: '0.8rem' }}>
          {statusLabel}
        </div>
      </div>

      {/* THREE PILLAR GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '24px' }}>

        {/* PILLAR 1: BUDGET BURN */}
        <Card title="Financial Health" icon={<DollarSign size={18} color="#34D399" />}>
          <div style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.03em', color: budgetBurn > 90 ? '#FF453A' : '#FFF' }}>
            ${budgetSpent.toLocaleString()} <span style={{ fontSize: '1rem', color: '#555', fontWeight: '500' }}>/ ${budgetAllocated.toLocaleString()}</span>
          </div>
          <ProgressBar progress={budgetBurn} color={budgetBurn > 90 ? '#FF453A' : '#34D399'} />
          <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#A1A1AA', display: 'flex', justifyContent: 'space-between' }}>
            <span>Burn Rate</span>
            <span style={{ fontWeight: '700', color: budgetBurn > 90 ? '#FF453A' : '#FFF' }}>{budgetBurn}%</span>
          </div>
        </Card>

        {/* PILLAR 2: TIME & STATUS */}
        <Card title="Time Allocation" icon={<Clock size={18} color="#007AFF" />}>
          <div style={{ fontSize: '2.5rem', fontWeight: '800', letterSpacing: '-0.03em', color: timeBurn > 100 ? '#FF453A' : '#FFF' }}>
            {hoursActual} <span style={{ fontSize: '1rem', color: '#555', fontWeight: '500' }}>/ {hoursEstimated} hrs</span>
          </div>
          <ProgressBar progress={timeBurn > 100 ? 100 : timeBurn} color={timeBurn > 90 ? '#FF9F0A' : '#007AFF'} />
          <div style={{ marginTop: '12px', fontSize: '0.85rem', color: '#A1A1AA', display: 'flex', justifyContent: 'space-between' }}>
            <span>Estimated Time to Complete</span>
            <span style={{ fontWeight: '700', color: '#FFF' }}>{Math.max(0, hoursEstimated - hoursActual)} hrs left</span>
          </div>
        </Card>

        {/* PILLAR 3: THE FRICTION LOG */}
        <Card title="Active Blockers" icon={<AlertOctagon size={18} color="#FF453A" />}>
          <div style={{ padding: '24px', textAlign: 'center', color: '#555', fontStyle: 'italic', fontSize: '0.9rem' }}>
            No active friction reported.
          </div>
        </Card>

      </div>
    </div>
  );
}

// UI Helpers
function Card({ title, icon, children }) {
  return (
    <div style={{ backgroundColor: '#0A0A0A', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '16px', padding: '24px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '24px' }}>
        {icon}
        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</h3>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{children}</div>
    </div>
  );
}

function ProgressBar({ progress, color }) {
  return (
    <div style={{ height: '6px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden', marginTop: '16px' }}>
      <div style={{ height: '100%', width: `${progress}%`, backgroundColor: color, transition: 'width 1s cubic-bezier(0.16, 1, 0.3, 1)' }} />
    </div>
  );
}