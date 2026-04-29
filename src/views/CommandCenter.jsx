import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { DispatchProjectDrawer } from './DispatchBoard';
import DeploymentModal from '../components/DeploymentModal';
import IntelligenceDrawer from './IntelligenceDrawer';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ── Map Config ──
const MAP_CENTER = [33.4484, -112.0740]; // Phoenix, AZ
const MAP_ZOOM = 10;
const DARK_TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

function makeGlowIcon(color) {
  return L.divIcon({
    className: '',
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};
      box-shadow:0 0 8px 4px ${color}66, 0 0 20px 8px ${color}33;
      border:2px solid rgba(255,255,255,0.25);
      animation:mapPing 2s ease-in-out infinite;
    "></div>`,
  });
}

const ICON_ACTIVE = makeGlowIcon('#007AFF');
const ICON_VAULT  = makeGlowIcon('#5AC8FA');
const ICON_DEFAULT = makeGlowIcon('#A1A1AA');

// Phoenix metro landmarks used as deterministic fallback positions
const PHX_SITES = [
  [33.4484, -112.0740], [33.6712, -112.1150], [33.3062, -111.8413], 
  [33.5092, -111.8985], [33.4152, -111.8315], [33.3528, -112.0671], 
  [33.5386, -112.1860], [33.6189, -111.7264], [33.3942, -112.1738], 
  [33.4942, -112.0424],
];

// Assigns stable coords near Phoenix when project has no lat/lng
function getProjectCoords(proj, index) {
  if (proj.lat && proj.lng) return [proj.lat, proj.lng];
  const seed = proj.id ? proj.id.charCodeAt(0) + proj.id.charCodeAt(1) : index;
  const base = PHX_SITES[(seed + index) % PHX_SITES.length];
  const jitterLat = ((seed * 7 + index * 3) % 50 - 25) * 0.001;
  const jitterLng = ((seed * 11 + index * 7) % 50 - 25) * 0.001;
  return [base[0] + jitterLat, base[1] + jitterLng];
}

function getMarkerIcon(status) {
  const s = (status || '').toLowerCase();
  if (s === 'active' || s === 'dispatched' || s === 'in_progress') return ICON_ACTIVE;
  if (s === 'pending' || s === 'unassigned' || s === 'field_complete') return ICON_VAULT;
  return ICON_DEFAULT;
}

const inputStyle = {
  width: '100%', backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-subtle)',
  padding: '12px', borderRadius: '8px', color: '#fff', outline: 'none', boxSizing: 'border-box',
};

