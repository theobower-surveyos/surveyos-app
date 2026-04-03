import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const MONO = "'JetBrains Mono', 'SF Mono', monospace";
const BUCKET = 'project-vault';

const FILE_ICONS = {
  pdf:  { icon: '📄', color: '#FF453A' },
  dwg:  { icon: '📐', color: '#007AFF' },
  dxf:  { icon: '📐', color: '#5E5CE6' },
  csv:  { icon: '📊', color: '#FF9F0A' },
  txt:  { icon: '📝', color: '#A1A1AA' },
  jpg:  { icon: '🖼', color: '#32D74B' },
  jpeg: { icon: '🖼', color: '#32D74B' },
  png:  { icon: '🖼', color: '#32D74B' },
  tif:  { icon: '🖼', color: '#30D5C8' },
  tiff: { icon: '🖼', color: '#30D5C8' },
  xlsx: { icon: '📊', color: '#34C759' },
  docx: { icon: '📄', color: '#007AFF' },
};

function getFileMeta(name) {
  const ext = (name || '').split('.').pop().toLowerCase();
  return FILE_ICONS[ext] || { icon: '📁', color: '#A1A1AA' };
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function ProjectVault({ projectId, profile }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const fetchFiles = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(projectId, { sortBy: { column: 'created_at', order: 'desc' } });

      if (!error && data) {
        const parsed = data
          .filter(f => f.name !== '.emptyFolderPlaceholder')
          .map(f => {
            const { data: urlData } = supabase.storage
              .from(BUCKET)
              .getPublicUrl(`${projectId}/${f.name}`);
            return {
              name: f.name,
              url: urlData?.publicUrl,
              size: f.metadata?.size || 0,
              createdAt: f.created_at,
            };
          });
        setFiles(parsed);
      } else {
        setFiles([]);
      }
    } catch {
      setFiles([]);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchFiles(); }, [fetchFiles]);

  const handleUpload = async (fileList) => {
    if (!fileList || fileList.length === 0 || !projectId) return;
    setUploading(true);
    setUploadStatus(null);

    let uploaded = 0;
    let failed = 0;

    for (const file of fileList) {
      const filePath = `${projectId}/${file.name}`;
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });

      if (error) {
        if (error.message?.includes('already exists')) {
          // File exists — count as success
          uploaded++;
        } else {
          console.error(`Upload failed for ${file.name}:`, error.message);
          failed++;
        }
      } else {
        uploaded++;
      }
    }

    setUploadStatus(`${uploaded} file${uploaded !== 1 ? 's' : ''} uploaded${failed > 0 ? `, ${failed} failed` : ''}`);
    setTimeout(() => setUploadStatus(null), 4000);
    setUploading(false);
    setIsDragging(false);
    await fetchFiles();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    handleUpload(e.dataTransfer.files);
  };

  const handleDelete = async (fileName) => {
    if (!window.confirm(`Delete "${fileName}" permanently?`)) return;
    const { error } = await supabase.storage
      .from(BUCKET)
      .remove([`${projectId}/${fileName}`]);
    if (!error) setFiles(prev => prev.filter(f => f.name !== fileName));
  };

  const isOffice = ['owner', 'admin', 'pm'].includes(profile?.role);

  return (
    <div style={{
      marginTop: '40px', backgroundColor: 'var(--bg-surface)',
      padding: '28px', borderRadius: '12px',
      border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '1.05em' }}>
          Project Vault
        </h3>
        <span style={{ fontSize: '0.75em', color: 'var(--text-muted)', fontFamily: MONO }}>
          {files.length} file{files.length !== 1 && 's'}
        </span>
      </div>

      {/* DRAG & DROP UPLOAD ZONE */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${uploading ? 'var(--brand-amber)' : isDragging ? '#007AFF' : 'var(--border-subtle)'}`,
          borderRadius: '10px', padding: '24px', textAlign: 'center',
          cursor: uploading ? 'wait' : 'pointer',
          backgroundColor: isDragging ? 'rgba(0, 122, 255, 0.04)' : 'transparent',
          transition: 'border-color 0.2s, background-color 0.2s',
          marginBottom: '20px',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.dwg,.dxf,.csv,.txt,.jpg,.jpeg,.png,.tif,.tiff,.xlsx,.docx"
          style={{ display: 'none' }}
          onChange={(e) => handleUpload(e.target.files)}
        />
        <p style={{ margin: '0 0 4px', fontWeight: '600', color: 'var(--text-main)', fontSize: '0.95em' }}>
          {uploading ? 'Uploading...' : 'Drop files here or click to browse'}
        </p>
        <p style={{ margin: 0, fontSize: '0.75em', color: 'var(--text-muted)' }}>
          PDF, DWG, DXF, CSV, images, and Office documents
        </p>
      </div>

      {uploadStatus && (
        <div style={{
          padding: '10px 14px', borderRadius: '8px', marginBottom: '16px',
          backgroundColor: 'rgba(50, 215, 75, 0.08)', border: '1px solid rgba(50, 215, 75, 0.2)',
          color: '#32D74B', fontSize: '0.82em', fontWeight: '600',
        }}>
          {uploadStatus}
        </div>
      )}

      {/* FILE LIST */}
      {loading ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontStyle: 'italic', fontSize: '0.85em' }}>Loading vault...</p>
      ) : files.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontStyle: 'italic', fontSize: '0.85em' }}>No documents in the vault yet.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {files.map((file) => {
            const meta = getFileMeta(file.name);
            return (
              <div
                key={file.name}
                style={{
                  display: 'flex', alignItems: 'center', gap: '12px',
                  padding: '12px 14px', borderRadius: '8px',
                  backgroundColor: 'var(--bg-dark)', border: '1px solid var(--border-subtle)',
                  transition: 'border-color 0.15s ease',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = meta.color + '44'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-subtle)'}
              >
                {/* Icon */}
                <span style={{ fontSize: '1.3em', flexShrink: 0 }}>{meta.icon}</span>

                {/* Name + size */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: 'block', fontWeight: '600', color: 'var(--text-main)',
                    fontSize: '0.88em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {file.name}
                  </span>
                  <span style={{ fontSize: '0.72em', color: 'var(--text-muted)', fontFamily: MONO }}>
                    {formatBytes(file.size)}
                  </span>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    download
                    style={{
                      padding: '5px 12px', borderRadius: '6px',
                      backgroundColor: 'rgba(0, 122, 255, 0.08)',
                      color: '#007AFF', fontSize: '0.72em', fontWeight: '700',
                      textDecoration: 'none', transition: 'background-color 0.15s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 122, 255, 0.16)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgba(0, 122, 255, 0.08)'}
                  >
                    Download
                  </a>
                  {isOffice && (
                    <button
                      onClick={() => handleDelete(file.name)}
                      style={{
                        padding: '5px 10px', borderRadius: '6px', border: 'none',
                        backgroundColor: 'transparent', color: 'var(--text-muted)',
                        fontSize: '0.72em', fontWeight: '600', cursor: 'pointer',
                        transition: 'color 0.15s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#FF453A'}
                      onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
