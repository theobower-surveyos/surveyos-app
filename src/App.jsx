import React, { useState, useEffect, Component } from 'react'
import { supabase } from './supabaseClient'
import Auth from './Auth'
import TodaysWork from './views/TodaysWork'
import CommandCenter from './views/CommandCenter'
import LiveCADViewer from './components/LiveCADViewer'
import ClientPortal from './views/ClientPortal'
import NetworkOps from './views/NetworkOps'
import './index.css' // <--- CRITICAL: Imports your new Design Tokens

const FIRM_TOLERANCES = { staking: { horizontal: 0.11, vertical: 0.08 }, control_topo: { horizontal: 0.13, vertical: 0.08 } };

// Error Boundary ensures a math error doesn't kill the whole app
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
  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('share');

  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [currentNav, setCurrentNav] = useState('command_center');
  const [selectedProject, setSelectedProject] = useState(null);
  const [surveyPoints, setSurveyPoints] = useState([]);
  
  // App States
  const [isUploading, setIsUploading] = useState(false);
  const [clientProject, setClientProject] = useState(null);
  const [clientPoints, setClientPoints] = useState([]);
  const [projectPhotos, setProjectPhotos] = useState([]);

  useEffect(() => {
    if (shareId) fetchClientData(shareId);
    else {
      supabase.auth.getSession().then(({ data: { session } }) => { setSession(session); if (session) fetchDashboardData(session.user.id); });
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session);
        if (session) fetchDashboardData(session.user.id);
        else { setProfile(null); setProjects([]); setSelectedProject(null); }
      });
      return () => subscription.unsubscribe();
    }
  }, [shareId]);

  // Real-time Listeners
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
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'projects', filter: `id=eq.${targetId}` }, (payload) => {
            setSelectedProject(payload.new);
        }).subscribe();

      return () => { supabase.removeChannel(pointsChannel); supabase.removeChannel(projectChannel); }
    }
  }, [selectedProject?.id, shareId]);

  async function fetchDashboardData(userId) {
    const { data: profileData } = await supabase.from('user_profiles').select('role, first_name, firm_id, firms(name)').eq('id', userId).single();
    if (profileData) {
      setProfile(profileData);
      const { data: teamData } = await supabase.from('user_profiles').select('*').eq('firm_id', profileData.firm_id);
      if (teamData) setTeamMembers(teamData);
    }
    const { data: projectsData } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
    if (projectsData) setProjects(projectsData);
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

  async function handleCreateProject(projectData) {
    const { error } = await supabase.from('projects').insert([{
      firm_id: profile.firm_id,
      project_name: projectData.project_name,
      fee_type: projectData.fee_type,
      contract_fee: projectData.contract_fee,
      scheduled_date: projectData.scheduled_date,
      assigned_crew: projectData.assigned_crew,
      assigned_to: projectData.assigned_to,
      hide_financials: projectData.hide_financials,
      scope_checklist: projectData.scope_checklist,
      required_equipment: projectData.required_equipment,
      status: 'pending',
    }]);
    if (!error) fetchDashboardData(session.user.id);
  }

  if (shareId) return <ClientPortal project={clientProject} points={clientPoints} photos={projectPhotos} />;
  if (!session) return <Auth />;

  return (
    <ErrorBoundary>
      <div className="app-layout" style={{ 
        display: 'flex', 
        minHeight: '100vh', 
        backgroundColor: 'var(--bg-dark)', 
        color: 'var(--text-main)',
        overflowX: 'hidden'
      }}>
        
        {/* MODE 2 SIDEBAR: High Contrast, Technical Feel */}
        <div className="sidebar" style={{ 
          width: '260px', 
          backgroundColor: 'var(--bg-surface)', 
          display: 'flex', 
          flexDirection: 'column', 
          padding: '24px', 
          borderRight: '1px solid var(--border-subtle)',
          boxSizing: 'border-box'
        }}>
          <h2 style={{ 
            color: 'var(--brand-amber)', 
            margin: '0 0 40px 0', 
            fontSize: '1.4em', 
            letterSpacing: '1px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px' 
          }}>
            <div style={{ width: '28px', height: '28px', backgroundColor: 'var(--brand-teal)', borderRadius: '6px', border: '1px solid var(--brand-amber)' }}></div> 
            SURVEYOS
          </h2>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <button onClick={() => { setCurrentNav('command_center'); setSelectedProject(null); }} style={{ 
              textAlign: 'left', padding: '12px 16px', borderRadius: '8px', border: 'none', 
              backgroundColor: currentNav === 'command_center' && !selectedProject ? 'var(--brand-teal)' : 'transparent', 
              color: currentNav === 'command_center' && !selectedProject ? '#fff' : 'var(--text-muted)', 
              cursor: 'pointer', fontWeight: '600', transition: '0.2s' 
            }}>📊 Command Center</button>

            <button onClick={() => { if(selectedProject) setCurrentNav('live_view'); else alert('Select project in Command Center.'); }} style={{ 
              textAlign: 'left', padding: '12px 16px', borderRadius: '8px', border: 'none', 
              backgroundColor: currentNav === 'live_view' || selectedProject ? 'var(--brand-teal)' : 'transparent', 
              color: currentNav === 'live_view' || selectedProject ? '#fff' : 'var(--text-muted)', 
              cursor: 'pointer', fontWeight: '600', transition: '0.2s', opacity: selectedProject ? 1 : 0.4 
            }}>📡 Live Field View</button>

            <button onClick={() => setCurrentNav('network_ops')} style={{ 
              textAlign: 'left', padding: '12px 16px', borderRadius: '8px', border: 'none', 
              backgroundColor: currentNav === 'network_ops' ? 'var(--brand-teal)' : 'transparent', 
              color: currentNav === 'network_ops' ? '#fff' : 'var(--text-muted)', 
              cursor: 'pointer', fontWeight: '600', transition: '0.2s' 
            }}>🌐 Network Ops</button>
          </div>
          
          <div style={{ flex: 1 }}></div>
          
          <div style={{ padding: '15px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px', marginBottom: '20px' }}>
            <span style={{ fontSize: '0.8em', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>OPERATOR</span>
            <strong style={{ fontSize: '0.95em', color: 'var(--brand-amber)' }}>{profile?.first_name || 'Guest User'}</strong>
          </div>

          <button onClick={() => supabase.auth.signOut()} style={{ 
            padding: '12px', backgroundColor: 'transparent', color: 'var(--error)', border: '1px solid var(--error)', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' 
          }}>Sign Out System</button>
        </div>

        {/* MAIN DISPLAY AREA */}
        <div className="main-content" style={{ flex: 1, padding: '40px', overflowY: 'auto', boxSizing: 'border-box' }}>
          
          {currentNav === 'command_center' && !selectedProject && (
            <CommandCenter profile={profile} projects={projects} teamMembers={teamMembers} onProjectSelect={(proj) => { setSelectedProject(proj); setCurrentNav('live_view'); }} onCreateProject={handleCreateProject} />
          )}

          {currentNav === 'network_ops' && (
            <NetworkOps supabase={supabase} profile={profile} teamMembers={teamMembers} />
          )}

          {(currentNav === 'live_view' || selectedProject) && selectedProject && (
            <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '20px' }}>
                <div>
                  <h1 style={{ margin: '0 0 8px 0', fontSize: '2.2em', fontWeight: '800', letterSpacing: '-0.5px' }}>{selectedProject.project_name}</h1>
                  <span style={{ fontSize: '0.95em', color: 'var(--brand-amber)', fontWeight: 'bold', fontFamily: 'monospace' }}>ID: {selectedProject.id.substring(0,8).toUpperCase()}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                   <span style={{ display: 'block', fontSize: '0.85em', color: 'var(--text-muted)', marginBottom: '4px' }}>STATUS</span>
                   <span style={{ padding: '6px 14px', backgroundColor: 'var(--brand-teal)', borderRadius: '4px', fontWeight: 'bold', fontSize: '0.9em' }}>{String(selectedProject.status).toUpperCase()}</span>
                </div>
              </div>

              {/* LIVE CAD DISPLAY */}
              <div style={{ marginBottom: '40px', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-subtle)', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>
                <LiveCADViewer points={[...(surveyPoints || [])].reverse()} />
              </div>

              {/* FIELD TOOLS */}
              {selectedProject.status !== 'completed' && (
                <TodaysWork supabase={supabase} project={selectedProject} profile={profile} onSyncComplete={() => { fetchSurveyPoints(selectedProject.id); fetchProjectPhotos(selectedProject.id); }} />
              )}

              {/* DATA TABLE (The Precision Engine) */}
              <div style={{ marginTop: '40px', backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
                <h3 style={{ margin: '0 0 20px 0', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  📐 Coordinate Audit Log (Mode 2)
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '2px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        <th style={{ padding: '12px' }}>Point</th>
                        <th style={{ padding: '12px' }}>Northing (Y)</th>
                        <th style={{ padding: '12px' }}>Easting (X)</th>
                        <th style={{ padding: '12px' }}>Elevation (Z)</th>
                        <th style={{ padding: '12px' }}>Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(surveyPoints || []).map((p, index) => (
                        <tr key={p?.id || index} style={{ borderBottom: '1px solid var(--border-subtle)', transition: '0.2s' }}>
                          <td style={{ padding: '12px', fontWeight: 'bold', color: 'var(--brand-amber)' }}>{p?.point_number || '-'}</td>
                          {/* APPLYING TABULAR TYPOGRAPHY HERE */}
                          <td className="coordinate-data" style={{ padding: '12px' }}>{Number(p?.northing || 0).toFixed(3)}</td>
                          <td className="coordinate-data" style={{ padding: '12px' }}>{Number(p?.easting || 0).toFixed(3)}</td>
                          <td className="coordinate-data" style={{ padding: '12px' }}>{Number(p?.elevation || 0).toFixed(3)}</td>
                          <td style={{ padding: '12px', color: 'var(--text-muted)', fontSize: '0.9em' }}>{p?.description || 'N/A'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
}