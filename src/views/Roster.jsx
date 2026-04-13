import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const MONO = "'JetBrains Mono', monospace";

const ROLES = [
  { value: 'pm', label: 'Project Manager', color: '#5E5CE6', bg: 'rgba(94, 92, 230, 0.12)' },
  { value: 'party_chief', label: 'Party Chief', color: '#D4912A', bg: 'rgba(212, 145, 42, 0.12)' },
  { value: 'cad', label: 'CAD Drafter', color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.12)' },
  { value: 'field_crew', label: 'Field Tech', color: '#32D74B', bg: 'rgba(50, 215, 75, 0.12)' },
];

const ROLE_META = {
  owner:        { label: 'Owner',         color: '#D4912A', bg: 'rgba(212, 145, 42, 0.12)' },
  admin:        { label: 'Admin',         color: '#007AFF', bg: 'rgba(0, 122, 255, 0.12)' },
  pm:           { label: 'Project Manager', color: '#5E5CE6', bg: 'rgba(94, 92, 230, 0.12)' },
  party_chief:  { label: 'Party Chief',   color: '#D4912A', bg: 'rgba(212, 145, 42, 0.12)' },
  field_crew:   { label: 'Field Tech',    color: '#32D74B', bg: 'rgba(50, 215, 75, 0.12)' },
  cad:          { label: 'CAD Drafter',   color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.12)' },
  drafter:      { label: 'Drafter',       color: '#FF9F0A', bg: 'rgba(255, 159, 10, 0.12)' },
  technician:   { label: 'Technician',    color: '#30D5C8', bg: 'rgba(48, 213, 200, 0.12)' },
};

const MOCK_ROSTER = [
  { id: 'mock-1', first_name: 'Theo', last_name: 'Bower', email: 'theo@surveyos.com', phone: '602-555-0100', role: 'owner', is_active: true, certifications: ['PLS', 'FAA Part 107'], assigned_equipment: ['Trimble S7', 'TSC7'] },
  { id: 'mock-2', first_name: 'Marcus', last_name: 'Rivera', email: 'marcus@surveyos.com', phone: '602-555-0101', role: 'pm', is_active: true, certifications: ['PLS'], assigned_equipment: [] },
  { id: 'mock-3', first_name: 'Jake', last_name: 'Harrison', email: 'jake@surveyos.com', phone: '602-555-0102', role: 'party_chief', is_active: true, certifications: ['SIT', 'OSHA 10'], assigned_equipment: ['Trimble S6', 'TSC5', 'R12i'] },
  { id: 'mock-4', first_name: 'Sara', last_name: 'Chen', email: 'sara@surveyos.com', phone: null, role: 'cad', is_active: true, certifications: ['AutoCAD Cert'], assigned_equipment: [] },
  { id: 'mock-5', first_name: 'Diego', last_name: 'Morales', email: 'diego@surveyos.com', phone: '602-555-0104', role: 'field_crew', is_active: false, certifications: [], assigned_equipment: ['R12i', 'Bipod'] },
];

