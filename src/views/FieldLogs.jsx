import React, { useState, useEffect, useCallback } from 'react';

const MONO = "'JetBrains Mono', monospace";

const COMMON_MATERIALS = [
  { name: 'Rebar & Cap', unit: 'ea' },
  { name: 'Wood Hub', unit: 'ea' },
  { name: 'PK Nail', unit: 'ea' },
  { name: 'Mag Nail', unit: 'ea' },
  { name: 'Iron Pin', unit: 'ea' },
  { name: 'Flagging Tape', unit: 'roll' },
  { name: 'Lath', unit: 'ea' },
  { name: 'Spray Paint', unit: 'can' },
];

export default function FieldLogs({ supabase, project, profile }) {
  // ── LABOR TIMESHEET ──
  const [activeEntry, setActiveEntry] = useState(null);
  const [todayHours, setTodayHours] = useState(null);
  const [clockLoading, setClockLoading] = useState(false);

  // ── CONSUMABLES ──
  const [consumables, setConsumables] = useState([]);
  const [materialName, setMaterialName] = useState('');
  const [materialQty, setMaterialQty] = useState(1);
  const [addingMaterial, setAddingMaterial] = useState(false);

  const projectId = project?.id;
  const userId = profile?.id;

  // ── FETCH STATE ON MOUNT ──
  const fetchTimeState = useCallback(async () => {
    if (!projectId || !userId) return;

    // Check for an open (clocked-in) entry
    const { data: open } = await supabase
      .from('time_entries')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .is('clock_out', null)
      .order('clock_in', { ascending: false })
      .limit(1)
      .single();

    if (open) setActiveEntry(open);

    // Calculate today's total hours
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const { data: todayEntries } = await supabase
      .from('time_entries')
      .select('clock_in, clock_out')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .gte('clock_in', todayStart.toISOString())
      .not('clock_out', 'is', null);

    if (todayEntries) {
      const totalMs = todayEntries.reduce((sum, e) => {
        return sum + (new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime());
      }, 0);
      setTodayHours(totalMs / 3600000);
    }
  }, [supabase, projectId, userId]);

  const fetchConsumables = useCallback(async () => {
    if (!projectId) return;
    // COMMENTED OUT: consumables_log fetch network request
    // try {
    //   const { data, error } = await supabase
    //     .from('consumables_log')
    //     .select('*')
    //     .eq('project_id', projectId)
    //     .order('created_at', { ascending: false })
    //     .limit(20);
    //
    //   if (error) {
    //     console.error('[FieldLogs] consumables_log fetch error:', error.message, error.details, error.hint);
    //     return;
    //   }
    //   if (data) setConsumables(data);
    // } catch (err) {
    //   console.error('[FieldLogs] consumables_log exception:', err);
    // }
    setConsumables([]);
  }, [supabase, projectId]);

  useEffect(() => {
    fetchTimeState();
    fetchConsumables();
  }, [fetchTimeState, fetchConsumables]);

  // ── CLOCK IN / OUT ──
  const handleClockIn = async () => {
    setClockLoading(true);
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        project_id: projectId,
        user_id: userId,
        user_name: `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || 'Unknown',
        clock_in: new Date().toISOString(),
      })
      .select()
      .single();

    if (!error && data) setActiveEntry(data);
    setClockLoading(false);
  };

  const handleClockOut = async () => {
    if (!activeEntry) return;
    setClockLoading(true);
    const now = new Date().toISOString();

    const { error } = await supabase
      .from('time_entries')
      .update({ clock_out: now })
      .eq('id', activeEntry.id);

    if (!error) {
      setActiveEntry(null);
      await fetchTimeState();
    }
    setClockLoading(false);
  };

  // ── ADD CONSUMABLE ──
  const handleAddConsumable = async (e) => {
    e.preventDefault();
    if (!materialName.trim() || materialQty < 1) return;
    setAddingMaterial(true);

    try {
      // COMMENTED OUT: consumables_log insert network request
      // const { error } = await supabase.from('consumables_log').insert({
      //   project_id: projectId,
      //   item_name: materialName.trim(),
      //   quantity: parseInt(materialQty) || 1,
      //   unit_price: 5.00,
      // });
      //
      // if (error) {
      //   console.error('[FieldLogs] consumables_log insert error:', error.message, error.details, error.hint);
      // } else {
      setMaterialName('');
      setMaterialQty(1);
      // await fetchConsumables();
      // }
    } catch (err) {
      console.error('[FieldLogs] consumables_log insert exception:', err);
    }
    setAddingMaterial(false);
  };

  // ── ELAPSED TIME DISPLAY ──
  const elapsed = activeEntry
    ? Math.floor((Date.now() - new Date(activeEntry.clock_in).getTime()) / 60000)
    : 0;
  const elapsedHrs = Math.floor(elapsed / 60);
  const elapsedMin = elapsed % 60;

  if (!project) return null;

  return (
    <div style={{ marginTop: '40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

      {/* ══════════ LABOR TIMESHEET ══════════ */}
      <div style={{
        backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
      }}>
        <h3 style={{ margin: '0 0 20px', color: 'var(--text-main)', fontSize: '1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Labor Timesheet
        </h3>

        {/* Clock button */}
        <button
          onClick={activeEntry ? handleClockOut : handleClockIn}
          disabled={clockLoading}
          style={{
            width: '100%', padding: '18px', borderRadius: '10px', border: 'none',
            backgroundColor: activeEntry ? '#FF453A' : '#32D74B',
            color: '#fff', fontWeight: '700', fontSize: '1em',
            cursor: clockLoading ? 'wait' : 'pointer',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease',
            boxShadow: activeEntry
              ? '0 4px 20px rgba(255, 69, 58, 0.25)'
              : '0 4px 20px rgba(50, 215, 75, 0.25)',
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          {clockLoading ? 'Processing...' : activeEntry ? 'Clock Out' : 'Clock In'}
        </button>

        {/* Active session indicator */}
        {activeEntry && (
          <div style={{
            marginTop: '16px', padding: '14px', borderRadius: '8px',
            backgroundColor: 'rgba(255, 69, 58, 0.06)', border: '1px solid rgba(255, 69, 58, 0.15)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div>
              <span style={{ fontSize: '0.72em', color: '#FF453A', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Active Session
              </span>
              <div style={{ fontFamily: MONO, fontSize: '1.4em', fontWeight: '700', color: '#FF453A', marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>
                {String(elapsedHrs).padStart(2, '0')}:{String(elapsedMin).padStart(2, '0')}
              </div>
            </div>
            <div style={{
              width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#FF453A',
              animation: 'pulse 2s infinite',
              boxShadow: '0 0 8px rgba(255, 69, 58, 0.5)',
            }} />
          </div>
        )}

        {/* Today's total */}
        {todayHours != null && (
          <div style={{ marginTop: '14px', fontSize: '0.82em', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Today's logged hours</span>
            <span style={{ fontFamily: MONO, fontWeight: '700', color: 'var(--text-main)' }}>
              {todayHours.toFixed(1)}h
            </span>
          </div>
        )}

        <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }`}</style>
      </div>

      {/* ══════════ CONSUMABLES LOG ══════════ */}
      <div style={{
        backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
      }}>
        <h3 style={{ margin: '0 0 20px', color: 'var(--text-main)', fontSize: '1em', display: 'flex', alignItems: 'center', gap: '8px' }}>
          Consumables Log
        </h3>

        {/* Quick-add buttons */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
          {COMMON_MATERIALS.map((m) => (
            <button
              key={m.name}
              type="button"
              onClick={() => setMaterialName(m.name)}
              style={{
                padding: '5px 10px', borderRadius: '6px', fontSize: '0.72em', fontWeight: '600',
                border: materialName === m.name ? '1px solid var(--brand-amber)' : '1px solid var(--border-subtle)',
                backgroundColor: materialName === m.name ? 'rgba(212, 145, 42, 0.1)' : 'transparent',
                color: materialName === m.name ? 'var(--brand-amber)' : 'var(--text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              {m.name}
            </button>
          ))}
        </div>

        {/* Entry form */}
        <form onSubmit={handleAddConsumable} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="text"
            value={materialName}
            onChange={(e) => setMaterialName(e.target.value)}
            placeholder="Material name"
            style={{ ...INPUT, flex: 1 }}
          />
          <input
            type="number"
            min="1"
            value={materialQty}
            onChange={(e) => setMaterialQty(parseInt(e.target.value) || 1)}
            style={{ ...INPUT, width: '70px', textAlign: 'center', fontFamily: MONO }}
          />
          <button
            type="submit"
            disabled={addingMaterial || !materialName.trim()}
            style={{
              padding: '10px 16px', borderRadius: '8px', border: 'none',
              backgroundColor: materialName.trim() ? 'var(--brand-teal)' : 'var(--border-subtle)',
              color: '#fff', fontWeight: '700', fontSize: '0.85em',
              cursor: materialName.trim() ? 'pointer' : 'not-allowed',
              whiteSpace: 'nowrap',
            }}
          >
            + Add
          </button>
        </form>

        {/* Recent entries */}
        <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
          {consumables.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82em', fontStyle: 'italic', textAlign: 'center', padding: '12px 0' }}>
              No materials logged yet.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {consumables.map((c) => (
                <div key={c.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 12px', borderRadius: '6px',
                  backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-subtle)',
                }}>
                  <div>
                    <span style={{ fontSize: '0.85em', fontWeight: '600', color: 'var(--text-main)' }}>{c.item_name || c.material}</span>
                    <span style={{ fontSize: '0.72em', color: 'var(--text-muted)', marginLeft: '8px' }}>
                      by {c.user_name || 'Unknown'}
                    </span>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: '0.85em', fontWeight: '700', color: 'var(--brand-amber)', fontVariantNumeric: 'tabular-nums' }}>
                    x{c.quantity}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT = {
  padding: '10px 12px', borderRadius: '8px',
  backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-subtle)',
  color: '#fff', fontSize: '0.88em', outline: 'none', boxSizing: 'border-box',
};