export default function CommandCenter({ profile, projects, teamMembers, onProjectSelect, onCreateProject, onArchiveProject, onProjectUpdate }) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [feeType, setFeeType] = useState('lump_sum');
  const [contractFee, setContractFee] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [hideFinancials, setHideFinancials] = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);
  const [newItemText, setNewItemText] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [drawerProject, setDrawerProject] = useState(null);
  const [isIntelOpen, setIsIntelOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(null);

  const [isDeploying, setIsDeploying] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };
  const [activeTab, setActiveTab] = useState('operations');
  const [teamRoster, setTeamRoster] = useState([]);

  useEffect(() => { fetchTeam(); }, []);

  const fetchTeam = async () => {
    const { data, error } = await supabase.from('user_profiles').select('id, first_name, last_name, email, role').eq('firm_id', profile?.firm_id);
    if (!error && data && data.length > 0) { setTeamRoster(data); } 
    else {
      setTeamRoster([
        { id: 'mock-1', first_name: 'Theo', last_name: 'Bower', email: 'theo@surveyos.com', role: 'admin' },
        { id: 'mock-2', first_name: 'Marcus', last_name: 'Rivera', email: 'marcus@surveyos.com', role: 'pm' },
      ]);
    }
  };

  const isAdminOrOwner = profile?.role === 'admin' || profile?.role === 'owner' || profile?.role === 'pm';

  // ─── Queue segmentation ───────────────────────────────────────
  // 'active'  → pending / in_progress / scheduled (operational)
  // 'review'  → completed_at set, reviewed_at null (PM approval inbox)
  // 'done'    → reviewed_at set OR archived (read-only history)
  const [queueTab, setQueueTab] = useState('active');

  const allMatchSearch = (proj) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (proj?.project_name || '').toLowerCase().includes(q) || (proj?.id || '').toLowerCase().includes(q);
  };

  const activeProjects = useMemo(() => (projects || []).filter(p => {
    if (p.status === 'archived') return false;
    if (p.status === 'completed') return false;
    if (p.reviewed_at) return false;
    return allMatchSearch(p);
  }), [projects, searchQuery]);

  const reviewProjects = useMemo(() => (projects || []).filter(p => {
    if (p.status === 'archived') return false;
    if (!p.completed_at) return false;
    if (p.reviewed_at) return false;
    return allMatchSearch(p);
  }), [projects, searchQuery]);

  const doneProjects = useMemo(() => (projects || []).filter(p => {
    if (p.reviewed_at || p.status === 'archived') return allMatchSearch(p);
    return false;
  }), [projects, searchQuery]);

  const filteredProjects =
    queueTab === 'review' ? reviewProjects :
    queueTab === 'done' ? doneProjects :
    activeProjects;

  const [manifest, setManifest] = useState({ 'Total Station': false, 'GNSS Rover': false, 'Base Station': false, 'Data Collector': false, 'Drone / UAV': false });

  return (
    <div style={{ width: '100%', maxWidth: '100%', animation: 'fadeIn 0.5s ease-out' }}>

      {/* HEADER */}
      <div style={{ padding: '30px', background: 'linear-gradient(135deg, var(--brand-teal) 0%, #062C2C 100%)', borderRadius: '16px', marginBottom: '40px', border: '1px solid var(--brand-teal-light)', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <h2 style={{ margin: 0, fontSize: '1.8em', letterSpacing: '-0.5px' }}>
          {(() => {
            const h = new Date().getHours();
            return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
          })()}, {profile?.first_name || 'Operator'}.
        </h2>
        <p style={{ margin: '10px 0 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '1em' }}>System Online. {projects?.length || 0} active projects in the network.</p>
      </div>

      {/* TAB BAR */}
      {isAdminOrOwner && (
        <div style={{ display: 'flex', gap: '4px', marginBottom: '30px', backgroundColor: 'var(--bg-surface)', padding: '4px', borderRadius: '10px', width: 'fit-content', border: '1px solid var(--border-subtle)' }}>
          <button onClick={() => setActiveTab('operations')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85em', backgroundColor: activeTab === 'operations' ? 'var(--brand-teal)' : 'transparent', color: activeTab === 'operations' ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s ease' }}>Operations</button>
          <button onClick={() => setActiveTab('team')} style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600', fontSize: '0.85em', backgroundColor: activeTab === 'team' ? 'var(--brand-teal)' : 'transparent', color: activeTab === 'team' ? '#fff' : 'var(--text-muted)', transition: 'all 0.2s ease' }}>Team Directory</button>
        </div>
      )}

      {/* OPERATIONS VIEW */}
      {activeTab === 'operations' && <>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by project name or ID..." style={{ ...inputStyle, flex: 1, padding: '14px 16px', fontSize: '0.95em', borderRadius: '10px' }} />
          <button onClick={() => setIsDeploying(true)} style={{ padding: '14px 20px', borderRadius: '10px', border: 'none', backgroundColor: 'var(--brand-teal)', color: '#fff', fontWeight: '700', fontSize: '0.85em', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'transform 0.2s ease', boxShadow: '0 4px 15px rgba(13, 79, 79, 0.3)' }} onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.03)'} onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>+ New Deployment</button>
        </div>

        <style>{`
          @keyframes mapPing { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.7;transform:scale(1.3)} }
          .leaflet-popup-content-wrapper{background:#141414!important;color:#fff!important;border-radius:12px!important;border:1px solid rgba(255,255,255,0.08)!important;box-shadow:0 10px 40px rgba(0,0,0,0.5)!important}
          .leaflet-popup-tip{background:#141414!important}
          .leaflet-popup-close-button{color:#555!important; display:none;}
        `}</style>

        {/* ══════════ THE DESKTOP GRID FIX ══════════ */}
        <div className="desktop-grid">
          
          {/* GOD'S EYE MAP */}
          <div style={{ borderRadius: '16px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', height: '600px' }}>
            <MapContainer center={MAP_CENTER} zoom={MAP_ZOOM} scrollWheelZoom={true} style={{ height: '100%', width: '100%', zIndex: 1 }}>
              <TileLayer url={DARK_TILES} attribution={TILE_ATTR} />
              {(projects || []).map((proj, idx) => {
                const coords = getProjectCoords(proj, idx);
                return (
                  <Marker key={proj?.id || idx} position={coords} icon={getMarkerIcon(proj?.status)}>
                    <Popup>
                      <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif", minWidth: '180px' }}>
                        <strong style={{ display: 'block', fontSize: '0.95em', marginBottom: '4px', color: '#fff' }}>{proj?.project_name}</strong>
                        <span style={{ display: 'block', fontSize: '0.72em', color: '#666', fontFamily: "'JetBrains Mono', monospace", marginBottom: '10px' }}>{proj?.id ? proj.id.substring(0, 8).toUpperCase() : '---'}</span>
                        <button onClick={() => { setSelectedProjectId(proj?.id); setIsIntelOpen(true); }} style={{ width: '100%', padding: '8px', backgroundColor: '#007AFF', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8em', fontWeight: '700', cursor: 'pointer' }}>Select</button>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>

          {/* PROJECT LIST */}
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden', display: 'flex', flexDirection: 'column', height: '600px' }}>
            {/* Segmented control — Active / Review / Done */}
            <div style={{ padding: '12px', borderBottom: '1px solid var(--border-subtle)', backgroundColor: 'rgba(0,0,0,0.2)', display: 'flex', gap: '6px' }}>
              {[
                { key: 'active', label: 'Active', count: activeProjects.length, accent: 'var(--brand-teal)' },
                { key: 'review', label: 'Review', count: reviewProjects.length, accent: 'var(--brand-amber, #D4912A)' },
                { key: 'done', label: 'Done', count: doneProjects.length, accent: 'var(--text-muted)' },
              ].map(tab => {
                const active = queueTab === tab.key;
                const showBadge = tab.key === 'review' && tab.count > 0;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setQueueTab(tab.key)}
                    style={{
                      flex: 1,
                      padding: '10px 8px',
                      borderRadius: '8px',
                      border: `1px solid ${active ? tab.accent : 'rgba(255,255,255,0.06)'}`,
                      backgroundColor: active ? (tab.key === 'review' ? 'rgba(212, 145, 42, 0.12)' : 'rgba(13, 79, 79, 0.15)') : 'transparent',
                      color: active ? '#fff' : 'var(--text-muted)',
                      fontSize: '0.78em',
                      fontWeight: '700',
                      letterSpacing: '0.02em',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      transition: 'all 0.15s',
                    }}
                  >
                    {tab.label}
                    <span style={{
                      fontSize: '0.72em',
                      padding: '2px 7px',
                      borderRadius: '999px',
                      backgroundColor: showBadge ? tab.accent : 'rgba(255,255,255,0.08)',
                      color: showBadge ? '#fff' : 'var(--text-muted)',
                      fontWeight: '800',
                      minWidth: '18px',
                      textAlign: 'center',
                    }}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {filteredProjects.map((proj) => {
                const isSelected = drawerProject?.id === proj.id;
                return (
                  <div key={proj.id} onClick={() => setDrawerProject(proj)} style={{ padding: '16px', cursor: 'pointer', borderLeft: isSelected ? '3px solid var(--brand-teal)' : '3px solid transparent', backgroundColor: isSelected ? 'rgba(13, 79, 79, 0.08)' : 'transparent', borderBottom: '1px solid var(--border-subtle)', transition: 'all 0.15s' }} onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'; }} onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                    <strong style={{ display: 'block', fontSize: '0.9em', color: isSelected ? '#fff' : 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: '6px' }}>{proj.project_name}</strong>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>{proj.scheduled_date || 'TBD'}</span>
                      <span style={{ fontSize: '0.65em', fontWeight: '700', padding: '4px 8px', borderRadius: '4px', backgroundColor: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{proj.status}</span>
                    </div>
                  </div>
                );
              })}
              {filteredProjects.length === 0 && <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85em', fontStyle: 'italic' }}>No projects found.</div>}
            </div>
          </div>

        </div>
      </>}

      <DispatchProjectDrawer
        project={drawerProject}
        crewLookup={teamMembers || []}
        allProjects={projects || []}
        displayCrews={(teamMembers || []).filter(m => ['field_crew','technician','party_chief'].includes((m.role || '').toLowerCase()))}
        supabase={supabase}
        profile={profile}
        canEdit={isAdminOrOwner}
        isMobile={false}
        onProjectUpdate={(id, patch) => {
          setDrawerProject(prev => prev && prev.id === id ? { ...prev, ...patch } : prev);
          onProjectUpdate && onProjectUpdate(id, patch);
          // Also fire the actual DB write — CommandCenter doesn't have a
          // persist helper like DispatchBoard, so we do the write inline.
          if (supabase) {
            supabase.from('projects').update(patch).eq('id', id).then(({ error }) => {
              if (error) {
                console.error('[CommandCenter] patch failed', { id, patch, error });
                alert(`Save failed: ${error.message || 'unknown error'}`);
              }
            });
          }
        }}
        onClose={() => setDrawerProject(null)}
      />
      <IntelligenceDrawer isOpen={isIntelOpen} onClose={() => { setIsIntelOpen(false); setSelectedProjectId(null); }} projectId={selectedProjectId} />
      <DeploymentModal isOpen={isDeploying} onClose={() => setIsDeploying(false)} teamMembers={teamMembers} profile={profile} onDispatch={async (data) => { const newProject = await onCreateProject(data); if (newProject?.id) showToast('Dispatch initialized — project added to Holding Queue'); else showToast('Dispatch failed — please retry'); setIsDeploying(false); }} />

      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, padding: '14px 28px', borderRadius: '14px', backgroundColor: '#141414', border: '1px solid rgba(50, 215, 75, 0.2)', color: '#32D74B', fontSize: '0.88rem', fontWeight: '600', boxShadow: '0 12px 40px rgba(0,0,0,0.5)', animation: 'fadeIn 0.3s ease-out' }}>{toast}</div>
      )}
    </div>
  );
}