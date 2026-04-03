import React, { useState, useEffect } from 'react';
import { Wrench, Plus, AlertTriangle, ShieldCheck, X, Trash2, Edit2, Save } from 'lucide-react';

export default function EquipmentLogistics({ supabase, profile, teamMembers }) {
  const [equipment, setEquipment] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Registration Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [newModel, setNewModel] = useState('');
  const [newCategory, setNewCategory] = useState('Total Station');
  const [newSerial, setNewSerial] = useState('');
  const [newCalDate, setNewCalDate] = useState('');
  const [newAssignee, setNewAssignee] = useState('Unassigned');

  // Edit State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => {
    fetchEquipment();
  }, [profile]);

  const fetchEquipment = async () => {
    if (!profile?.firm_id) return;
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('equipment')
        .select('*')
        .eq('firm_id', profile.firm_id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setEquipment(data);
      } else {
        setEquipment([
          { id: 1, model: 'Trimble S7', category: 'Total Station', serial_number: 'TS-88492', calibration_date: '2026-10-15', assigned_to: 'Unassigned', status: 'active' },
          { id: 2, model: 'Leica GS18 T', category: 'GPS Rover', serial_number: 'LR-99210', calibration_date: '2026-04-01', assigned_to: profile?.first_name || 'Unassigned', status: 'active' }
        ]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddEquipment = async (e) => {
    e.preventDefault();
    const newAsset = {
      firm_id: profile.firm_id,
      model: newModel,
      category: newCategory,
      serial_number: newSerial,
      calibration_date: newCalDate,
      assigned_to: newAssignee === 'Unassigned' ? null : newAssignee,
      status: 'active'
    };

    const { data, error } = await supabase.from('equipment').insert([newAsset]).select();

    if (!error && data) {
      setEquipment([data[0], ...equipment]);
    } else {
      setEquipment([{ id: Date.now(), ...newAsset }, ...equipment]);
    }

    setNewModel(''); setNewSerial(''); setNewCalDate(''); setNewAssignee('Unassigned'); setShowAddForm(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this asset?")) return;
    setEquipment(equipment.filter(item => item.id !== id));
    await supabase.from('equipment').delete().eq('id', id);
  };

  const startEditing = (item) => {
    setEditingId(item.id);
    setEditForm({ ...item, assigned_to: item.assigned_to || 'Unassigned' });
  };

  const saveEdit = async () => {
    const updatedData = { ...editForm, assigned_to: editForm.assigned_to === 'Unassigned' ? null : editForm.assigned_to };
    setEquipment(equipment.map(item => item.id === editingId ? updatedData : item));
    setEditingId(null);
    await supabase.from('equipment').update(updatedData).eq('id', editingId);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px', paddingBottom: '24px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '2.2em', fontWeight: '800', letterSpacing: '-0.5px' }}>
            Equipment & Logistics
          </h1>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>
            Fleet management, calibration tracking, and field asset assignments.
          </p>
        </div>
        <button 
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
            backgroundColor: showAddForm ? 'var(--bg-surface)' : 'var(--brand-teal)',
            color: '#fff', border: showAddForm ? '1px solid var(--border-subtle)' : 'none',
            transition: '0.2s'
          }}
        >
          {showAddForm ? <X size={18} /> : <Plus size={18} />}
          {showAddForm ? 'Cancel' : 'Register Asset'}
        </button>
      </header>

      {/* REGISTRATION FORM */}
      {showAddForm && (
        <div style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)', marginBottom: '32px', animation: 'fadeDown 0.3s ease' }}>
          <h3 style={{ margin: '0 0 20px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wrench size={20} color="var(--brand-amber)" /> New Asset Registration
          </h3>
          <form onSubmit={handleAddEquipment} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85em', color: 'var(--text-muted)', fontWeight: 'bold' }}>ASSET CATEGORY</label>
              <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={INPUT_STYLE}>
                <option>Total Station</option>
                <option>GPS Rover</option>
                <option>Data Collector</option>
                <option>Drone / UAV</option>
                <option>Field Vehicle</option>
              </select>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85em', color: 'var(--text-muted)', fontWeight: 'bold' }}>MAKE & MODEL</label>
              <input required type="text" placeholder="e.g. Trimble S7" value={newModel} onChange={e => setNewModel(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85em', color: 'var(--text-muted)', fontWeight: 'bold' }}>SERIAL NUMBER</label>
              <input required type="text" placeholder="S/N..." value={newSerial} onChange={e => setNewSerial(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85em', color: 'var(--text-muted)', fontWeight: 'bold' }}>CALIBRATION DUE</label>
              <input required type="date" value={newCalDate} onChange={e => setNewCalDate(e.target.value)} style={INPUT_STYLE} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.85em', color: 'var(--text-muted)', fontWeight: 'bold' }}>ASSIGN TO CREW</label>
              <select value={newAssignee} onChange={e => setNewAssignee(e.target.value)} style={INPUT_STYLE}>
                <option>Unassigned</option>
                {(teamMembers || []).map(member => (
                  <option key={member.id} value={member.first_name}>{member.first_name} {member.last_name}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button type="submit" style={{ width: '100%', padding: '14px', backgroundColor: '#fff', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                Save & Deploy Asset
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ASSET TRACKING TABLE */}
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
        <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#1E293B', color: '#F1F5F9', fontSize: '0.85em', textTransform: 'uppercase', letterSpacing: '1px', borderBottom: '2px solid var(--border-subtle)' }}>
              <th style={{ padding: '20px', fontWeight: '700' }}>Make / Model</th>
              <th style={{ padding: '20px', fontWeight: '700' }}>Category</th>
              <th style={{ padding: '20px', fontWeight: '700' }}>Serial / ID</th>
              <th style={{ padding: '20px', fontWeight: '700' }}>Assignment</th>
              <th style={{ padding: '20px', fontWeight: '700' }}>Compliance</th>
              <th style={{ padding: '20px', fontWeight: '700', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading logistics matrix...</td></tr>
            ) : equipment.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>No equipment registered to this firm yet.</td></tr>
            ) : (
              equipment.map((item) => {
                const calDate = new Date(item.calibration_date);
                const isOverdue = calDate < new Date();
                const isEditing = editingId === item.id;
                
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)', backgroundColor: isEditing ? 'rgba(255,255,255,0.02)' : 'transparent', transition: '0.2s' }}>
                    <td style={{ padding: '16px 20px', fontWeight: 'bold' }}>
                      {isEditing ? <input value={editForm.model} onChange={e => setEditForm({...editForm, model: e.target.value})} style={EDIT_INPUT_STYLE} /> : item.model}
                    </td>
                    <td style={{ padding: '16px 20px', color: 'var(--text-muted)' }}>
                      {isEditing ? (
                        <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={EDIT_INPUT_STYLE}>
                          <option>Total Station</option><option>GPS Rover</option><option>Data Collector</option><option>Drone / UAV</option><option>Field Vehicle</option>
                        </select>
                      ) : item.category}
                    </td>
                    <td style={{ padding: '16px 20px', fontFamily: 'monospace', color: 'var(--brand-amber)' }}>
                      {isEditing ? <input value={editForm.serial_number} onChange={e => setEditForm({...editForm, serial_number: e.target.value})} style={EDIT_INPUT_STYLE} /> : item.serial_number}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      {isEditing ? (
                        <select value={editForm.assigned_to} onChange={e => setEditForm({...editForm, assigned_to: e.target.value})} style={EDIT_INPUT_STYLE}>
                          <option>Unassigned</option>
                          {(teamMembers || []).map(member => <option key={member.id} value={member.first_name}>{member.first_name} {member.last_name}</option>)}
                        </select>
                      ) : item.assigned_to && item.assigned_to !== 'Unassigned' ? (
                        <span style={{ backgroundColor: 'var(--brand-teal-light)', color: '#fff', padding: '4px 10px', borderRadius: '100px', fontSize: '0.85em', fontWeight: 'bold' }}>Deployed: {item.assigned_to}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>Vault / Unassigned</span>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px' }}>
                      {isEditing ? (
                         <input type="date" value={editForm.calibration_date} onChange={e => setEditForm({...editForm, calibration_date: e.target.value})} style={EDIT_INPUT_STYLE} />
                      ) : isOverdue ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--error)', fontSize: '0.9em', fontWeight: 'bold' }}><AlertTriangle size={16} /> Overdue</span>
                      ) : (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--success)', fontSize: '0.9em' }}><ShieldCheck size={16} /> Valid</span>
                      )}
                    </td>
                    <td style={{ padding: '16px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                        {isEditing ? (
                          <button onClick={saveEdit} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', padding: '4px' }} title="Save"><Save size={18} /></button>
                        ) : (
                          <button onClick={() => startEditing(item)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }} title="Edit"><Edit2 size={18} /></button>
                        )}
                        <button onClick={() => handleDelete(item.id)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '4px' }} title="Delete"><Trash2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      
      <style>{`
        @keyframes fadeDown { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}

const INPUT_STYLE = { padding: '12px 16px', backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-subtle)', borderRadius: '8px', color: 'var(--text-main)', fontFamily: 'inherit', fontSize: '0.95em', outline: 'none' };
const EDIT_INPUT_STYLE = { padding: '6px 8px', backgroundColor: 'var(--bg-dark)', border: '1px solid var(--brand-teal)', borderRadius: '4px', color: '#fff', fontSize: '0.9em', width: '100%', outline: 'none' };