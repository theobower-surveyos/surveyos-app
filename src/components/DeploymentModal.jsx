import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import { UploadCloud, X, FileCheck } from 'lucide-react';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

const SCOPE_OPTIONS = [
  'Boundary',
  'Topographic',
  'ALTA/NSPS',
  'Construction Staking',
  'As-Built',
  'Control Network',
];

// Lead PM eligibility — projects.lead_pm_id may reference any user
// whose role is owner or pm in the same firm. Stage 12.1.5 confirmed
// production roles in user_profiles are field_crew / owner / pm only;
// licensed_pm / admin are aspirational labels in CLAUDE.md not yet
// represented as data.
const PM_ELIGIBLE_ROLES = ['owner', 'pm'];
const isPmEligible = (role) => PM_ELIGIBLE_ROLES.includes((role || '').toLowerCase().trim());

export default function DeploymentModal({ isOpen, onClose, teamMembers, profile, onDispatch }) {
  // Default Lead PM to the current user when they're PM-eligible
  // (owner/pm). Otherwise no default — explicit pick required so we
  // don't write a chief into the lead_pm_id column.
  const defaultLeadPmId = isPmEligible(profile?.role) ? (profile?.id || '') : '';

  const [projectName, setProjectName] = useState('');
  const [location, setLocation] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [contractFee, setContractFee] = useState('');
  const [scope, setScope] = useState([]);
  const [leadPmId, setLeadPmId] = useState(defaultLeadPmId);
  const [chiefId, setChiefId] = useState('');
  const [additionalCrew, setAdditionalCrew] = useState([]);
  const [priority, setPriority] = useState('standard');
  const [csvFile, setCsvFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileRef = useRef(null);

  const resetForm = () => {
    setProjectName('');
    setLocation('');
    setScheduledDate('');
    setContractFee('');
    setScope([]);
    setLeadPmId(defaultLeadPmId);
    setChiefId('');
    setAdditionalCrew([]);
    setPriority('standard');
    setCsvFile(null);
    setIsDragging(false);
    setIsSubmitting(false);
  };

  const handleClose = () => { resetForm(); onClose(); };

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.txt'))) setCsvFile(file);
  }, []);

  const toggleScope = (item) => {
    setScope(prev => prev.includes(item) ? prev.filter(s => s !== item) : [...prev, item]);
  };

  const toggleCrewMember = (memberId) => {
    setAdditionalCrew(prev =>
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const handleSubmit = async () => {
    if (!projectName.trim()) return;
    setIsSubmitting(true);

    // Build the clean payload — all UUIDs are raw strings.
    //
    // projects.assigned_to is the Party Chief, NOT the Lead PM.
    // For Licensed PM ownership, use projects.lead_pm_id (Stage 12.1.5).
    await onDispatch({
      project_name: projectName.trim(),
      location: location.trim() || null,
      scheduled_date: scheduledDate || new Date().toISOString().split('T')[0],
      contract_fee: parseFloat(contractFee) || 0,
      scope: scope,
      lead_pm_id: leadPmId || null,
      assigned_to: chiefId || null,
      assigned_crew: additionalCrew.length > 0 ? additionalCrew : [],
      status: 'pending',
      priority: priority,
    });

    // Upload CSV to the new project's storage folder
    if (csvFile) {
      try {
        const { data: recent } = await supabase
          .from('projects')
          .select('id')
          .eq('project_name', projectName.trim())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (recent?.id) {
          await supabase.storage.from('project-photos').upload(
            `${recent.id}/${csvFile.name}`, csvFile,
            { contentType: csvFile.type || 'text/csv', upsert: false }
          );
        }
      } catch { /* non-blocking */ }
    }

    setIsSubmitting(false);
    handleClose();
  };

  if (!isOpen) return null;

  // Filter crew members: exclude the selected chief from the additional crew list
  const availableCrew = (teamMembers || []).filter(m => m.id !== chiefId);

  return (
    <>
      {/* BACKDROP */}
      <div onClick={handleClose} style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      }} />

      {/* MODAL */}
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 1001, width: '540px', maxWidth: '92vw', maxHeight: '90vh',
        backgroundColor: 'var(--bg-dark, #0A0A0A)',
        border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        borderRadius: '24px', fontFamily: FONT,
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <h2 style={{ margin: 0, fontSize: '1.2rem', fontWeight: '700', color: '#fff', letterSpacing: '-0.02em' }}>New Deployment</h2>
          <button onClick={handleClose} style={{
            background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px',
            width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          }}>
            <X size={16} color="#A1A1AA" strokeWidth={2} />
          </button>
        </div>

        {/* Scrollable Body */}
        <div style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: '18px', overflowY: 'auto', flex: 1 }}>

          {/* CSV DROPZONE */}
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{
              border: `2px dashed ${csvFile ? '#32D74B' : isDragging ? '#007AFF' : 'rgba(255,255,255,0.12)'}`,
              borderRadius: '14px', padding: '22px', textAlign: 'center', cursor: 'pointer',
              backgroundColor: isDragging ? 'rgba(0,122,255,0.04)' : 'var(--bg-surface, #111)',
              transition: 'border-color 0.2s, background-color 0.2s',
            }}
          >
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={(e) => { if (e.target.files?.[0]) setCsvFile(e.target.files[0]); }} />
            {csvFile ? (
              <>
                <FileCheck size={24} color="#32D74B" strokeWidth={1.5} style={{ marginBottom: '6px' }} />
                <p style={{ margin: '0 0 2px', fontFamily: MONO, fontSize: '0.8rem', color: '#fff', wordBreak: 'break-all' }}>{csvFile.name}</p>
                <p style={{ margin: 0, fontSize: '0.7rem', color: '#32D74B', fontWeight: '600' }}>Ready to Deploy</p>
              </>
            ) : (
              <>
                <UploadCloud size={24} color={isDragging ? '#007AFF' : '#555'} strokeWidth={1.5} style={{ marginBottom: '6px' }} />
                <p style={{ margin: '0 0 2px', fontSize: '0.82rem', color: '#A1A1AA' }}>Drop design .csv or click to browse</p>
              </>
            )}
          </div>

          {/* PROJECT NAME */}
          <div>
            <label style={LBL}>Project Name</label>
            <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="Site address or Lot #" style={INP} />
          </div>

          {/* LEAD PM (projects.lead_pm_id — Licensed PM ownership) */}
          <div>
            <label style={LBL}>Lead PM</label>
            <select value={leadPmId} onChange={(e) => setLeadPmId(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
              <option value="">Select…</option>
              {(teamMembers || [])
                .filter((m) => isPmEligible(m.role))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email} ({m.role})
                  </option>
                ))}
            </select>
          </div>

          {/* LOCATION */}
          <div>
            <label style={LBL}>Location</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, ST or job site area" style={INP} />
          </div>

          {/* DATE + FEE — side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={LBL}>Scheduled Date</label>
              <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} style={INP} />
            </div>
            <div>
              <label style={LBL}>Contract Fee ($)</label>
              <input
                type="number" min="0" step="0.01"
                value={contractFee}
                onChange={(e) => setContractFee(e.target.value)}
                placeholder="0.00"
                style={{ ...INP, fontFamily: MONO, color: 'var(--brand-amber, #D4912A)' }}
              />
            </div>
          </div>

          {/* SCOPE CHECKLIST */}
          <div>
            <label style={LBL}>Project Scope</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {SCOPE_OPTIONS.map((item) => {
                const active = scope.includes(item);
                return (
                  <button
                    key={item} type="button" onClick={() => toggleScope(item)}
                    style={{
                      padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: '600',
                      border: `1px solid ${active ? 'var(--brand-teal, #0D4F4F)' : 'var(--border-subtle, rgba(255,255,255,0.08))'}`,
                      backgroundColor: active ? 'rgba(13, 79, 79, 0.15)' : 'transparent',
                      color: active ? 'var(--brand-teal, #0D4F4F)' : '#888',
                      cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s',
                    }}
                  >
                    {active && '\u2713 '}{item}
                  </button>
                );
              })}
            </div>
          </div>

          {/* PARTY CHIEF (projects.assigned_to)
              projects.assigned_to is the Party Chief, NOT the Lead PM.
              For Licensed PM ownership, use projects.lead_pm_id. */}
          <div>
            <label style={LBL}>Party Chief</label>
            <select value={chiefId} onChange={(e) => setChiefId(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
              <option value="">Unassigned</option>
              {(teamMembers || []).map((m) => (
                <option key={m.id} value={m.id}>
                  {`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email} ({m.role})
                </option>
              ))}
            </select>
          </div>

          {/* ADDITIONAL CREW (assigned_crew UUID array) */}
          <div>
            <label style={LBL}>Additional Crew</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {availableCrew.length === 0 ? (
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#555', fontStyle: 'italic' }}>
                  {chiefId ? 'No additional members available.' : 'Select a Party Chief first.'}
                </p>
              ) : (
                availableCrew.map((m) => {
                  const selected = additionalCrew.includes(m.id);
                  return (
                    <div
                      key={m.id}
                      onClick={() => toggleCrewMember(m.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                        border: `1px solid ${selected ? 'var(--brand-teal, #0D4F4F)' : 'var(--border-subtle, rgba(255,255,255,0.08))'}`,
                        backgroundColor: selected ? 'rgba(13, 79, 79, 0.08)' : 'transparent',
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{
                        width: '16px', height: '16px', borderRadius: '4px', flexShrink: 0,
                        border: `2px solid ${selected ? '#0D4F4F' : '#444'}`,
                        backgroundColor: selected ? '#0D4F4F' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontSize: '0.65rem', fontWeight: '700',
                      }}>
                        {selected && '\u2713'}
                      </span>
                      <span style={{ fontSize: '0.82rem', color: selected ? '#fff' : '#888' }}>
                        {`${m.first_name || ''} ${m.last_name || ''}`.trim()}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: '#555', marginLeft: 'auto' }}>{m.role}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* PRIORITY (projects.priority — Stage 12.1.5 wired this through) */}
          <div>
            <label style={LBL}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value)} style={{ ...INP, cursor: 'pointer' }}>
              <option value="low">Low</option>
              <option value="standard">Standard</option>
              <option value="high">High</option>
            </select>
          </div>

          {/* LAUNCH BUTTON */}
          <button
            onClick={handleSubmit}
            disabled={!projectName.trim() || isSubmitting}
            style={{
              width: '100%', padding: '18px',
              backgroundColor: projectName.trim() ? '#fff' : '#333',
              color: projectName.trim() ? '#000' : '#666',
              border: 'none', borderRadius: '14px',
              fontSize: '1rem', fontWeight: '700', fontFamily: FONT,
              cursor: projectName.trim() ? 'pointer' : 'not-allowed',
              transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), box-shadow 0.2s ease',
              boxShadow: projectName.trim() ? '0 6px 24px rgba(255,255,255,0.08)' : 'none',
              marginTop: '4px',
            }}
            onMouseEnter={(e) => { if (projectName.trim()) { e.currentTarget.style.transform = 'scale(1.02)'; } }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {isSubmitting ? 'Deploying...' : 'Initialize Dispatch'}
          </button>
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TOKENS
// ═══════════════════════════════════════════════════════════

const LBL = {
  display: 'block', fontSize: '0.7rem', fontWeight: '700',
  textTransform: 'uppercase', letterSpacing: '0.08em',
  color: '#555', marginBottom: '8px',
};

const INP = {
  width: '100%', padding: '12px 14px', borderRadius: '10px',
  backgroundColor: 'var(--bg-surface, #141414)',
  border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
  color: '#fff', fontSize: '0.9rem', fontFamily: FONT,
  outline: 'none', boxSizing: 'border-box',
};
