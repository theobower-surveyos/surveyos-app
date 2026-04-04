import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { supabase } from '../supabaseClient';
import { MapPin, Navigation, CheckCircle, Lock, Clock, AlertCircle, Camera, UploadCloud, FileText } from 'lucide-react';

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export default function MobileCrewView() {
  const navigate = useNavigate();
  const [arrived, setArrived] = useState(false);
  const [syncingPhoto, setSyncingPhoto] = useState(false);
  const [syncingCsv, setSyncingCsv] = useState(false);
  
  // 1. References for the hidden HTML inputs
  const photoInputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Mock Data
 const activeMission = {
    id: "7c2f19bc-e445-44c6-a5ca-39e534816b21", // <-- Put your copied UUID here
    displayId: "PRJ-99281",
    name: "Phoenix Sub-Division Alpha", // (You can leave this name as is, the ID is what matters to the database)
    // ...
  };

  const upcomingMissions = [
    { id: "PRJ-44320", name: "Chandler High School", type: "ALTA Survey", day: "Tomorrow" },
    { id: "PRJ-11092", name: "Tempe Commercial Pad", type: "Construction Staking", day: "Friday" }
  ];

  // --- PHOTO PIPELINE ---
  const handlePhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setSyncingPhoto(true);
    try {
      let uploaded = 0;
      for (const file of files) {
        const ext = file.name.split('.').pop() || 'jpg';
        const filePath = `${activeMission.id}/${Date.now()}-${uploaded}.${ext}`;
        const { error } = await supabase.storage.from('project-photos').upload(filePath, file, { contentType: file.type });
        if (error) throw error;
        uploaded++;
      }
      alert(`${uploaded} photo(s) synced to Command Center.`);
    } catch (err) {
      console.error('[Crew] photo upload failed:', err.message);
      alert(`Photo upload failed: ${err.message}`);
    } finally {
      setSyncingPhoto(false);
      e.target.value = '';
    }
  };

  // --- CSV PIPELINE ---
  // 2. The trigger that clicks the invisible file input
  const triggerFileBrowser = () => {
    fileInputRef.current.click();
  };

  // 3. The actual parsing logic that runs after a file is selected
  const processCsvFile = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSyncingCsv(true);

    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const telemetryPayloads = results.data.map(row => ({
            project_id: activeMission.id, 
            point_id: row.point_id,     
            point_number: String(row.point_number), 
            delta_n: row.delta_n,
            delta_e: row.delta_e,
            delta_z: row.delta_z || 0.0,
            source: 'mobile_boarding_pass'
          }));

          console.log("[x20 Debug] Parsed CSV Payload:", telemetryPayloads);

          const { error } = await supabase.from('math_logs').insert(telemetryPayloads);
          
          if (error) throw error;
          
          alert(`Successfully synced ${telemetryPayloads.length} points to Command Center.`);
        } catch (err) {
          console.error("Supabase Error:", err);
          alert(`Database rejection: ${err.message}`);
        } finally {
          setSyncingCsv(false);
          event.target.value = null; 
        }
      },
      error: (err) => {
        alert(`Failed to read CSV file: ${err.message}`);
        setSyncingCsv(false);
      }
    });
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      backgroundColor: '#000', 
      color: '#FFF', 
      fontFamily: FONT,
      margin: '0 auto',
      maxWidth: '480px', 
      position: 'relative',
      paddingBottom: '40px'
    }}>
      
      {/* HEADER */}
      <div style={{ padding: '32px 24px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#007AFF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            Crew Alpha
          </div>
          <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.03em' }}>
            Today's Mission
          </h1>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#A1A1AA', fontWeight: '600', fontFamily: MONO }}>
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </div>

      {/* THE BOARDING PASS */}
      <div style={{ padding: '0 16px' }}>
        <div style={{ 
          backgroundColor: '#141414', 
          borderRadius: '24px', 
          border: arrived ? '1px solid rgba(52, 211, 153, 0.4)' : '1px solid rgba(255,255,255,0.08)',
          overflow: 'hidden',
          boxShadow: arrived ? '0 0 30px rgba(52, 211, 153, 0.1)' : '0 10px 40px rgba(0,0,0,0.5)',
          transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          
          <div style={{ padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ padding: '6px 12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px', fontSize: '0.75rem', fontWeight: '700', color: '#A1A1AA', fontFamily: MONO }}>
                {activeMission.displayId}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '700', color: '#FF9F0A' }}>
                <Clock size={14} /> {activeMission.time}
              </div>
            </div>

            <h2 style={{ margin: '0 0 8px 0', fontSize: '1.6rem', fontWeight: '800', lineHeight: '1.2', letterSpacing: '-0.02em' }}>
              {activeMission.name}
            </h2>
            <div style={{ fontSize: '0.9rem', color: '#A1A1AA', fontWeight: '600', marginBottom: '24px' }}>
              {activeMission.type}
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', backgroundColor: '#0A0A0A', padding: '16px', borderRadius: '12px', marginBottom: '24px' }}>
              <MapPin size={18} color="#FF453A" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#FFF', marginBottom: '4px' }}>Location</div>
                <div style={{ fontSize: '0.85rem', color: '#A1A1AA', lineHeight: '1.4' }}>{activeMission.address}</div>
              </div>
            </div>
          </div>

          <div style={{ padding: '8px 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {!arrived && (
              <button 
                onClick={() => window.open(`https://maps.apple.com/?q=${encodeURIComponent(activeMission.address)}`)}
                style={{ 
                  width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                  backgroundColor: '#007AFF', color: '#FFF', fontSize: '1rem', fontWeight: '700',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', cursor: 'pointer'
                }}
              >
                <Navigation size={18} fill="#FFF" /> Route to Site
              </button>
            )}

            <button 
              onClick={() => setArrived(true)}
              disabled={arrived}
              style={{ 
                width: '100%', padding: '16px', borderRadius: '14px', border: 'none',
                backgroundColor: arrived ? 'rgba(52, 211, 153, 0.15)' : '#2C2C2E', 
                color: arrived ? '#34D399' : '#FFF', fontSize: '1rem', fontWeight: '700',
                display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                cursor: arrived ? 'default' : 'pointer', transition: 'all 0.2s ease'
              }}
            >
              {arrived ? <><CheckCircle size={20} /> Mission Active</> : "Confirm Arrival"}
            </button>

            {/* THE UPLINK (Only shows when arrived) */}
            {arrived && (
              <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', animation: 'fadeIn 0.4s ease' }}>
                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', textAlign: 'center' }}>
                  Field Telemetry Uplink
                </div>
                
                {/* 4. The Hidden Inputs */}
                <input
                  type="file"
                  ref={photoInputRef}
                  onChange={handlePhotoUpload}
                  multiple
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                />
                
                <input 
                  type="file" 
                  accept=".csv" 
                  ref={fileInputRef} 
                  style={{ display: 'none' }} 
                  onChange={processCsvFile} 
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  
                  {/* Photo Upload Button */}
                  <button
                    onClick={() => photoInputRef.current.click()}
                    disabled={syncingPhoto}
                    style={{
                      padding: '16px 8px', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px', color: '#FFF', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      cursor: syncingPhoto ? 'wait' : 'pointer', opacity: syncingPhoto ? 0.7 : 1
                    }}
                  >
                    {syncingPhoto ? <UploadCloud size={24} color="#007AFF" style={{ animation: 'pulse 1s infinite' }} /> : <Camera size={24} color="#007AFF" />}
                    <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{syncingPhoto ? 'Uploading...' : 'Snap Photo'}</span>
                  </button>

                  {/* CSV Sync Button */}
                  <button
                    onClick={triggerFileBrowser}
                    disabled={syncingCsv}
                    style={{
                      padding: '16px 8px', backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '12px', color: '#FFF', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                      cursor: syncingCsv ? 'wait' : 'pointer', opacity: syncingCsv ? 0.7 : 1
                    }}
                  >
                    {syncingCsv ? <UploadCloud size={24} color="#FF9F0A" style={{ animation: 'pulse 1s infinite' }} /> : <FileText size={24} color="#FF9F0A" />}
                    <span style={{ fontSize: '0.8rem', fontWeight: '600' }}>{syncingCsv ? 'Syncing...' : 'Sync CSV Data'}</span>
                  </button>
                  
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* THE LOOKAHEAD (LOCKED MISSIONS) */}
      <div style={{ padding: '32px 24px 0' }}>
        <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#555', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px' }}>
          Upcoming Schedule
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {upcomingMissions.map(mission => (
            <div key={mission.id} style={{ 
              backgroundColor: '#0A0A0A', padding: '16px', borderRadius: '16px', 
              border: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: 0.6
            }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: '700', color: '#007AFF', marginBottom: '4px' }}>{mission.day}</div>
                <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#FFF', marginBottom: '2px' }}>{mission.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#555' }}>{mission.type}</div>
              </div>
              <div style={{ width: '36px', height: '36px', borderRadius: '50%', backgroundColor: '#141414', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Lock size={14} color="#555" />
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
      `}</style>
    </div>
  );
}