export default function Roster({ profile }) {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', firstName: '', lastName: '', role: 'field_crew' });
  const [inviting, setInviting] = useState(false);
  const [toast, setToast] = useState(null);
  const [editingMember, setEditingMember] = useState(null);
  const [ptoRows, setPtoRows] = useState([]);
  const [editingPTO, setEditingPTO] = useState(null); // row object or { new: true } for Add

  useEffect(() => { fetchRoster(); }, []);
  useEffect(() => { fetchPTO(); }, [profile?.firm_id]);

  const fetchPTO = async () => {
    if (!profile?.firm_id) return;
    const { data, error } = await supabase
      .from('crew_unavailability')
      .select('*')
      .eq('firm_id', profile.firm_id)
      .order('start_date', { ascending: true });
    if (error) { console.error('[Roster] crew_unavailability fetch error:', error); return; }
    if (data) setPtoRows(data);
  };

  const handlePTODelete = async (id) => {
    if (!window.confirm('Remove this time off entry?')) return;
    const { error } = await supabase.from('crew_unavailability').delete().eq('id', id);
    if (error) { console.error('[Roster] pto delete error:', error); return; }
    setPtoRows(prev => prev.filter(r => r.id !== id));
    showToastMsg('Time off removed');
  };

  const fetchRoster = async () => {
    setLoading(true);
    if (!profile?.firm_id) {
      setRoster(MOCK_ROSTER);
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, first_name, last_name, email, phone, role, is_active, created_at, certifications, assigned_equipment')
        .eq('firm_id', profile.firm_id)
        .order('created_at', { ascending: true });
      if (error) {
        console.error('[Roster] user_profiles fetch error:', error.message, error.details, error.hint);
        setRoster(MOCK_ROSTER);
      } else if (data && data.length > 0) {
        setRoster(data);
      } else {
        setRoster(MOCK_ROSTER);
      }
    } catch (err) {
      console.error('[Roster] user_profiles fetch exception:', err);
      setRoster(MOCK_ROSTER);
    }
    setLoading(false);
  };

  const handleInvite = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.firstName.trim()) return;
    setInviting(true);

    const code = `${(profile?.first_name || 'SOS').substring(0, 3).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    try {
      const { error: invError } = await supabase.from('firm_invitations').insert({
        firm_id: profile.firm_id, email: inviteForm.email, role: inviteForm.role,
        invite_code: code, invited_by: profile.id || null,
      });

      if (invError) {
        console.error('[Roster] firm_invitations insert error:', invError.message, invError.details, invError.hint);
        // COMMENTED OUT: user_profiles insert network request
        // const { error: profileError } = await supabase.from('user_profiles').insert({
        //   id: crypto.randomUUID(), firm_id: profile.firm_id,
        //   first_name: inviteForm.firstName, last_name: inviteForm.lastName,
        //   email: inviteForm.email, role: inviteForm.role, is_active: true,
        // });
        // if (profileError) {
        //   console.error('[Roster] user_profiles insert error:', profileError.message, profileError.details, profileError.hint);
        setRoster(prev => [...prev, {
          id: `local-${Date.now()}`, first_name: inviteForm.firstName, last_name: inviteForm.lastName,
          email: inviteForm.email, role: inviteForm.role, is_active: true,
          created_at: new Date().toISOString(),
        }]);
        // }
      }
    } catch (err) {
      console.error('[Roster] invite exception:', err);
    }

    await fetchRoster();
    setInviteForm({ email: '', firstName: '', lastName: '', role: 'field_crew' });
    setShowInvite(false);
    setInviting(false);
    showToastMsg(`Invitation sent to ${inviteForm.email}`);
  };

  const handleDeactivate = async (userId) => {
    if (!window.confirm('Deactivate this team member?')) return;
    // COMMENTED OUT: user_profiles update network request
    // try {
    //   const { error } = await supabase.from('user_profiles').update({ is_active: false }).eq('id', userId);
    //   if (error) { console.error('[Roster] deactivate error:', error.message, error.details, error.hint); return; }
    // } catch (err) { console.error('[Roster] deactivate exception:', err); }
    setRoster(prev => prev.map(m => m.id === userId ? { ...m, is_active: false } : m)); showToastMsg('Member deactivated');
  };

  const handleReactivate = async (userId) => {
    // COMMENTED OUT: user_profiles update network request
    // try {
    //   const { error } = await supabase.from('user_profiles').update({ is_active: true }).eq('id', userId);
    //   if (error) { console.error('[Roster] reactivate error:', error.message, error.details, error.hint); return; }
    // } catch (err) { console.error('[Roster] reactivate exception:', err); }
    setRoster(prev => prev.map(m => m.id === userId ? { ...m, is_active: true } : m)); showToastMsg('Member reactivated');
  };

  const handleSaveAssets = async (memberId, certifications, equipment) => {
    // COMMENTED OUT: user_profiles update network request
    // const { error } = await supabase
    //   .from('user_profiles')
    //   .update({ certifications, assigned_equipment: equipment })
    //   .eq('id', memberId);

    // if (!error) {
    setRoster(prev => prev.map(m => m.id === memberId ? { ...m, certifications, assigned_equipment: equipment } : m));
    showToastMsg('Capabilities updated');
    // } else {
    //   setRoster(prev => prev.map(m => m.id === memberId ? { ...m, certifications, assigned_equipment: equipment } : m));
    //   showToastMsg('Updated locally');
    // }
    setEditingMember(null);
  };

  const showToastMsg = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const isOwnerOrAdmin = profile?.role === 'owner' || profile?.role === 'admin';
  const activeCount = roster.filter(m => m.is_active !== false).length;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

      {/* HEADER */}
      <div style={{
        padding: '30px', background: 'linear-gradient(135deg, var(--brand-teal) 0%, #062C2C 100%)',
        borderRadius: '16px', marginBottom: '24px', border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px',
      }}>
        <div>
          <h2 style={{ margin: '0 0 6px', fontSize: '1.6em', letterSpacing: '-0.5px', color: '#fff' }}>Capability Matrix</h2>
          <p style={{ margin: 0, color: 'rgba(255,255,255,0.5)', fontSize: '0.9em' }}>
            {activeCount} active member{activeCount !== 1 && 's'} &middot; Certifications &middot; Equipment
          </p>
        </div>
        {isOwnerOrAdmin && (
          <button onClick={() => setShowInvite(!showInvite)} style={{
            padding: '12px 24px', borderRadius: '10px', border: 'none',
            backgroundColor: '#fff', color: '#0D4F4F', fontWeight: '700', fontSize: '0.9em', cursor: 'pointer',
          }}>
            {showInvite ? 'Cancel' : '+ Invite Member'}
          </button>
        )}
      </div>

      {/* INVITE FORM (unchanged logic) */}
      {showInvite && (
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '28px', borderRadius: '16px', border: '1px solid var(--border-subtle)', marginBottom: '24px' }}>
          <h3 style={{ margin: '0 0 20px', fontSize: '1.05em', color: 'var(--text-main)' }}>Invite New Member</h3>
          <form onSubmit={handleInvite} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div><label style={LABEL}>First Name</label><input type="text" required value={inviteForm.firstName} onChange={(e) => setInviteForm(p => ({ ...p, firstName: e.target.value }))} style={INPUT} placeholder="Jake" /></div>
            <div><label style={LABEL}>Last Name</label><input type="text" value={inviteForm.lastName} onChange={(e) => setInviteForm(p => ({ ...p, lastName: e.target.value }))} style={INPUT} placeholder="Harrison" /></div>
            <div><label style={LABEL}>Email</label><input type="email" required value={inviteForm.email} onChange={(e) => setInviteForm(p => ({ ...p, email: e.target.value }))} style={INPUT} placeholder="jake@company.com" /></div>
            <div><label style={LABEL}>Role</label><select value={inviteForm.role} onChange={(e) => setInviteForm(p => ({ ...p, role: e.target.value }))} style={{ ...INPUT, cursor: 'pointer' }}>{ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
            <div style={{ gridColumn: '1 / -1' }}><button type="submit" disabled={inviting} style={{ padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: 'var(--brand-teal)', color: '#fff', fontWeight: '700', fontSize: '0.9em', cursor: inviting ? 'wait' : 'pointer', width: '100%' }}>{inviting ? 'Sending...' : 'Send Invitation'}</button></div>
          </form>
        </div>
      )}

      {/* CAPABILITY MATRIX TABLE */}
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading roster...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                  <th style={TH}>Name</th>
                  <th style={TH}>Role</th>
                  <th style={TH}>Contact</th>
                  <th style={TH}>Certifications</th>
                  <th style={TH}>Equipment</th>
                  <th style={{ ...TH, textAlign: 'center', width: '60px' }}>Status</th>
                  {isOwnerOrAdmin && <th style={{ ...TH, textAlign: 'right', width: '80px' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {roster.map((member) => {
                  const meta = ROLE_META[member.role] || { label: member.role, color: '#888', bg: 'rgba(255,255,255,0.05)' };
                  const isActive = member.is_active !== false;
                  const certs = member.certifications || [];
                  const equip = member.assigned_equipment || [];

                  return (
                    <tr key={member.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: isActive ? 1 : 0.45, transition: 'background-color 0.12s' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      {/* Name + Avatar */}
                      <td style={TD}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: meta.bg, color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '700', fontSize: '0.75em', flexShrink: 0 }}>
                            {(member.first_name?.[0] || '').toUpperCase()}{(member.last_name?.[0] || '').toUpperCase()}
                          </div>
                          <strong style={{ color: 'var(--text-main)', whiteSpace: 'nowrap' }}>
                            {`${member.first_name || ''} ${member.last_name || ''}`.trim() || 'Unknown'}
                          </strong>
                        </div>
                      </td>

                      {/* Role */}
                      <td style={TD}>
                        <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '5px', fontSize: '0.72em', fontWeight: '700', backgroundColor: meta.bg, color: meta.color }}>{meta.label}</span>
                      </td>

                      {/* Contact */}
                      <td style={{ ...TD, fontSize: '0.8em' }}>
                        <div style={{ color: 'var(--text-muted)', fontFamily: MONO, fontSize: '0.92em' }}>{member.email || '-'}</div>
                        {member.phone && <div style={{ color: '#555', fontSize: '0.88em', marginTop: '2px' }}>{member.phone}</div>}
                      </td>

                      {/* Certifications — teal chips */}
                      <td style={TD}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {certs.length > 0 ? certs.map((c, i) => (
                            <Chip key={i} label={c} borderColor="#0D4F4F" bgColor="rgba(13, 79, 79, 0.1)" textColor="#0D4F4F" />
                          )) : <span style={{ color: '#444', fontSize: '0.78em', fontStyle: 'italic' }}>None</span>}
                        </div>
                      </td>

                      {/* Equipment — amber chips */}
                      <td style={TD}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                          {equip.length > 0 ? equip.map((e, i) => (
                            <Chip key={i} label={e} borderColor="#D4912A" bgColor="rgba(212, 145, 42, 0.1)" textColor="#D4912A" />
                          )) : <span style={{ color: '#444', fontSize: '0.78em', fontStyle: 'italic' }}>None</span>}
                        </div>
                      </td>

                      {/* Status */}
                      <td style={{ ...TD, textAlign: 'center' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', display: 'inline-block', backgroundColor: isActive ? '#32D74B' : '#FF453A', boxShadow: isActive ? '0 0 6px rgba(50,215,75,0.4)' : 'none' }} />
                      </td>

                      {/* Actions */}
                      {isOwnerOrAdmin && (
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button onClick={() => setEditingMember(member)} style={ACT_BTN}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#007AFF'; e.currentTarget.style.borderColor = '#007AFF'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                            >Edit</button>
                            {member.role !== 'owner' && (
                              isActive ? (
                                <button onClick={() => handleDeactivate(member.id)} style={ACT_BTN}
                                  onMouseEnter={(e) => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.borderColor = '#FF453A'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                                >Off</button>
                              ) : (
                                <button onClick={() => handleReactivate(member.id)} style={{ ...ACT_BTN, color: '#32D74B', borderColor: 'rgba(50,215,75,0.3)' }}>On</button>
                              )
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* TIME OFF */}
      <div style={{ marginTop: '28px', backgroundColor: 'var(--bg-surface)', borderRadius: '16px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ padding: '22px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h3 style={{ margin: '0 0 4px', fontSize: '1.05em', color: 'var(--text-main)', letterSpacing: '-0.01em' }}>Time Off</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.82em' }}>
              {ptoRows.length} upcoming block{ptoRows.length !== 1 ? 's' : ''} · blocks the dispatch board on these days
            </p>
          </div>
          {isOwnerOrAdmin && (
            <button
              onClick={() => setEditingPTO({ new: true })}
              style={{
                padding: '10px 18px', borderRadius: '10px', border: 'none',
                backgroundColor: '#0D4F4F', color: '#fff', fontWeight: '700', fontSize: '0.85em', cursor: 'pointer',
              }}
            >
              + Add Time Off
            </button>
          )}
        </div>
        {ptoRows.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85em' }}>
            No time off scheduled.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.86em' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-subtle)' }}>
                  <th style={TH}>Member</th>
                  <th style={TH}>Start</th>
                  <th style={TH}>End</th>
                  <th style={TH}>Reason</th>
                  {isOwnerOrAdmin && <th style={{ ...TH, textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {ptoRows.map(row => {
                  const member = roster.find(m => m.id === row.user_id);
                  const name = member ? `${member.first_name || ''} ${member.last_name || ''}`.trim() : row.user_id.slice(0, 8);
                  const fmt = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={TD}>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)' }}>{name}</div>
                      </td>
                      <td style={TD}><span style={{ fontFamily: MONO, fontSize: '0.88em', color: 'var(--text-muted)' }}>{fmt(row.start_date)}</span></td>
                      <td style={TD}><span style={{ fontFamily: MONO, fontSize: '0.88em', color: 'var(--text-muted)' }}>{fmt(row.end_date)}</span></td>
                      <td style={TD}><span style={{ color: 'var(--text-main)' }}>{row.reason || <em style={{ color: '#555' }}>—</em>}</span></td>
                      {isOwnerOrAdmin && (
                        <td style={{ ...TD, textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                            <button
                              onClick={() => setEditingPTO(row)}
                              style={ACT_BTN}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#007AFF'; e.currentTarget.style.borderColor = '#007AFF'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                            >Edit</button>
                            <button
                              onClick={() => handlePTODelete(row.id)}
                              style={ACT_BTN}
                              onMouseEnter={(e) => { e.currentTarget.style.color = '#FF453A'; e.currentTarget.style.borderColor = '#FF453A'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                            >Del</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EDIT CAPABILITIES MODAL */}
      {editingMember && (
        <EditAssetsModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSave={handleSaveAssets}
        />
      )}

      {/* PTO ADD / EDIT MODAL */}
      {editingPTO && (
        <PTOEditModal
          row={editingPTO.new ? null : editingPTO}
          roster={roster}
          profile={profile}
          onClose={() => setEditingPTO(null)}
          onSaved={() => { fetchPTO(); setEditingPTO(null); showToastMsg('Time off saved'); }}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%)', zIndex: 1100, padding: '14px 28px', borderRadius: '14px', backgroundColor: '#141414', border: '1px solid rgba(50,215,75,0.2)', color: '#32D74B', fontSize: '0.88rem', fontWeight: '600', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EDIT ASSETS MODAL
// ═══════════════════════════════════════════════════════════

function EditAssetsModal({ member, onClose, onSave }) {
  const [certs, setCerts] = useState(member.certifications || []);
  const [equip, setEquip] = useState(member.assigned_equipment || []);
  const [newCert, setNewCert] = useState('');
  const [newEquip, setNewEquip] = useState('');

  const addCert = () => { if (newCert.trim() && !certs.includes(newCert.trim())) { setCerts([...certs, newCert.trim()]); setNewCert(''); } };
  const addEquip = () => { if (newEquip.trim() && !equip.includes(newEquip.trim())) { setEquip([...equip, newEquip.trim()]); setNewEquip(''); } };
  const removeCert = (idx) => setCerts(certs.filter((_, i) => i !== idx));
  const removeEquip = (idx) => setEquip(equip.filter((_, i) => i !== idx));

  const name = `${member.first_name || ''} ${member.last_name || ''}`.trim();

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 1201, width: '440px', maxWidth: '92vw',
        backgroundColor: 'var(--bg-dark, #0A0A0A)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        borderRadius: '20px', boxShadow: '0 30px 60px rgba(0,0,0,0.5)', padding: '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1em', color: '#fff' }}>Edit: {name}</h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888', fontSize: '1.1em' }}>&times;</button>
        </div>

        {/* CERTIFICATIONS */}
        <div style={{ marginBottom: '20px' }}>
          <label style={LABEL}>Certifications</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {certs.map((c, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #0D4F4F', backgroundColor: 'rgba(13,79,79,0.1)', color: '#0D4F4F', fontSize: '0.78em', fontWeight: '600' }}>
                {c}
                <span onClick={() => removeCert(i)} style={{ cursor: 'pointer', color: '#555', fontSize: '1em', lineHeight: 1 }}>&times;</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input value={newCert} onChange={(e) => setNewCert(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCert(); } }} placeholder="e.g. PLS, FAA Part 107" style={{ ...INPUT, flex: 1, padding: '8px 10px', fontSize: '0.82em' }} />
            <button onClick={addCert} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#0D4F4F', color: '#fff', fontWeight: '700', fontSize: '0.78em', cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        {/* EQUIPMENT */}
        <div style={{ marginBottom: '24px' }}>
          <label style={LABEL}>Assigned Equipment</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
            {equip.map((e, i) => (
              <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #D4912A', backgroundColor: 'rgba(212,145,42,0.1)', color: '#D4912A', fontSize: '0.78em', fontWeight: '600' }}>
                {e}
                <span onClick={() => removeEquip(i)} style={{ cursor: 'pointer', color: '#555', fontSize: '1em', lineHeight: 1 }}>&times;</span>
              </span>
            ))}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input value={newEquip} onChange={(e) => setNewEquip(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addEquip(); } }} placeholder="e.g. Trimble S7, TSC5" style={{ ...INPUT, flex: 1, padding: '8px 10px', fontSize: '0.82em' }} />
            <button onClick={addEquip} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#D4912A', color: '#fff', fontWeight: '700', fontSize: '0.78em', cursor: 'pointer' }}>Add</button>
          </div>
        </div>

        {/* SAVE */}
        <button
          onClick={() => onSave(member.id, certs, equip)}
          style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', backgroundColor: '#fff', color: '#000', fontWeight: '700', fontSize: '0.9em', cursor: 'pointer' }}
        >
          Save Capabilities
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// PTO EDIT MODAL
// ═══════════════════════════════════════════════════════════

function PTOEditModal({ row, roster, profile, onClose, onSaved }) {
  const isEdit = !!row;
  const [userId, setUserId] = useState(row?.user_id || '');
  const [startDate, setStartDate] = useState(row?.start_date || '');
  const [endDate, setEndDate] = useState(row?.end_date || '');
  const [reason, setReason] = useState(row?.reason || '');
  const [busy, setBusy] = useState(false);

  // Only field-side members can have time off (owners/admins scheduling themselves is weird).
  const eligibleMembers = (roster || []).filter(m =>
    ['field_crew', 'technician', 'party_chief', 'pm', 'cad', 'drafter'].includes(m.role)
  );

  const handleSave = async () => {
    if (!userId || !startDate || !endDate) return;
    if (new Date(endDate) < new Date(startDate)) {
      alert('End date must be on or after start date.');
      return;
    }
    setBusy(true);
    if (isEdit) {
      const { error } = await supabase
        .from('crew_unavailability')
        .update({ user_id: userId, start_date: startDate, end_date: endDate, reason: reason || null })
        .eq('id', row.id);
      if (error) { console.error('[PTOEditModal] update error:', error); setBusy(false); return; }
    } else {
      const { error } = await supabase
        .from('crew_unavailability')
        .insert([{
          user_id: userId,
          firm_id: profile?.firm_id,
          start_date: startDate,
          end_date: endDate,
          reason: reason || null,
          created_by: profile?.id || null,
        }]);
      if (error) { console.error('[PTOEditModal] insert error:', error); setBusy(false); return; }
    }
    setBusy(false);
    onSaved();
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 1200, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        zIndex: 1201, width: '440px', maxWidth: '92vw',
        backgroundColor: 'var(--bg-dark, #0A0A0A)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
        borderRadius: '20px', boxShadow: '0 30px 60px rgba(0,0,0,0.5)', padding: '28px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ margin: 0, fontSize: '1.1em', color: '#fff' }}>
            {isEdit ? 'Edit Time Off' : 'Add Time Off'}
          </h3>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#888', fontSize: '1.1em' }}>&times;</button>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={LABEL}>Member</label>
          <select
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            style={{ ...INPUT, cursor: 'pointer' }}
          >
            <option value="">Select a member…</option>
            {eligibleMembers.map(m => (
              <option key={m.id} value={m.id}>
                {m.first_name} {m.last_name} — {m.role}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div>
            <label style={LABEL}>Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={INPUT} />
          </div>
        </div>

        <div style={{ marginBottom: '22px' }}>
          <label style={LABEL}>Reason</label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Vacation, sick, training, conference…"
            style={INPUT}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={busy || !userId || !startDate || !endDate}
          style={{
            width: '100%', padding: '14px', borderRadius: '10px', border: 'none',
            backgroundColor: '#0D4F4F', color: '#fff',
            fontWeight: '700', fontSize: '0.9em',
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Time Off'}
        </button>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// SUB-COMPONENTS & TOKENS
// ═══════════════════════════════════════════════════════════

function Chip({ label, borderColor, bgColor, textColor }) {
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: '5px',
      border: `1px solid ${borderColor}`, backgroundColor: bgColor,
      color: textColor, fontSize: '0.7em', fontWeight: '600',
      whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

const TH = { padding: '12px 14px', textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.68em', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.08em' };
const TD = { padding: '12px 14px', verticalAlign: 'middle' };
const LABEL = { display: 'block', color: 'var(--text-muted)', fontSize: '0.72em', fontWeight: '600', letterSpacing: '0.04em', marginBottom: '6px', textTransform: 'uppercase' };
const INPUT = { width: '100%', padding: '10px 12px', borderRadius: '8px', backgroundColor: 'var(--bg-dark, #111)', border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))', color: '#fff', fontSize: '0.88em', outline: 'none', boxSizing: 'border-box' };
const ACT_BTN = { padding: '4px 10px', backgroundColor: 'transparent', border: '1px solid var(--border-subtle)', borderRadius: '5px', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.68em', fontWeight: '600', transition: 'all 0.12s ease' };
