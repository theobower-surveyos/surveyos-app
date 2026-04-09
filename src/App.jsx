import React, { useState, useEffect, Component } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import TodaysWork from './views/TodaysWork'
import CommandCenter from './views/CommandCenter'
import LiveCADViewer from './components/LiveCADViewer'
import ClientPortal from './views/ClientPortal'
import NetworkOps from './views/NetworkOps'
import './index.css'
import MorningBrief from './views/MorningBrief';
import EquipmentLogistics from './views/EquipmentLogistics'
import Roster from './views/Roster'
import ProjectVault from './views/ProjectVault'
import DispatchBoard from './views/DispatchBoard'
import FieldLogs from './views/FieldLogs'
import ProfitAnalytics from './views/ProfitAnalytics'
import LiveView from './views/LiveView';
import MobileCrewView from './views/MobileCrewView';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', backgroundColor: 'var(--error)', color: '#fff', borderRadius: '8px', margin: '20px', fontFamily: 'monospace' }}>
          <h2>🚨 System Exception Prevented</h2>
          <div style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '15px', border: '1px solid rgba(255,255,255,0.2)' }}>{this.state.error?.message}</div>
          <button onClick={() => window.location.reload()} style={{ marginTop: '20px', padding: '10px 20px', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Restart SurveyOS</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('share');

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [surveyPoints, setSurveyPoints] = useState([]);
  const [hasReadBrief, setHasReadBrief] = useState(false);

  const [loading, setLoading] = useState(true);
  const [clientProject, setClientProject] = useState(null);
  const [clientPoints, setClientPoints] = useState([]);
  const [projectPhotos, setProjectPhotos] = useState([]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(r => console.log('Offline Engine Active:', r.scope)).catch(e => console.log('Offline Engine Failed:', e));
      });
    }
  }, []);

  // ══════════ THE SAFETY NET FETCH ══════════
  async function fetchDashboardData(userId) {
    if (!userId) { setLoading(false); return; }
    let profileLoaded = false;
    try {
      const { data: profileData } = await supabase.from('user_profiles').select('role, first_name, firm_id').eq('id', userId).single();
      if (profileData) {
        setProfile(profileData);
        profileLoaded = true;
        const { data: teamData } = await supabase.from('user_profiles').select('*').eq('firm_id', profileData.firm_id);
        if (teamData) setTeamMembers(teamData);
      }
      const { data: projectsData } = await supabase.from('projects').select('*').neq('status', 'archived').order('created_at', { ascending: false });
      if (projectsData) setProjects(projectsData);
    } catch (err) { 
      console.error('[App] error:', err); 
    } finally { 
      // Force app boot if Supabase profile table is empty or delayed
      if (!profileLoaded) setProfile({ role: 'admin', first_name: 'Founder', firm_id: null });
      setLoading(false); 
    }
  }

  useEffect(() => {
    if (shareId) { fetchClientData(shareId); setLoading(false); }
    else {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setSession(session);
        if (session) fetchDashboardData(session.user.id);
        else setLoading(false);
      });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        if (session) fetchDashboardData(session.user.id);
        else { setProfile(null); setProjects([]); setSelectedProject(null); setLoading(false); }
      });
      return () => subscription.unsubscribe();
    }
  }, [shareId]);

  useEffect(() => {
    const targetId = shareId || selectedProject?.id;
    if (targetId) {
      if (!shareId) { fetchSurveyPoints(targetId); fetchProjectPhotos(targetId); }
      const pointsChannel = supabase.channel('live-points')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'survey_points', filter: `project_id=eq.${targetId}` }, (payload) => {
            if (shareId) setClientPoints((c) => [payload.new, ...(c || [])]);
            else setSurveyPoints((c) => [payload.new, ...(c || [])]);
        }).subscribe();
      const projectChannel = supabase.channel('live-project')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${targetId}` }, (payload) => setSelectedProject(payload.new)).subscribe();
      return () => { supabase.removeChannel(pointsChannel); supabase.removeChannel(projectChannel); }
    }
  }, [selectedProject?.id, shareId]);

  async function fetchClientData(shareId) {
    const { data: tokenData } = await supabase.from('share_tokens').select('project_id').eq('token', shareId).eq('is_active', true).single();
    const projectId = tokenData?.project_id || shareId;
    const { data: projectData } = await supabase.from('projects').select('*').eq('id', projectId).single();
    if (projectData) {
      setClientProject(projectData);
      const { data: pts } = await supabase.from('survey_points').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
      if (pts) setClientPoints(pts);
      fetchProjectPhotos(projectId);
    }
  }

  async function fetchSurveyPoints(projectId) {
    const { data } = await supabase.from('survey_points').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    if (data) setSurveyPoints(data);
  }

  async function fetchProjectPhotos(projectId) {
    const { data } = await supabase.storage.from('project-photos').list(projectId);
    if (data) {
      const parsedPhotos = data.filter(file => file.name !== '.emptyFolderPlaceholder').map(file => {
        const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(`${projectId}/${file.name}`);
        return { url: urlData.publicUrl, name: file.name };
      });
      setProjectPhotos(parsedPhotos);
    }
  }

  async function handleArchiveProject(projectId) {
    await supabase.from('projects').update({ status: 'archived' }).eq('id', projectId);
    setProjects(prev => prev.filter(p => p.id !== projectId));
  }

  async function handleCreateProject(projectData) {
    let assignedTo = projectData.assigned_to;
    if (assignedTo && typeof assignedTo === 'object') assignedTo = assignedTo.id;

    const { data, error } = await supabase.from('projects').insert([{
      firm_id: profile.firm_id,
      project_name: projectData.project_name,
      fee_type: projectData.fee_type || 'lump_sum',
      contract_fee: parseFloat(projectData.contract_fee) || 0,
      scheduled_date: projectData.scheduled_date || null,
      scope: Array.isArray(projectData.scope) ? projectData.scope : (projectData.scope_checklist || []),
      assigned_to: assignedTo || null,
      assigned_crew: Array.isArray(projectData.assigned_crew) ? projectData.assigned_crew : [],
      hide_financials: projectData.hide_financials || false,
      required_equipment: projectData.required_equipment || [],
      status: 'pending',
    }]).select();

    if (!error) { fetchDashboardData(session.user.id); return data?.[0] || null; }
    return null;
  }

  if (window.location.pathname === '/client') return <ClientPortal project={clientProject || { project_name: 'Client Portal', status: 'active' }} points={clientPoints || []} photos={projectPhotos || []} />;
  if (shareId) return <ClientPortal project={clientProject} points={clientPoints} photos={projectPhotos} />;
  if (!session) return <Auth />;
  if (!profile) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-dark)', color: 'var(--text-muted)' }}>Loading SurveyOS...</div>;

  const isOfficeUser = !['field_crew', 'technician', 'cad', 'drafter'].includes((profile.role || '').toLowerCase().trim());
  if (isOfficeUser && !hasReadBrief) return <ErrorBoundary><MorningBrief onProceed={() => setHasReadBrief(true)} /></ErrorBoundary>;

  const currentNav = location.pathname === '/' ? 'command_center' : location.pathname.replace('/', '').split('/')[0];
  const isMobileRoute = location.pathname.includes('/crew');

  const navBtn = (path, navKey, label, condition = true) => (
    <button onClick={() => { if (!condition) return; if (navKey === 'command_center') setSelectedProject(null); navigate(path); }} style={{ textAlign: 'left', padding: '12px 16px', borderRadius: '8px', border: 'none', backgroundColor: currentNav === navKey ? 'var(--brand-teal)' : 'transparent', color: currentNav === navKey ? '#fff' : 'var(--text-muted)', cursor: 'pointer', fontWeight: '600', opacity: condition ? 1 : 0.4 }}>{label}</button>
  );

  return (
    <ErrorBoundary>
      {/* ══════════ MASTER LAYOUT (Flex Row by default) ══════════ */}
      <div className="app-layout" style={{ display: 'flex', flexDirection: 'row', height: '100vh', width: '100vw', overflow: 'hidden', backgroundColor: 'var(--bg-dark)', color: 'var(--text-main)', fontFamily: 'Inter, sans-serif' }}>

        {/* ══════════ DESKTOP SIDEBAR ══════════ */}
        {!isMobileRoute && (
          <div className="desktop-sidebar" style={{ width: '260px', flexShrink: 0, flexDirection: 'column', backgroundColor: 'var(--bg-surface)', padding: '24px', borderRight: '1px solid var(--border-subtle)', boxSizing: 'border-box' }}>
            <h2 style={{ color: 'var(--brand-amber)', margin: '0 0 40px 0', fontSize: '1.4em', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: '28px', height: '28px', backgroundColor: 'var(--brand-teal)', borderRadius: '6px', border: '1px solid var(--brand-amber)' }}></div>
              SURVEYOS
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {navBtn('/', 'command_center', '📊 Command Center')}
              {navBtn('/dispatch', 'dispatch', '🗓️ Dispatch Board')}
              {navBtn('/live-view', 'live_view', '📡 Live Field View', !!selectedProject)}
              {navBtn('/network-ops', 'network-ops', '🌐 Network Ops')}
              {navBtn('/equipment', 'equipment', '🧰 Equipment')}
              {navBtn('/roster', 'roster', '👥 Team Roster')}
              {navBtn('/client-portal', 'client-portal', '🤝 Client Portal')}
            </div>
            <div style={{ flex: 1 }}></div>
            <div style={{ padding: '15px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.8em', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>OPERATOR</span>
              <strong style={{ fontSize: '0.95em', color: 'var(--brand-amber)' }}>{profile?.first_name || 'Guest User'}</strong>
            </div>
            <button onClick={() => supabase.auth.signOut()} style={{ padding: '12px', backgroundColor: 'transparent', color: 'var(--error)', border: '1px solid var(--error)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>Sign Out System</button>
          </div>
        )}

        {/* ══════════ MAIN CONTENT AREA ══════════ */}
        <div className="app-main-content" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflowY: 'auto', boxSizing: 'border-box' }}>
          <Routes>
            <Route path="/" element={
              <>
                <ProfitAnalytics supabase={supabase} profile={profile} activeProjects={projects.filter(p => ['scheduled','active','in_progress','pending'].includes(p.status))} />
                <CommandCenter profile={profile} projects={projects} teamMembers={teamMembers} onProjectSelect={(proj) => { setSelectedProject(proj); navigate(`/project/${proj.id}`); }} onCreateProject={handleCreateProject} onArchiveProject={handleArchiveProject} />
              </>
            } />
            <Route path="/dispatch" element={<DispatchBoard supabase={supabase} projects={projects} teamMembers={teamMembers} onRefresh={() => fetchDashboardData(session.user.id)} />} />
            <Route path="/network-ops" element={<NetworkOps supabase={supabase} profile={profile} />} />
            <Route path="/equipment" element={<EquipmentLogistics supabase={supabase} profile={profile} teamMembers={teamMembers} />} />
            <Route path="/roster" element={<Roster supabase={supabase} profile={profile} />} />
            <Route path="/client-portal" element={<ClientPortal project={selectedProject || { project_name: 'Demo Project', status: 'completed' }} points={surveyPoints || []} photos={projectPhotos || []} />} />
            
            <Route path="/live-view" element={
              selectedProject ? (
                <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
                    <div>
                      <h1 style={{ margin: '0 0 8px 0', fontSize: '2.2em', fontWeight: '800' }}>{selectedProject.project_name}</h1>
                      <span style={{ fontSize: '0.95em', color: 'var(--brand-amber)', fontWeight: 'bold', fontFamily: 'monospace' }}>ID: {selectedProject.id.substring(0,8).toUpperCase()}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                       <span style={{ display: 'block', fontSize: '0.85em', color: 'var(--text-muted)', marginBottom: '4px' }}>STATUS</span>
                       <span style={{ padding: '6px 14px', backgroundColor: 'var(--brand-teal)', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9em' }}>{String(selectedProject.status).toUpperCase()}</span>
                    </div>
                  </div>
                  <div style={{ marginBottom: '40px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}><LiveCADViewer points={[...(surveyPoints || [])].reverse()} /></div>
                  {selectedProject.status !== 'completed' && <TodaysWork supabase={supabase} project={selectedProject} profile={profile} onSyncComplete={() => { fetchSurveyPoints(selectedProject.id); fetchProjectPhotos(selectedProject.id); }} />}
                  <FieldLogs supabase={supabase} project={selectedProject} profile={profile} />
                  <div style={{ marginTop: '40px' }}><ProjectVault supabase={supabase} project={selectedProject} /></div>
                </div>
              ) : <div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center' }}>Select a project from Command Center to open Live Field View.</div>
            } />
            <Route path="/project/:id" element={<LiveView />} />
            <Route path="/dispatch/:id" element={<DispatchBoard />} />
            <Route path="/crew" element={<MobileCrewView />} />
            <Route path="*" element={<div style={{ color: 'var(--text-muted)', padding: '40px', textAlign: 'center' }}><h2>404 — Route Not Found</h2><button onClick={() => navigate('/')} style={{ marginTop: '16px', padding: '10px 24px', backgroundColor: 'var(--brand-teal)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>Back to Command Center</button></div>} />
          </Routes>
        </div>

       {/* ══════════ MOBILE BOTTOM NAVIGATION ══════════ */}
        <div className="mobile-bottom-nav" style={{ position: 'fixed', bottom: 0, left: 0, right: 0, height: '80px', backgroundColor: 'var(--bg-surface)', borderTop: '1px solid var(--border-subtle)', alignItems: 'center', zIndex: 50 }}>
          <button onClick={() => { setSelectedProject(null); navigate('/'); }} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--brand-amber)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <svg style={{ width: '24px', height: '24px', marginBottom: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path></svg>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Map</span>
          </button>
          
          <button onClick={() => navigate('/dispatch')} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
            <svg style={{ width: '24px', height: '24px', marginBottom: '4px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '600' }}>Jobs</span>
          </button>

          <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <button onClick={() => navigate('/crew')} style={{ backgroundColor: 'var(--brand-teal)', color: '#fff', padding: '12px 32px', borderRadius: '50px', fontWeight: '800', border: 'none', boxShadow: '0 4px 15px rgba(13, 79, 79, 0.4)', cursor: 'pointer' }}>
              UPLINK
            </button>
          </div>
        </div>

      </div>
    </ErrorBoundary>
  );
}