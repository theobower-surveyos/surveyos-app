import React, { useState, useEffect } from 'react';
import { Wifi, WifiOff, RefreshCw, Database, AlertTriangle } from 'lucide-react';

export default function NetworkOps() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncQueue, setSyncQueue] = useState([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Listen for browser network changes
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Mocking an IndexedDB check for the smoke test
    checkOfflineStorage();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const checkOfflineStorage = async () => {
    // In the real app, this reads from idb (IndexedDB)
    // For the UI smoke test, we'll simulate finding 3 cached field logs
    setSyncQueue([
      { id: 1, type: 'survey_point', description: 'Cached Point #401', time: '10 mins ago' },
      { id: 2, type: 'survey_point', description: 'Cached Point #402', time: '8 mins ago' },
      { id: 3, type: 'photo_upload', description: 'Monument Image', time: '2 mins ago' }
    ]);
  };

  const handleForceSync = () => {
    if (!isOnline) {
      alert("Cannot sync while offline. Reconnect to a network first.");
      return;
    }
    
    setIsSyncing(true);
    // Simulate the time it takes to push IndexedDB to Supabase
    setTimeout(() => {
      setSyncQueue([]);
      setIsSyncing(false);
    }, 1500);
  };

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      <header style={{ marginBottom: '32px' }}>
        <h1 style={{ margin: '0 0 8px 0', fontSize: '2.2em', fontWeight: '800', letterSpacing: '-0.5px' }}>
          Network & Sync Engine
        </h1>
        <p style={{ color: 'var(--text-muted)', margin: 0 }}>
          Manage offline field data, Service Workers, and database conflict resolution.
        </p>
      </header>

      {/* STATUS BANNER */}
      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '24px', borderRadius: '12px', marginBottom: '24px',
        backgroundColor: isOnline ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
        border: `1px solid ${isOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {isOnline ? <Wifi size={32} color="var(--success)" /> : <WifiOff size={32} color="var(--error)" />}
          <div>
            <h3 style={{ margin: '0 0 4px 0', color: isOnline ? 'var(--success)' : 'var(--error)' }}>
              System is {isOnline ? 'Online' : 'Offline'}
            </h3>
            <p style={{ margin: 0, fontSize: '0.9em', color: 'var(--text-muted)' }}>
              {isOnline 
                ? "Live connection to Supabase is active. Auto-sync enabled." 
                : "No network connection. Saving all field data locally to IndexedDB."}
            </p>
          </div>
        </div>
        <button 
          onClick={handleForceSync}
          disabled={!isOnline || isSyncing || syncQueue.length === 0}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer',
            backgroundColor: isOnline && syncQueue.length > 0 ? 'var(--brand-teal)' : '#334155',
            color: '#fff', border: 'none', transition: '0.2s',
            opacity: (!isOnline || isSyncing || syncQueue.length === 0) ? 0.5 : 1
          }}
        >
          <RefreshCw size={18} className={isSyncing ? "spinning" : ""} />
          {isSyncing ? 'Syncing to Server...' : 'Force Sync'}
        </button>
      </div>

      {/* SYNC QUEUE */}
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} color="var(--brand-amber)" /> Local Cache (IndexedDB)
          </h3>
          <span style={{ backgroundColor: 'var(--brand-teal-light)', padding: '2px 10px', borderRadius: '100px', fontSize: '0.85em', fontWeight: 'bold' }}>
            {syncQueue.length} Pending
          </span>
        </div>
        
        {syncQueue.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>All field data is fully synced with the master database.</p>
          </div>
        ) : (
          <div style={{ padding: '0 20px' }}>
            {syncQueue.map((item, i) => (
              <div key={item.id} style={{ 
                display: 'flex', justifyContent: 'space-between', padding: '16px 0', 
                borderBottom: i !== syncQueue.length - 1 ? '1px solid var(--border-subtle)' : 'none' 
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertTriangle size={16} color="var(--brand-amber)" />
                  <span style={{ fontWeight: '500' }}>{item.description}</span>
                </div>
                <span style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinning { animation: spin 1s linear infinite; }
      `}</style>
    </div>
  );
}