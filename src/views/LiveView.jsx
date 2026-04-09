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
      <div style={{ height: '100vh', backgroundColor: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: FONT }}>
        <div style={{ animation: 'pulse 1.5s infinite', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
          <Activity size={32} color="var(--brand-teal)" />
          <span style={{ fontWeight: 600, letterSpacing: '2px', textTransform: 'uppercase', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Establishing Uplink...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ height: '100vh', backgroundColor: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#FFF', fontFamily: FONT }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '40px', background: 'rgba(255,69,58,0.1)', borderRadius: '20px', border: '1px solid rgba(255,69,58,0.2)' }}>
          <AlertOctagon size={40} color="#FF453A" style={{ marginBottom: '16px' }} />
          <h2 style={{ margin: '0 0 8px', fontSize: '1.4rem', fontWeight: '700' }}>Telemetry Lost</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0 0 24px' }}>{error}</p>
          <button onClick={() => navigate('/')} style={{ padding: '10px 24px', backgroundColor: 'var(--brand-teal)', color: '#FFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600', fontSize: '0.9rem', transition: 'transform 0.2s' }} onMouseEnter={e => e.target.style.transform='translateY(-2px)'} onMouseLeave={e => e.target.style.transform='translateY(0)'}>
            <ArrowLeft size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} /> Return to Command
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
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-dark)', color: '#FFF', fontFamily: FONT, padding: '40px', animation: 'fadeIn 0.5s ease-out' }}>
      
      {/* ══════════ CSS ENGINE ══════════ */}
      <style>{`
        .live-glass-panel { background: rgba(20, 20, 22, 0.6); border: 1px solid rgba(255, 255, 255, 0.05); backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px); border-radius: 20px; padding: 32px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); transition: transform 0.3s ease, border-color 0.3s ease; }
        .live-glass-panel:hover { transform: translateY(-4px); border-color: rgba(255,255,255,0.1); }
        .stat-value { font-size: 3rem; font-weight: 800; letter-spacing: -0.04em; margin-bottom: 8px; line-height: 1; }
        .stat-sub { font-size: 1.1rem; color: rgba(255,255,255,0.4); font-weight: 500; }
        .progress-track { height: 8px; background-color: rgba(255,255,255,0.05); border-radius: 4px; overflow: hidden; margin: 24px 0 16px 0; box-shadow: inset 0 1px 3px rgba(0,0,0,0.3); }
        .pulse-dot { width: 8px; height: 8px; background-color: ${statusColor}; border-radius: 50%; display: inline-block; margin-right: 8px; box-shadow: 0 0 12px ${statusColor}; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(1.2); } 100% { opacity: 1; transform: scale(1); } }
      `}</style>

      {/* HEADER SECTION */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '40px', maxWidth: '1400px', margin: '0 auto 40px auto' }}>
        <div>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', padding: 0, marginBottom: '20px', fontSize: '0.9rem', fontWeight: '600', transition: 'color 0.2s' }} onMouseEnter={e => e.target.style.color='#FFF'} onMouseLeave={e => e.target.style.color='var(--text-muted)'}>
            <ArrowLeft size={16} /> Back to Command Center
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
            <h1 style={{ margin: 0, fontSize: '2.8rem', fontWeight: '800', letterSpacing: '-0.03em' }}>{project.project_name}</h1>
            <div style={{ padding: '6px 16px', backgroundColor: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.1)`, borderRadius: '20px', color: '#FFF', fontWeight: '700', letterSpacing: '1px', fontSize: '0.75rem', display: 'flex', alignItems: 'center' }}>
              <span className="pulse-dot"></span> {statusLabel}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '24px', marginTop: '16px', fontFamily: MONO, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><MapPin size={16} color="var(--brand-teal)"/> {project.location || 'Location Pending'}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Users size={16} color="var(--brand-amber)"/> {project.crew_name || 'Crew Unassigned'}</span>
            <span style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: '2px 8px', borderRadius: '4px' }}>ID: {project.id?.slice(0, 8).toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* THREE PILLAR GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* PILLAR 1: BUDGET BURN */}
        <div className="live-glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{ padding: '10px', backgroundColor: 'rgba(52, 211, 153, 0.1)', borderRadius: '12px' }}><DollarSign size={20} color="#34D399" /></div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Financial Health</h3>
          </div>
          
          <div className="stat-value" style={{ color: budgetBurn > 90 ? '#FF453A' : '#FFF' }}>
            ${budgetSpent.toLocaleString()} <span className="stat-sub">/ ${budgetAllocated.toLocaleString()}</span>
          </div>
          
          <div className="progress-track">
            <div style={{ height: '100%', width: `${Math.min(budgetBurn, 100)}%`, backgroundColor: budgetBurn > 90 ? '#FF453A' : '#34D399', transition: 'width 1.5s cubic-bezier(0.16, 1, 0.3, 1)', boxShadow: `0 0 10px ${budgetBurn > 90 ? '#FF453A' : '#34D399'}` }} />
          </div>
          
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', fontWeight: '500' }}>
            <span>Capital Burn Rate</span>
            <span style={{ fontWeight: '700', color: budgetBurn > 90 ? '#FF453A' : '#FFF' }}>{budgetBurn}%</span>
          </div>
        </div>

        {/* PILLAR 2: TIME & STATUS */}
        <div className="live-glass-panel">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{ padding: '10px', backgroundColor: 'rgba(0, 122, 255, 0.1)', borderRadius: '12px' }}><Clock size={20} color="#007AFF" /></div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Time Allocation</h3>
          </div>

          <div className="stat-value" style={{ color: timeBurn > 100 ? '#FF453A' : '#FFF' }}>
            {hoursActual} <span className="stat-sub">/ {hoursEstimated} hrs</span>
          </div>
          
          <div className="progress-track">
            <div style={{ height: '100%', width: `${Math.min(timeBurn, 100)}%`, backgroundColor: timeBurn > 90 ? '#FF9F0A' : '#007AFF', transition: 'width 1.5s cubic-bezier(0.16, 1, 0.3, 1)', boxShadow: `0 0 10px ${timeBurn > 90 ? '#FF9F0A' : '#007AFF'}` }} />
          </div>
          
          <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between', fontWeight: '500' }}>
            <span>Estimated Variance</span>
            <span style={{ fontWeight: '700', color: timeBurn > 100 ? '#FF453A' : '#FFF' }}>
              {timeBurn > 100 ? `${hoursActual - hoursEstimated} hrs over` : `${Math.max(0, hoursEstimated - hoursActual)} hrs remaining`}
            </span>
          </div>
        </div>

        {/* PILLAR 3: THE FRICTION LOG */}
        <div className="live-glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
            <div style={{ padding: '10px', backgroundColor: 'rgba(255, 69, 58, 0.1)', borderRadius: '12px' }}><AlertOctagon size={20} color="#FF453A" /></div>
            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '1px' }}>Active Blockers</h3>
          </div>
          
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.1)' }}>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: '500', fontSize: '0.95rem' }}>No active friction reported.</span>
          </div>
        </div>

      </div>
    </div>
  );
}