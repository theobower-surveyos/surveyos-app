import React, { useState } from 'react';

const inputStyle = {
  width: '100%',
  backgroundColor: 'var(--bg-dark)',
  border: '1px solid var(--border-subtle)',
  padding: '12px',
  borderRadius: '8px',
  color: '#fff',
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  color: 'var(--text-muted)',
  fontSize: '0.8em',
  marginBottom: '8px',
  fontWeight: '600',
  letterSpacing: '0.5px',
};

export default function CommandCenter({ profile, projects, teamMembers, onProjectSelect, onCreateProject }) {
  const [newProjectName, setNewProjectName] = useState('');
  const [feeType, setFeeType] = useState('lump_sum');
  const [contractFee, setContractFee] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [hideFinancials, setHideFinancials] = useState(false);
  const [checklistItems, setChecklistItems] = useState([]);
  const [newItemText, setNewItemText] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Packing Manifest State
  const [manifest, setManifest] = useState({
    'Total Station': false,
    'GNSS Rover': false,
    'Base Station': false,
    'Data Collector': false,
    'Drone / UAV': false,
  });

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!newItemText.trim()) return;
    setChecklistItems([...checklistItems, { task: newItemText, done: false }]);
    setNewItemText('');
  };

  const handleRemoveItem = (index) => {
    setChecklistItems(checklistItems.filter((_, i) => i !== index));
  };

  const toggleManifestItem = (item) => {
    setManifest(prev => ({ ...prev, [item]: !prev[item] }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;
    setIsCreating(true);

    const requiredGear = Object.keys(manifest).filter(key => manifest[key]).map(category => ({
      category,
      loaded: false,
      serial: null,
    }));

    // Build assignee data — capture contact info for future SMS/email dispatch
    const assignee = teamMembers?.find(m => m.id === assignedTo);
    const assigneePayload = assignee
      ? { id: assignee.id, name: `${assignee.first_name || ''} ${assignee.last_name || ''}`.trim(), email: assignee.email || null, phone: assignee.phone || null }
      : null;

    await onCreateProject({
      project_name: newProjectName,
      fee_type: feeType,
      contract_fee: feeType === 'lump_sum' ? parseFloat(contractFee) || 0 : 0,
      scheduled_date: scheduledDate || null,
      assigned_crew: assigneePayload?.name || 'Unassigned',
      assigned_to: assigneePayload,
      hide_financials: hideFinancials,
      scope_checklist: checklistItems,
      required_equipment: requiredGear,
    });

    // Reset form
    setNewProjectName('');
    setContractFee('');
    setScheduledDate('');
    setAssignedTo('');
    setHideFinancials(false);
    setChecklistItems([]);
    setNewItemText('');
    setManifest({ 'Total Station': false, 'GNSS Rover': false, 'Base Station': false, 'Data Collector': false, 'Drone / UAV': false });
    setIsCreating(false);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', animation: 'fadeIn 0.5s ease-out' }}>

      {/* HEADER */}
      <div style={{
        padding: '30px',
        background: 'linear-gradient(135deg, var(--brand-teal) 0%, #062C2C 100%)',
        borderRadius: '16px',
        marginBottom: '40px',
        border: '1px solid var(--brand-teal-light)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
      }}>
        <h2 style={{ margin: 0, fontSize: '1.8em', letterSpacing: '-0.5px' }}>
          Good evening, {profile?.first_name || 'Operator'}.
        </h2>
        <p style={{ margin: '10px 0 0 0', color: 'rgba(255,255,255,0.7)', fontSize: '1em' }}>
          System Online. {projects?.length || 0} active projects in the network.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '30px' }}>

        {/* LEFT: Project Queue */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <h3 style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.9em', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Active Operations
          </h3>

          {(projects || []).map((proj, index) => (
            <div
              key={proj?.id || index}
              onClick={() => onProjectSelect(proj)}
              style={{
                padding: '24px',
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: '12px',
                cursor: 'pointer',
                transition: 'transform 0.2s, border-color 0.2s',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--brand-teal)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'translateY(0)'; }}
            >
              <div>
                <strong style={{ display: 'block', fontSize: '1.2em', marginBottom: '8px' }}>{proj?.project_name}</strong>
                <div style={{ display: 'flex', gap: '15px', color: 'var(--text-muted)', fontSize: '0.85em' }}>
                  <span>{proj?.assigned_crew || 'Unassigned'}</span>
                  <span>{proj?.scheduled_date || 'TBD'}</span>
                  {!proj?.hide_financials && (
                    <span className="coordinate-data" style={{ color: 'var(--brand-amber)' }}>
                      ${Number(proj?.contract_fee || 0).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
              <div style={{
                padding: '6px 12px',
                backgroundColor: 'rgba(255,255,255,0.05)',
                borderRadius: '4px',
                fontSize: '0.75em',
                fontWeight: '800',
                border: '1px solid var(--border-subtle)',
              }}>
                {String(proj?.status).toUpperCase()}
              </div>
            </div>
          ))}
        </div>

        {/* RIGHT: Dispatch Console */}
        <div style={{
          backgroundColor: 'var(--bg-surface)',
          padding: '30px',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
          height: 'fit-content',
          position: 'sticky',
          top: '40px',
        }}>
          <h3 style={{ margin: '0 0 25px 0', fontSize: '1.2em' }}>Initialize New Dispatch</h3>

          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* PROJECT NAME */}
            <div>
              <label style={labelStyle}>PROJECT NAME</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                style={inputStyle}
                placeholder="Site Address or Lot #"
              />
            </div>

            {/* ASSIGN TO */}
            <div>
              <label style={labelStyle}>ASSIGN TO</label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                style={{ ...inputStyle, cursor: 'pointer' }}
              >
                <option value="">Unassigned</option>
                {(teamMembers || []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {`${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email}
                  </option>
                ))}
              </select>
            </div>

            {/* DATE + CONTRACT TYPE */}
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>SCHEDULED DATE</label>
                <input
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  style={inputStyle}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>CONTRACT TYPE</label>
                <select
                  value={feeType}
                  onChange={(e) => setFeeType(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="lump_sum">Lump Sum</option>
                  <option value="time_and_materials">Time & Materials (T&M)</option>
                </select>
              </div>
            </div>

            {/* FEE — only shown for Lump Sum */}
            {feeType === 'lump_sum' && (
              <div>
                <label style={labelStyle}>CONTRACT FEE ($)</label>
                <input
                  type="number"
                  value={contractFee}
                  onChange={(e) => setContractFee(e.target.value)}
                  className="coordinate-data"
                  style={{ ...inputStyle, color: 'var(--brand-amber)' }}
                  placeholder="0.00"
                />
              </div>
            )}

            {/* HIDE FINANCIALS TOGGLE */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', padding: '10px 0' }}>
              <input
                type="checkbox"
                checked={hideFinancials}
                onChange={(e) => setHideFinancials(e.target.checked)}
                style={{ width: '18px', height: '18px', accentColor: 'var(--brand-teal)', cursor: 'pointer' }}
              />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85em' }}>Hide financials from field crew</span>
            </label>

            {/* SCOPE CHECKLIST BUILDER */}
            <div style={{ padding: '15px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <label style={{ ...labelStyle, color: 'var(--brand-amber)' }}>SCOPE CHECKLIST</label>
              <div style={{ display: 'flex', gap: '8px', marginBottom: checklistItems.length > 0 ? '12px' : '0' }}>
                <input
                  type="text"
                  value={newItemText}
                  onChange={(e) => setNewItemText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(e); } }}
                  style={{ ...inputStyle, flex: 1 }}
                  placeholder="e.g. Set control points"
                />
                <button
                  type="button"
                  onClick={handleAddItem}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'var(--brand-teal)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                    whiteSpace: 'nowrap',
                  }}
                >
                  Add
                </button>
              </div>
              {checklistItems.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {checklistItems.map((item, idx) => (
                    <div key={idx} style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-dark)',
                      borderRadius: '6px',
                      border: '1px solid var(--border-subtle)',
                    }}>
                      <span style={{ fontSize: '0.9em', color: 'var(--text-main)' }}>{item.task}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(idx)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          fontSize: '1.1em',
                          padding: '0 4px',
                          lineHeight: 1,
                        }}
                      >
                        \u00d7
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* GEAR MANIFEST */}
            <div style={{ padding: '15px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <label style={{ ...labelStyle, color: 'var(--brand-amber)' }}>REQUIRED HARDWARE</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {Object.keys(manifest).map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleManifestItem(item)}
                    style={{
                      padding: '6px 12px',
                      fontSize: '0.75em',
                      borderRadius: '4px',
                      border: manifest[item] ? '1px solid var(--brand-amber)' : '1px solid var(--border-subtle)',
                      backgroundColor: manifest[item] ? 'var(--brand-amber)' : 'transparent',
                      color: manifest[item] ? '#000' : 'var(--text-muted)',
                      cursor: 'pointer',
                      fontWeight: 'bold',
                    }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* SUBMIT */}
            <button
              type="submit"
              disabled={isCreating}
              style={{
                padding: '16px',
                backgroundColor: 'var(--brand-teal)',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 'bold',
                fontSize: '1em',
                cursor: 'pointer',
                marginTop: '10px',
                boxShadow: '0 4px 15px rgba(13, 79, 79, 0.4)',
              }}
            >
              {isCreating ? 'Synchronizing...' : 'Authorize Dispatch'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
