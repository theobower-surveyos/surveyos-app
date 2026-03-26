import React, { useState, useRef, useEffect, useCallback } from 'react';
import { vaultAction, getVaultQueue, removeFromVault } from '../lib/offlineStore';
import { calculateDeltas } from '../lib/harrisonMath';

const SYNC_INTERVAL_MS = 5000;

// --- Shared Styles (Brand: Quiet Confidence) ---
const monoData = { fontFamily: "'JetBrains Mono', monospace", fontVariantNumeric: 'tabular-nums' };
const colors = {
  teal: '#0D4F4F',
  amber: '#D4912A',
  bgDark: '#0F172A',
  cardBg: '#1e293b',
  border: '#334155',
  textPrimary: '#F8FAFC',
  textMuted: '#94a3b8',
  green: '#059669',
  greenLight: '#10b981',
  blue: '#3b82f6',
  red: '#ef4444',
};

export default function TodaysWork({ supabase, project, profile, onSyncComplete }) {
  const [uploadMode, setUploadMode] = useState('as_built');
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const [checklist, setChecklist] = useState([]);
  const [manifest, setManifest] = useState([]);
  const [photoStatus, setPhotoStatus] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Vault-awareness: how many items are queued locally
  const [vaultCount, setVaultCount] = useState(0);

  // Staking QA/QC: Design vs. As-Built
  const [designPoints, setDesignPoints] = useState([]);
  const [asBuiltPoints, setAsBuiltPoints] = useState([]);
  const [stakingErrors, setStakingErrors] = useState([]);

  const isDemobilized = project?.status === 'field_complete' || project?.status === 'completed';
  const hasDeployed = !!project?.actual_start_time;

  useEffect(() => {
    if (project?.scope_checklist) setChecklist(project.scope_checklist);
    if (project?.required_equipment) setManifest(project.required_equipment);
  }, [project]);

  // --- Recalculate staking errors when either point set changes ---
  useEffect(() => {
    if (designPoints.length === 0 || asBuiltPoints.length === 0) {
      setStakingErrors([]);
      return;
    }
    const designMap = new Map(designPoints.map(p => [p.point_number, p]));
    const errors = [];
    for (const ab of asBuiltPoints) {
      const dp = designMap.get(ab.point_number);
      if (dp) {
        const deltas = calculateDeltas(dp, ab);
        if (deltas) errors.push({ pointNumber: ab.point_number, description: ab.description, ...deltas });
      }
    }
    setStakingErrors(errors);
  }, [designPoints, asBuiltPoints]);

  // --- Refresh vault count ---
  const refreshVaultCount = useCallback(async () => {
    try {
      const queue = await getVaultQueue();
      setVaultCount(queue.filter(item => item.status === 'pending').length);
    } catch { /* IndexedDB unavailable — degrade gracefully */ }
  }, []);

  // =========================================================
  // BACKGROUND SYNC LOOP — drains the IndexedDB vault to Supabase
  // =========================================================
  useEffect(() => {
    refreshVaultCount();

    const intervalId = setInterval(async () => {
      let queue;
      try { queue = await getVaultQueue(); } catch { return; }

      const pending = queue.filter(item => item.status === 'pending');
      if (pending.length === 0) return;

      for (const item of pending) {
        try {
          let error = null;

          if (item.actionType === 'csv_upload') {
            const res = await supabase.from('survey_points').insert(item.payload.points);
            error = res.error;
          } else if (item.actionType === 'photo_upload') {
            const { fileName, base64, contentType } = item.payload;
            const blob = base64ToBlob(base64, contentType);
            const res = await supabase.storage.from('project-photos').upload(fileName, blob);
            error = res.error;
          } else if (item.actionType === 'checklist_toggle') {
            const res = await supabase.from('projects').update({ scope_checklist: item.payload.checklist }).eq('id', item.payload.projectId);
            error = res.error;
          }

          if (!error) {
            await removeFromVault(item.id);
            if (onSyncComplete) onSyncComplete();
          }
        } catch { /* Network down — will retry next interval */ }
      }
      await refreshVaultCount();
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [supabase, onSyncComplete, refreshVaultCount]);

  // =========================================================
  // HANDLERS — all vault-first, then optimistic UI
  // =========================================================

  const handleDeploy = async () => {
    const startTime = new Date().toISOString();
    const { error } = await supabase.from('projects').update({
      status: 'in_progress',
      actual_start_time: startTime,
    }).eq('id', project.id);

    if (!error) { if (onSyncComplete) onSyncComplete(); }
    else { alert('Connectivity issue starting the job.'); }
  };

  const handleClaimEquipment = async (index, category) => {
    if (isDemobilized) return;

    const { data: availEquip, error: fetchErr } = await supabase
      .from('equipment')
      .select('*')
      .eq('category', category)
      .eq('status', 'In Office')
      .eq('firm_id', profile.firm_id)
      .limit(1);

    if (fetchErr || !availEquip || availEquip.length === 0) {
      alert(`No available ${category} found in the office. Check Network Ops.`);
      return;
    }

    const equipToClaim = availEquip[0];
    await supabase.from('equipment').update({
      status: 'In Field',
      assigned_to: profile?.first_name || 'Field Crew',
    }).eq('id', equipToClaim.id);

    const updatedManifest = [...manifest];
    updatedManifest[index].loaded = true;
    updatedManifest[index].serial = equipToClaim.serial_number;
    setManifest(updatedManifest);

    await supabase.from('projects').update({ required_equipment: updatedManifest }).eq('id', project.id);
    alert(`Checked out ${equipToClaim.model} (S/N: ${equipToClaim.serial_number})`);
  };

  // VAULT-FIRST: checklist toggle
  const handleToggleCheck = async (index) => {
    if (isDemobilized || !hasDeployed) return;
    const updated = [...checklist];
    updated[index].done = !updated[index].done;
    setChecklist(updated); // optimistic UI

    await vaultAction('checklist_toggle', { projectId: project.id, checklist: updated });
    await refreshVaultCount();
  };

  // VAULT-FIRST: CSV file upload
  const handleFileUpload = async (e) => {
    if (!hasDeployed) { alert('Please Deploy to Site before logging data.'); return; }
    const file = e.target.files[0];
    if (!file) return;

    setIsSyncing(true);
    setSyncStatus('Parsing CSV...');

    const csvText = await file.text();
    const points = parseCSV(csvText, project.id);

    if (points.length === 0) {
      setSyncStatus('No valid data found in file.');
      setIsSyncing(false);
      return;
    }

    // Store parsed points in local state for QA/QC
    if (uploadMode === 'design') setDesignPoints(prev => [...prev, ...points]);
    else setAsBuiltPoints(prev => [...prev, ...points]);

    // Vault to IndexedDB FIRST — data is now crash-safe
    await vaultAction('csv_upload', { points, mode: uploadMode });
    await refreshVaultCount();

    setSyncStatus(`${points.length} points vaulted. Syncing in background...`);
    setIsSyncing(false);

    // Reset file input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // VAULT-FIRST: photo capture (degrades gracefully if GPS unavailable)
  const handleCameraCapture = async (e) => {
    if (!hasDeployed) { alert('Please Deploy to Site before taking photos.'); return; }
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split('.').pop() || 'jpg';
    const base64 = await fileToBase64(file);

    const vaultPhoto = async (lat, lng) => {
      const coordSlug = (lat != null && lng != null)
        ? `${lat.toFixed(5)}_${lng.toFixed(5)}`
        : 'Unknown_Unknown';
      const fileName = `${project.id}/Geotag_${coordSlug}_${Date.now()}.${fileExt}`;

      await vaultAction('photo_upload', { fileName, base64, contentType: file.type });
      await refreshVaultCount();
    };

    if (!navigator.geolocation) {
      alert('No GPS lock, saving photo without coordinates');
      setPhotoStatus('Photo saved (no GPS). Syncing in background...');
      await vaultPhoto(null, null);
      return;
    }

    setPhotoStatus('Acquiring GPS Lock...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        setPhotoStatus('Vaulting geotagged photo...');
        await vaultPhoto(position.coords.latitude, position.coords.longitude);
        setPhotoStatus('Photo saved. Syncing in background...');
      },
      async () => {
        alert('No GPS lock, saving photo without coordinates');
        await vaultPhoto(null, null);
        setPhotoStatus('Photo saved (no GPS). Syncing in background...');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const allTasksChecked = checklist.length === 0 || checklist.every(item => item.done);
  const allGearLoaded = manifest.length === 0 || manifest.every(item => item.loaded);
  const canDemobilize = allTasksChecked && allGearLoaded && hasDeployed;

  const handleDemobilize = async () => {
    if (!canDemobilize || isDemobilized) return;
    const { error } = await supabase.from('projects').update({
      status: 'field_complete',
      actual_end_time: new Date().toISOString(),
    }).eq('id', project.id);

    if (!error) alert('Fieldwork Complete! The office has been notified and drafting can begin.');
  };

  // =========================================================
  // RENDER
  // =========================================================
  return (
    <div style={{ backgroundColor: colors.bgDark, padding: '24px', borderRadius: '12px', border: `1px solid ${colors.border}`, marginTop: '20px', color: colors.textPrimary, boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }}>

      {/* VAULT SYNC INDICATOR */}
      {vaultCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', marginBottom: '16px', backgroundColor: colors.teal, borderRadius: '6px', ...monoData, fontSize: '0.85em' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.amber, display: 'inline-block', animation: 'pulse 2s infinite' }} />
          <span>{vaultCount} item{vaultCount !== 1 ? 's' : ''} queued locally — syncing in background</span>
        </div>
      )}

      {/* DEPLOYMENT LOCK SCREEN */}
      {!hasDeployed && !isDemobilized && (
        <div style={{ backgroundColor: colors.cardBg, padding: '30px', borderRadius: '8px', border: `2px solid ${colors.blue}`, textAlign: 'center', marginBottom: '30px' }}>
          <h2 style={{ margin: '0 0 10px 0', color: colors.textPrimary }}>Ready to mobilize?</h2>
          <p style={{ margin: '0 0 20px 0', color: colors.textMuted }}>Log your departure to unlock field tools and notify dispatch.</p>
          <button onClick={handleDeploy} style={{ padding: '15px 30px', backgroundColor: colors.blue, color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.2em', cursor: 'pointer', boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)' }}>
            Deploy to Site
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '30px', opacity: hasDeployed ? 1 : 0.4, pointerEvents: hasDeployed || isDemobilized ? 'auto' : 'none' }}>

        {/* LEFT COLUMN: Equipment + Scope + Demob */}
        <div>
          {manifest.length > 0 && (
            <div style={{ marginBottom: '25px', padding: '15px', backgroundColor: colors.cardBg, border: `1px solid ${colors.border}`, borderRadius: '8px' }}>
              <h3 style={{ margin: '0 0 15px 0', color: colors.amber, display: 'flex', alignItems: 'center', gap: '8px' }}>Required Equipment</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {manifest.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: item.loaded ? 'rgba(5, 150, 105, 0.1)' : colors.bgDark, border: `1px solid ${item.loaded ? colors.green : colors.border}`, borderRadius: '6px' }}>
                    <div>
                      <span style={{ display: 'block', fontWeight: 'bold', color: item.loaded ? colors.green : colors.textPrimary }}>{item.category}</span>
                      {item.loaded && <span style={{ fontSize: '0.8em', color: colors.greenLight, ...monoData }}>S/N: {item.serial}</span>}
                    </div>
                    {!item.loaded ? (
                      <button onClick={() => handleClaimEquipment(idx, item.category)} disabled={isDemobilized} style={{ padding: '8px 12px', backgroundColor: colors.amber, color: '#854d0e', border: 'none', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Scan & Claim
                      </button>
                    ) : (
                      <span style={{ color: colors.green, fontWeight: 'bold' }}>Loaded</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <h2 style={{ margin: '0 0 15px 0', color: colors.amber, display: 'flex', alignItems: 'center', gap: '10px' }}>Scope Tasks</h2>
          {checklist.length === 0 ? (
            <p style={{ color: colors.textMuted, fontStyle: 'italic', margin: 0 }}>No tasks assigned.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {checklist.map((item, idx) => (
                <div key={idx} onClick={() => handleToggleCheck(idx)} style={{ display: 'flex', alignItems: 'center', gap: '15px', padding: '15px', backgroundColor: item.done ? 'rgba(5, 150, 105, 0.1)' : colors.cardBg, border: `2px solid ${item.done ? colors.green : colors.border}`, borderRadius: '8px', cursor: isDemobilized ? 'default' : 'pointer', transition: '0.2s' }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '6px', border: `2px solid ${item.done ? colors.green : '#cbd5e1'}`, backgroundColor: item.done ? colors.green : 'transparent', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'white', fontSize: '1.2em', fontWeight: 'bold', flexShrink: 0 }}>{item.done && '\u2713'}</div>
                  <span style={{ fontSize: '1.1em', fontWeight: 'bold', color: item.done ? colors.green : colors.textPrimary, textDecoration: item.done ? 'line-through' : 'none' }}>{item.task}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={handleDemobilize} disabled={!canDemobilize || isDemobilized || !hasDeployed} style={{ width: '100%', padding: '15px', marginTop: '20px', backgroundColor: isDemobilized ? colors.cardBg : (canDemobilize ? colors.green : colors.border), color: canDemobilize ? 'white' : colors.textMuted, border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '1.1em', cursor: (canDemobilize && !isDemobilized) ? 'pointer' : 'not-allowed' }}>
            {isDemobilized ? 'Demobilized (Locked)' : (canDemobilize ? 'Complete Fieldwork' : 'Finish Scope to Demobilize')}
          </button>
        </div>

        {/* RIGHT COLUMN: CSV Upload + Camera + QA/QC */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Hardware Sync */}
          <div style={{ backgroundColor: colors.cardBg, padding: '20px', borderRadius: '8px', border: `1px solid ${colors.border}` }}>
            <h3 style={{ margin: '0 0 10px 0', color: colors.textPrimary }}>Hardware Sync</h3>
            <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <button onClick={() => setUploadMode('design')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: uploadMode === 'design' ? colors.amber : colors.bgDark, color: uploadMode === 'design' ? '#000' : '#fff' }}>Design</button>
              <button onClick={() => setUploadMode('as_built')} style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontWeight: 'bold', cursor: 'pointer', backgroundColor: uploadMode === 'as_built' ? colors.blue : colors.bgDark, color: '#fff' }}>As-Builts</button>
            </div>
            <div style={{ border: `2px dashed ${uploadMode === 'design' ? colors.amber : colors.blue}`, borderRadius: '8px', padding: '20px', textAlign: 'center', cursor: isSyncing ? 'wait' : 'pointer' }} onClick={() => !isSyncing && fileInputRef.current.click()}>
              <input type="file" accept=".csv,.txt" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileUpload} />
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.1em' }}>{isSyncing ? 'Processing...' : 'Tap to Upload .CSV'}</p>
            </div>
            {syncStatus && <p style={{ margin: '10px 0 0', fontSize: '0.85em', color: colors.textMuted, textAlign: 'center', ...monoData }}>{syncStatus}</p>}
          </div>

          {/* Site Documentation */}
          <div style={{ backgroundColor: colors.cardBg, padding: '20px', borderRadius: '8px', border: `2px solid ${colors.green}` }}>
            <h3 style={{ margin: '0 0 10px 0', color: colors.textPrimary }}>Site Documentation</h3>
            <div style={{ backgroundColor: colors.green, borderRadius: '8px', padding: '20px', textAlign: 'center', cursor: 'pointer' }} onClick={() => cameraInputRef.current.click()}>
              <input type="file" accept="image/*" capture="environment" ref={cameraInputRef} style={{ display: 'none' }} onChange={handleCameraCapture} />
              <p style={{ margin: 0, fontWeight: 'bold', fontSize: '1.2em', color: 'white' }}>Launch Field Camera</p>
            </div>
            {photoStatus && <div style={{ marginTop: '10px', fontSize: '0.85em', textAlign: 'center', ...monoData }}>{photoStatus}</div>}
          </div>

          {/* STAKING QA/QC TABLE */}
          {stakingErrors.length > 0 && (
            <div style={{ backgroundColor: colors.cardBg, padding: '20px', borderRadius: '8px', border: `1px solid ${colors.teal}` }}>
              <h3 style={{ margin: '0 0 15px 0', color: colors.amber }}>Staking QA/QC</h3>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', ...monoData, fontSize: '0.85em' }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${colors.border}` }}>
                      {['Pt#', 'Desc', '\u0394N', '\u0394E', '\u0394Z', 'Hz Diff'].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: 'right', color: colors.textMuted, fontWeight: 600, whiteSpace: 'nowrap', ...(h === 'Desc' ? { textAlign: 'left' } : {}) }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {stakingErrors.map((row) => {
                      const oot = row.outOfTolerance;
                      return (
                        <tr key={row.pointNumber} style={{ borderBottom: `1px solid ${colors.border}` }}>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: colors.textPrimary }}>{row.pointNumber}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'left', color: colors.textMuted, fontFamily: "'Inter', sans-serif" }}>{row.description}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: colors.textPrimary }}>{row.dN}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: colors.textPrimary }}>{row.dE}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', color: colors.textPrimary }}>{row.dZ}</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 'bold', color: oot ? colors.red : colors.greenLight }}>{row.horizontalDiff}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p style={{ margin: '10px 0 0', fontSize: '0.75em', color: colors.textMuted }}>
                Tolerance: 0.10 ft. <span style={{ color: colors.red }}>Red</span> = out of tolerance.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =========================================================
// UTILITIES
// =========================================================

function parseCSV(csvText, projectId) {
  const lines = csvText.split('\n');
  const points = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split(line.includes('\t') ? '\t' : ',');
    if (parts.length < 5) continue;

    const pNum = String(parts[0]).replace(/['"]/g, '').trim();
    const n = parseFloat(parts[1]);
    const e = parseFloat(parts[2]);
    const z = parseFloat(parts[3]);
    const desc = String(parts[4]).replace(/['"]/g, '').replace(/\r/g, '').trim();

    if (!isNaN(n) && !isNaN(e)) {
      points.push({
        project_id: projectId,
        point_number: pNum,
        northing: n,
        easting: e,
        elevation: isNaN(z) ? 0 : z,
        description: desc,
        point_type: 'boundary',
      });
    }
  }
  return points;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function base64ToBlob(base64, contentType) {
  const parts = base64.split(',');
  const byteString = atob(parts[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: contentType });
}
