import React, { useState, useEffect } from 'react';

export default function NetworkOps({ supabase, profile, teamMembers }) {
  const [equipment, setEquipment] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Registration Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModel, setNewModel] = useState('');
  const [newCategory, setNewCategory] = useState('Total Station');
  const [newSerial, setNewSerial] = useState('');
  const [newCalDate, setNewCalDate] = useState('');
  const [newAssignee, setNewAssignee] = useState('Unassigned');

  useEffect(() => {
    if (profile?.firm_id) {
      fetchEquipment();
      
      const equipChannel = supabase.channel('live-equipment')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment', filter: `firm_id=eq.${profile.firm_id}` }, () => {
            fetchEquipment();
        }).subscribe();

      return () => supabase.removeChannel(equipChannel);
    }
  }, [profile]);

  async function fetchEquipment() {
    setIsLoading(true);
    const { data } = await supabase.from('equipment').select('*').eq('firm_id', profile.firm_id).order('category', { ascending: true });
    if (data) setEquipment(data);
    setIsLoading(false);
  }

  async function handleAddEquipment(e) {
    e.preventDefault();
    const { error } = await supabase.from('equipment').insert([{
      firm_id: profile.firm_id,
      model: newModel,
      category: newCategory,
      serial_number: newSerial,
      calibration_date: newCalDate || null,
      status: 'In Office',
      assigned_to: newAssignee
    }]);

    if (error) alert("Error adding hardware: " + error.message);
    else {
      setNewModel(''); setNewSerial(''); setNewCalDate(''); setNewAssignee('Unassigned'); setShowAddForm(false);
    }
  }

  async function updateEquipmentRecord(id, field, value) {
    await supabase.from('equipment').update({ [field]: value }).eq('id', id);
  }

  const isCalibrationExpired = (dateString) => {
    if (!dateString) return true;
    const calDate = new Date(dateString);
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    return calDate < oneYearAgo;
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '30px' }}>
        <div>
          <h2 style={{ margin: '0 0 5px 0', fontSize: '2em', color: '#0f172a' }}>🌐 Network Operations</h2>
          <p style={{ margin: 0, color: '#64748b', fontSize: '1.1em' }}>Global Fleet & Hardware Logistics</p>
        </div>
        <button onClick={() => setShowAddForm(!showAddForm)} style={{ padding: '10px 20px', backgroundColor: '#0F1B2D', color: '#C9963B', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
          {showAddForm ? 'Cancel' : '+ Register Hardware'}
        </button>
      </div>

      {showAddForm && (
        <div style={{ backgroundColor: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #cbd5e1', marginBottom: '30px', boxShadow: '0 4px 15px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 15px 0', color: '#0f172a' }}>Register New Asset</h3>
          <form onSubmit={handleAddEquipment} style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Make & Model</label>
              <input type="text" required placeholder="e.g. Trimble S7 3-Sec" value={newModel} onChange={(e) => setNewModel(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Category</label>
              <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}>
                <option>Total Station</option>
                <option>GNSS Rover</option>
                <option>Base Station</option>
                <option>Data Collector</option>
                <option>Digital Level</option>
                <option>Vehicle</option>
                {/* NEW: Added Drone Option */}
                <option>Drone / UAV</option> 
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Serial Number</label>
              <input type="text" required placeholder="S/N" value={newSerial} onChange={(e) => setNewSerial(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Initial Assignee</label>
              <select value={newAssignee} onChange={(e) => setNewAssignee(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff' }}>
                <option value="Unassigned">Unassigned (Office)</option>
                {(teamMembers || []).map(m => (
                  <option key={m.id} value={m.first_name}>{m.first_name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={{ display: 'block', fontSize: '0.85em', fontWeight: 'bold', color: '#475569', marginBottom: '5px' }}>Calibration Date</label>
              <input type="date" required value={newCalDate} onChange={(e) => setNewCalDate(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} />
            </div>
            <button type="submit" style={{ padding: '12px 24px', backgroundColor: '#059669', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', height: '42px' }}>Save Asset</button>
          </form>
        </div>
      )}

      <div style={{ backgroundColor: '#0F1B2D', borderRadius: '12px', border: '1px solid #1e293b', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.1)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', color: '#F8FAFC' }}>
            <thead>
              <tr style={{ backgroundColor: '#1e293b', borderBottom: '2px solid #334155' }}>
                <th style={{ padding: '15px 20px', fontWeight: 'bold', color: '#94a3b8' }}>Asset Details</th>
                <th style={{ padding: '15px 20px', fontWeight: 'bold', color: '#94a3b8' }}>Category</th>
                <th style={{ padding: '15px 20px', fontWeight: 'bold', color: '#94a3b8' }}>Assigned To</th>
                <th style={{ padding: '15px 20px', fontWeight: 'bold', color: '#94a3b8' }}>Compliance</th>
                <th style={{ padding: '15px 20px', fontWeight: 'bold', color: '#94a3b8' }}>Logistics Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan="5" style={{ padding: '20px', textAlign: 'center', color: '#64748b' }}>Loading fleet data...</td></tr>
              ) : equipment.length === 0 ? (
                <tr><td colSpan="5" style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>No hardware registered. Click "Register Hardware" above.</td></tr>
              ) : (
                equipment.map((item) => {
                  const isExpired = isCalibrationExpired(item.calibration_date);
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #1e293b', transition: '0.2s', backgroundColor: isExpired ? 'rgba(239, 68, 68, 0.05)' : 'transparent' }}>
                      
                      <td style={{ padding: '15px 20px' }}>
                        <strong style={{ display: 'block', fontSize: '1.1em', color: '#f1f5f9' }}>{item.model}</strong>
                        <span style={{ fontSize: '0.85em', color: '#64748b', fontFamily: 'monospace' }}>S/N: {item.serial_number}</span>
                      </td>
                      
                      <td style={{ padding: '15px 20px' }}>
                        <span style={{ padding: '4px 8px', backgroundColor: '#334155', borderRadius: '4px', fontSize: '0.85em', fontWeight: 'bold', color: '#cbd5e1' }}>
                          {item.category}
                        </span>
                      </td>

                      <td style={{ padding: '15px 20px' }}>
                        <select 
                          value={item.assigned_to || 'Unassigned'} 
                          onChange={(e) => updateEquipmentRecord(item.id, 'assigned_to', e.target.value)}
                          style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #334155', backgroundColor: 'transparent', color: '#3b82f6', fontWeight: 'bold', cursor: 'pointer' }}
                        >
                          <option style={{ backgroundColor: '#fff', color: '#000' }} value="Unassigned">Unassigned</option>
                          {(teamMembers || []).map(m => (
                            <option key={m.id} style={{ backgroundColor: '#fff', color: '#000' }} value={m.first_name}>{m.first_name}</option>
                          ))}
                        </select>
                      </td>

                      <td style={{ padding: '15px 20px' }}>
                        {item.category === 'Data Collector' || item.category === 'Vehicle' || item.category === 'Drone / UAV' ? (
                          <span style={{ color: '#64748b', fontSize: '0.9em' }}>N/A</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: isExpired ? '#ef4444' : '#10b981', boxShadow: isExpired ? '0 0 8px #ef4444' : 'none' }}></div>
                            <span style={{ color: isExpired ? '#fca5a5' : '#a7f3d0', fontWeight: 'bold', fontSize: '0.95em' }}>
                              {item.calibration_date ? new Date(item.calibration_date).toLocaleDateString() : 'Unknown'}
                            </span>
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '15px 20px' }}>
                        <select 
                          value={item.status} 
                          onChange={(e) => updateEquipmentRecord(item.id, 'status', e.target.value)}
                          style={{ 
                            padding: '8px 12px', borderRadius: '6px', border: '1px solid #334155', fontWeight: 'bold', cursor: 'pointer',
                            backgroundColor: item.status === 'In Field' ? '#C9963B' : item.status === 'Maintenance' ? '#ef4444' : '#1e293b',
                            color: item.status === 'In Field' || item.status === 'Maintenance' ? '#000' : '#fff'
                          }}
                        >
                          <option style={{ backgroundColor: '#fff', color: '#000' }}>In Office</option>
                          <option style={{ backgroundColor: '#fff', color: '#000' }}>In Field</option>
                          <option style={{ backgroundColor: '#fff', color: '#000' }}>Maintenance</option>
                        </select>
                      </td>

                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}