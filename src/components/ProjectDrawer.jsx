import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom'; // INJECTED ROUTER
import { supabase } from '../supabaseClient';
import { X, Camera, FileSpreadsheet, Crosshair, CheckCircle, Download, FileCheck, ExternalLink, Send, Archive } from 'lucide-react';
import { generateReport } from '../utils/generateCertifiedReport'; 

const FONT = "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Inter', sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', monospace";

export default function ProjectDrawer({ project, isOpen, onClose }) {
  const navigate = useNavigate(); // INITIALIZE ROUTER
  
  const [photos, setPhotos] = useState([]);
  const [csvFiles, setCsvFiles] = useState([]);
  const [mathLogs, setMathLogs] = useState([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  useEffect(() => {
    if (isOpen && project?.id) {
      fetchProjectData(project.id);
    } else {
      setPhotos([]);
      setCsvFiles([]);
      setMathLogs([]);
    }
  }, [isOpen, project?.id]);

  const fetchProjectData = async (projectId) => {
    setLoadingFeed(true);

    try {
      const { data: fileList, error } = await supabase.storage
        .from('project-photos')
        .list(projectId);

      if (!error && fileList) {
        const files = fileList
          .filter(f => f.name !== '.emptyFolderPlaceholder')
          .map(f => {
            const { data: urlData } = supabase.storage
              .from('project-photos')
              .getPublicUrl(`${projectId}/${f.name}`);
            return { name: f.name, url: urlData.publicUrl };
          });

        const imageExts = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif'];
        const csvExts = ['.csv', '.txt'];

        setPhotos(files.filter(f => imageExts.some(ext => f.name.toLowerCase().endsWith(ext))));
        setCsvFiles(files.filter(f => csvExts.some(ext => f.name.toLowerCase().endsWith(ext))));
      } else {
        setPhotos([]);
        setCsvFiles([]);
      }
    } catch {
      setPhotos([]);
      setCsvFiles([]);
    }

    try {
      const { data: logs, error } = await supabase
        .from('math_logs')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (!error && logs) {
        setMathLogs(logs);
      } else {
        setMathLogs([]);
      }
    } catch {
      setMathLogs([]);
    }

    setLoadingFeed(false);
  };

  // --- DATABASE ACTION LOGIC ---
  const handleArchive = async () => {
    const confirm = window.confirm(`WARNING: Are you sure you want to archive ${project?.project_name}?`);
    if (!confirm) return;

    try {
      const { error } = await supabase
        .from('projects')
        .update({ status: 'archived' }) // Adjust if your status column is named differently
        .eq('id', project.id);

      if (error) throw error;
      
      onClose(); // Close the drawer
      window.location.reload(); // Hard refresh to instantly remove the dot from the God's Eye Map
    } catch (err) {
      console.error("Archive Failed:", err);
      alert("Failed to archive project. Check permissions.");
    }
  };

  const handleReview = async () => {
    try {
      // Assuming a 'status' or 'reviewed' column exists. Modify as needed.
      await supabase.from('projects').update({ status: 'reviewed' }).eq('id', project.id);
      onClose();
    } catch (err) {
      console.error(err);
      onClose();
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 998,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.3s ease'
        }}
      />

      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: '480px', maxWidth: '100vw',
        zIndex: 999,
        backgroundColor: '#0A0A0A',
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
        display: 'flex', flexDirection: 'column',
        fontFamily: FONT,
        overflowY: 'auto'
      }}>

        <div style={{
          padding: '24px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          flexShrink: 0
        }}>
          <div style={{ minWidth: 0 }}>
            <h2 style={{
              margin: '0 0 6px 0', fontSize: '1.3rem', fontWeight: '700',
              color: '#FFFFFF', letterSpacing: '-0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {project?.project_name || 'Project'}
            </h2>
            <span style={{ fontFamily: MONO, fontSize: '0.75rem', color: '#555', letterSpacing: '0.02em' }}>
              ID: {project?.id ? project.id.substring(0, 8).toUpperCase() : '---'}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)', border: 'none', borderRadius: '8px',
              width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, transition: 'background-color 0.15s ease'
            }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.12)'}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.06)'}
          >
            <X size={18} color="#A1A1AA" strokeWidth={2} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 28px' }}>

          <Section icon={<Camera size={15} color="#007AFF" strokeWidth={2.2} />} title="Field Feed" color="#007AFF">
            {loadingFeed && photos.length === 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} style={{
                    aspectRatio: '1', borderRadius: '10px',
                    backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.06)',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }} />
                ))}
              </div>
            ) : photos.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                {photos.map((photo, i) => (
                  <div key={i} style={{
                    aspectRatio: '1', borderRadius: '10px', overflow: 'hidden',
                    backgroundColor: '#141414', border: '1px solid rgba(255,255,255,0.06)'
                  }}>
                    <img
                      src={photo.url}
                      alt={photo.name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>No field photos synced yet.</EmptyState>
            )}
          </Section>

          <Section icon={<FileSpreadsheet size={15} color="#FF9F0A" strokeWidth={2.2} />} title="Raw Field Data" color="#FF9F0A">
            {csvFiles.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {csvFiles.map((file, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', backgroundColor: '#141414', borderRadius: '10px',
                    border: '1px solid rgba(255,255,255,0.06)',
                    transition: 'border-color 0.15s ease'
                  }}
                    onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(255, 159, 10, 0.3)'}
                    onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <FileSpreadsheet size={16} color="#FF9F0A" strokeWidth={2} style={{ flexShrink: 0 }} />
                      <span style={{
                        fontFamily: MONO, fontSize: '0.78rem', color: '#A1A1AA',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }}>
                        {file.name}
                      </span>
                    </div>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '6px 12px', borderRadius: '6px',
                        backgroundColor: 'rgba(255, 159, 10, 0.1)', border: 'none',
                        color: '#FF9F0A', fontSize: '0.72rem', fontWeight: '700',
                        fontFamily: FONT, textDecoration: 'none', flexShrink: 0,
                        transition: 'background-color 0.15s ease'
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 159, 10, 0.2)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(255, 159, 10, 0.1)'}
                    >
                      <Download size={13} strokeWidth={2.5} />
                      Download
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState>
                {loadingFeed ? 'Scanning for files...' : 'No raw files uploaded.'}
              </EmptyState>
            )}
          </Section>

          <Section icon={<Crosshair size={15} color="#FF453A" strokeWidth={2.2} />} title="Tolerance Bullseye" color="#FF453A">
            {mathLogs.length > 0 ? (
              <ToleranceBullseye logs={mathLogs} />
            ) : (
              <EmptyState>
                {loadingFeed ? 'Loading math logs...' : 'No Harrison Math logs synced yet.'}
              </EmptyState>
            )}
          </Section>

          {/* SECTION 4: ACTION BAR */}
          <div style={{ paddingTop: '32px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* CORE NAVIGATION ROW */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  onClose();
                  // Assumes your route is /project/[id]/live or /live/[id]
                  // Change the string below if your setup is different.
                  navigate(`/project/${project.id}`); 
                }}
                style={{
                  flex: 1, padding: '14px',
                  backgroundColor: '#007AFF', color: '#FFF',
                  border: 'none', borderRadius: '10px',
                  fontSize: '0.9rem', fontWeight: '700', fontFamily: FONT,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#0056b3'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#007AFF'; }}
              >
                <ExternalLink size={16} strokeWidth={2.5} />
                Live View
              </button>

              <button
                onClick={() => {
                  onClose();
                  navigate(`/dispatch/${project.id}`); // Adjust this string to your dispatch route
                }}
                style={{
                  flex: 1, padding: '14px',
                  backgroundColor: '#141414', color: '#FFF',
                  border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px',
                  fontSize: '0.9rem', fontWeight: '700', fontFamily: FONT,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = '#141414'; }}
              >
                <Send size={16} strokeWidth={2.5} />
                Dispatch
              </button>
            </div>

            {/* REVIEW BUTTON */}
            <button
              onClick={handleReview}
              style={{
                width: '100%', padding: '16px',
                backgroundColor: '#FFFFFF', color: '#000',
                border: 'none', borderRadius: '12px',
                fontSize: '0.95rem', fontWeight: '700', fontFamily: FONT,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease',
                boxShadow: '0 4px 20px rgba(255, 255, 255, 0.06)'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(255,255,255,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(255,255,255,0.06)'; }}
            >
              <CheckCircle size={18} strokeWidth={2.5} />
              Mark as Reviewed
            </button>

            {/* PDF BUTTON */}
            <button
              onClick={() => generateReport(project, mathLogs)}
              style={{
                width: '100%', padding: '16px',
                backgroundColor: '#0A0A0A', color: '#F59E0B',
                border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px',
                fontSize: '0.95rem', fontWeight: '700', fontFamily: FONT,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 0 15px rgba(245, 158, 11, 0.05)'
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.6)'; 
                e.currentTarget.style.boxShadow = '0 8px 25px rgba(245, 158, 11, 0.15)'; 
                e.currentTarget.style.transform = 'scale(1.02)'; 
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.borderColor = 'rgba(245, 158, 11, 0.3)'; 
                e.currentTarget.style.boxShadow = '0 0 15px rgba(245, 158, 11, 0.05)'; 
                e.currentTarget.style.transform = 'scale(1)'; 
              }}
            >
              <FileCheck size={18} strokeWidth={2.5} />
              Generate Certified Accuracy Report
            </button>

            {/* ARCHIVE BUTTON */}
            <button
              onClick={handleArchive}
              style={{
                marginTop: '4px', padding: '12px',
                backgroundColor: 'transparent', color: '#FF453A',
                border: 'none', borderRadius: '10px',
                fontSize: '0.85rem', fontWeight: '600', fontFamily: FONT,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,69,58,0.1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              <Archive size={15} strokeWidth={2.5} />
              Archive Project
            </button>

          </div>

        </div>
      </div>
    </>
  );
}

function Section({ icon, title, color, children }) {
  return (
    <div style={{ paddingTop: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '8px',
          backgroundColor: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          {icon}
        </div>
        <span style={{
          fontSize: '0.72rem', fontWeight: '700', textTransform: 'uppercase',
          letterSpacing: '0.08em', color: '#A1A1AA'
        }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div style={{
      padding: '24px', textAlign: 'center', color: '#555',
      fontSize: '0.85rem', fontStyle: 'italic',
      backgroundColor: '#141414', borderRadius: '12px',
      border: '1px solid rgba(255,255,255,0.04)'
    }}>
      {children}
    </div>
  );
}

const BULLSEYE_SIZE = 300;
const BULLSEYE_CENTER = BULLSEYE_SIZE / 2;
const TOLERANCE_LIMIT = 0.02;      
const OUTER_RADIUS_FT = 0.06;      

const SCALE = (BULLSEYE_SIZE * 0.40) / OUTER_RADIUS_FT;

function ToleranceBullseye({ logs }) {
  const [hovered, setHovered] = useState(null);

  const innerR = TOLERANCE_LIMIT * SCALE;
  const outerR = OUTER_RADIUS_FT * SCALE;

  const enrichedLogs = logs.map(log => {
    const dN = roundTo3(parseFloat(log.delta_n) || 0);
    const dE = roundTo3(parseFloat(log.delta_e) || 0);
    const dZ = roundTo3(parseFloat(log.delta_z) || 0);
    const vector3d = roundTo3(Math.sqrt(dN * dN + dE * dE + dZ * dZ));
    const rejected = vector3d > TOLERANCE_LIMIT;
    const precision_score = vector3d > 0 ? roundTo3(1 / vector3d) : 9999.999;
    return { ...log, dN, dE, dZ, vector3d, precision_score, status: rejected ? 'REJECTED' : 'PASS' };
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
      <svg width={BULLSEYE_SIZE} height={BULLSEYE_SIZE} viewBox={`0 0 ${BULLSEYE_SIZE} ${BULLSEYE_SIZE}`} style={{ backgroundColor: '#0A0A0A', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.06)' }}>
        {/* Outer ring */}
        <circle cx={BULLSEYE_CENTER} cy={BULLSEYE_CENTER} r={outerR} fill="none" stroke="rgba(255,69,58,0.15)" strokeWidth="1" />
        {/* Inner ring (tolerance) */}
        <circle cx={BULLSEYE_CENTER} cy={BULLSEYE_CENTER} r={innerR} fill="rgba(52,211,153,0.06)" stroke="rgba(52,211,153,0.3)" strokeWidth="1" />
        {/* Crosshairs */}
        <line x1={BULLSEYE_CENTER} y1={0} x2={BULLSEYE_CENTER} y2={BULLSEYE_SIZE} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <line x1={0} y1={BULLSEYE_CENTER} x2={BULLSEYE_SIZE} y2={BULLSEYE_CENTER} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        {/* Center dot */}
        <circle cx={BULLSEYE_CENTER} cy={BULLSEYE_CENTER} r={3} fill="#555" />
        {/* Plot points */}
        {enrichedLogs.map((log, i) => {
          const cx = BULLSEYE_CENTER + (log.dE * SCALE);
          const cy = BULLSEYE_CENTER - (log.dN * SCALE);
          const color = log.status === 'REJECTED' ? '#FF453A' : '#34D399';
          return (
            <circle
              key={log.id || i}
              cx={Math.max(4, Math.min(BULLSEYE_SIZE - 4, cx))}
              cy={Math.max(4, Math.min(BULLSEYE_SIZE - 4, cy))}
              r={hovered === i ? 6 : 4}
              fill={color}
              fillOpacity={hovered === i ? 1 : 0.7}
              stroke={hovered === i ? '#fff' : 'none'}
              strokeWidth={1.5}
              style={{ cursor: 'pointer', transition: 'r 0.15s ease, fill-opacity 0.15s ease' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            />
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', fontSize: '0.72rem', color: '#A1A1AA' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#34D399', display: 'inline-block' }} /> Pass
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#FF453A', display: 'inline-block' }} /> Rejected
        </span>
      </div>

      {/* Hovered detail */}
      {hovered !== null && enrichedLogs[hovered] && (
        <div style={{
          fontFamily: MONO, fontSize: '0.72rem', color: '#A1A1AA',
          backgroundColor: '#141414', padding: '10px 14px', borderRadius: '8px',
          border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center'
        }}>
          Pt {enrichedLogs[hovered].point_number || hovered + 1} — 3D: {enrichedLogs[hovered].vector3d}′ — {enrichedLogs[hovered].status}
        </div>
      )}
    </div>
  );
}

function roundTo3(n) {
  return Math.round(n * 1000) / 1000;
}