import React, { useState, useEffect } from 'react';
import { FolderUp, FileText, Download, Trash2, Loader } from 'lucide-react';

export default function ProjectVault({ supabase, project }) {
  const [files, setFiles] = useState([]);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    if (project?.id) {
      fetchFiles();
    }
  }, [project]);

  const fetchFiles = async () => {
    // Look inside the project_vault bucket, in a folder named after the project ID
    const { data, error } = await supabase.storage
      .from('project_vault')
      .list(`projects/${project.id}`, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      console.error('Error fetching files:', error);
    } else {
      // Filter out the empty placeholder folder object if it exists
      setFiles(data.filter(file => file.name !== '.emptyFolderPlaceholder'));
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !project?.id) return; // Safety check

    setIsUploading(true);
    
    // We must ensure the supabase client is actually being used here
    const { data, error } = await supabase.storage
      .from('project_vault')
      .upload(`projects/${project.id}/${Date.now()}_${file.name}`, file);

    setIsUploading(false);
    

    if (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file. Check console.');
    } else {
      fetchFiles(); // Refresh the list
    }
  };

  const handleDownload = async (fileName) => {
    const { data, error } = await supabase.storage
      .from('project_vault')
      .createSignedUrl(`projects/${project.id}/${fileName}`, 60); // 60 second valid link

    if (error) {
      console.error('Download error:', error);
    } else {
      window.open(data.signedUrl, '_blank');
    }
  };

  const handleDelete = async (fileName) => {
    if (!window.confirm(`Delete ${fileName}? This cannot be undone.`)) return;

    const { error } = await supabase.storage
      .from('project_vault')
      .remove([`projects/${project.id}/${fileName}`]);

    if (error) {
      console.error('Delete error:', error);
    } else {
      fetchFiles();
    }
  };

  return (
    <div style={{ backgroundColor: 'var(--bg-surface)', padding: '24px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-main)' }}>
          <FolderUp size={20} color="var(--brand-teal)" /> The Vault
        </h3>
        
        {/* HIDDEN FILE INPUT TRICK */}
        <label style={{
          backgroundColor: isUploading ? 'transparent' : 'var(--brand-teal)',
          color: isUploading ? 'var(--text-muted)' : '#fff',
          padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: isUploading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9em', transition: '0.2s'
        }}>
          {isUploading ? <Loader size={16} className="spinning" /> : <FolderUp size={16} />}
          {isUploading ? 'Uploading...' : 'Upload File'}
          <input type="file" onChange={handleFileUpload} disabled={isUploading} style={{ display: 'none' }} />
        </label>
      </div>

      <div style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', overflow: 'hidden' }}>
        {files.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <FileText size={40} style={{ opacity: 0.3, marginBottom: '12px' }} />
            <p style={{ margin: 0 }}>No files in the vault for this project yet.</p>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.85em' }}>Upload deeds, DWGs, or control sheets.</p>
          </div>
        ) : (
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <tbody>
              {files.map((file, index) => (
                <tr key={file.id || index} style={{ borderBottom: index !== files.length - 1 ? '1px solid var(--border-subtle)' : 'none', backgroundColor: 'rgba(0,0,0,0.2)' }}>
                  <td style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <FileText size={18} color="var(--brand-amber)" />
                    <span style={{ color: 'var(--text-main)', fontSize: '0.95em' }}>
                      {/* Remove the timestamp prefix for cleaner UI display */}
                      {file.name.substring(file.name.indexOf('_') + 1)}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                    <button onClick={() => handleDownload(file.name)} style={{ background: 'none', border: 'none', color: 'var(--brand-teal)', cursor: 'pointer', padding: '4px 8px' }} title="Download">
                      <Download size={18} />
                    </button>
                    <button onClick={() => handleDelete(file.name)} style={{ background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer', padding: '4px 8px' }} title="Delete">
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinning { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}