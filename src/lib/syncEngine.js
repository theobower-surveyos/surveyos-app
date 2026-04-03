// ================================================================
// SurveyOS Sync Engine — Background Queue Drain
// ================================================================
// Decoupled from any React component lifecycle. Runs as a
// singleton, survives navigation, and adapts to network state.
//
// The engine:
//   1. Reads pending mutations from the vault
//   2. Marks each as in_flight (prevents double-processing)
//   3. Sends to Supabase with the idempotency key
//   4. Marks confirmed or failed (with exponential backoff)
//   5. Adapts interval based on NetworkProbe state
//   6. Triggers Service Worker Background Sync as a fallback
// ================================================================

import {
  getPendingQueue,
  markInFlight,
  markConfirmed,
  markFailed,
  getPhotoBlob,
  removePhotoBlob,
  recoverWal,
  garbageCollect,
  getVaultStats,
  setMeta,
} from './offlineStore.js';
import { NetworkProbe } from './networkProbe.js';

let instance = null;

export class SyncEngine {
  constructor(supabase) {
    if (instance) return instance;
    instance = this;

    this.supabase = supabase;
    this.probe = new NetworkProbe(supabase.supabaseUrl);
    this.intervalId = null;
    this.isSyncing = false;
    this.listeners = new Set();

    // Adapt sync interval when network state changes
    this.probe.onChange((state) => {
      this._reschedule();
      this._notify('network', state);
    });

    // Drain immediately when tab becomes visible (TSC5 return)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.drainNow();
      }
    });

    // Boot sequence
    this._boot();
  }

  static init(supabase) {
    return new SyncEngine(supabase);
  }

  static getInstance() {
    return instance;
  }

  // ── LIFECYCLE ──

  async _boot() {
    // 1. Recover any incomplete WAL entries from a crash
    const replayed = await recoverWal();
    if (replayed > 0) console.log(`[SyncEngine] WAL recovery: ${replayed} orphaned intents`);

    // 2. Garbage collect old confirmed items
    await garbageCollect(86400000); // 24h

    // 3. Register Service Worker for Background Sync
    await this._registerServiceWorker();

    // 4. Start the adaptive drain loop
    this._reschedule();

    // 5. Immediate drain on boot
    this.drainNow();
  }

  async _registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    try {
      const reg = await navigator.serviceWorker.register('/sw-vault.js', { scope: '/' });

      // Listen for messages from the SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_COMPLETE') {
          this._notify('sync_complete', event.data.count);
        }
      });

      this._swRegistration = reg;
    } catch (err) {
      console.warn('[SyncEngine] Service Worker registration failed:', err.message);
    }
  }

  _reschedule() {
    if (this.intervalId) clearInterval(this.intervalId);

    const interval = this.probe.getSyncInterval();
    if (interval) {
      this.intervalId = setInterval(() => this.drainNow(), interval);
    }
    // If interval is null (offline/dead), we rely on visibility + SW events
  }

  // ── PUBLIC API ──

  async drainNow() {
    if (this.isSyncing) return; // guard against concurrent drains
    if (!this.probe.isOnline()) {
      // Request SW Background Sync instead
      this._requestBackgroundSync();
      return;
    }

    this.isSyncing = true;
    this._notify('sync_start', null);

    let synced = 0;
    let failed = 0;

    try {
      const queue = await getPendingQueue();
      if (queue.length === 0) {
        this.isSyncing = false;
        this._notify('sync_end', { synced: 0, failed: 0 });
        return;
      }

      for (const item of queue) {
        // Respect backoff schedule
        if (item.nextRetryAt && new Date(item.nextRetryAt) > new Date()) continue;

        try {
          await markInFlight(item.idempotencyKey);
          const result = await this._processItem(item);

          if (result.success) {
            await markConfirmed(item.idempotencyKey, result.receiptId);
            synced++;
          } else {
            await markFailed(item.idempotencyKey, result.error);
            failed++;
          }
        } catch (err) {
          await markFailed(item.idempotencyKey, err.message);
          failed++;
        }
      }

      // Record last successful sync time
      if (synced > 0) {
        await setMeta('lastSyncAt', new Date().toISOString());
        await setMeta('lastSyncCount', synced);
      }
    } catch (err) {
      console.error('[SyncEngine] Drain error:', err);
    }

    this.isSyncing = false;
    this._notify('sync_end', { synced, failed });
  }

  async getStats() {
    return getVaultStats();
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  destroy() {
    if (this.intervalId) clearInterval(this.intervalId);
    this.probe.destroy();
    this.listeners.clear();
    instance = null;
  }

  // ── MUTATION PROCESSING ──

  async _processItem(item) {
    const { actionType, payload, idempotencyKey } = item;

    switch (actionType) {
      case 'csv_upload':
        return this._syncCSV(payload, idempotencyKey);

      case 'photo_upload':
        return this._syncPhoto(payload, idempotencyKey);

      case 'checklist_toggle':
        return this._syncChecklist(payload, idempotencyKey);

      default:
        return { success: false, error: `Unknown action type: ${actionType}` };
    }
  }

  async _syncCSV(payload, idempotencyKey) {
    const points = payload.points;
    if (!points || points.length === 0) {
      return { success: true, receiptId: 'empty' };
    }

    // Batch in chunks of 50 to avoid timeout on slow connections
    const CHUNK_SIZE = 50;
    for (let i = 0; i < points.length; i += CHUNK_SIZE) {
      const chunk = points.slice(i, i + CHUNK_SIZE);
      const { error } = await this.supabase.from('survey_points').insert(chunk);

      if (error) {
        // Check if it's a duplicate key error (idempotent retry)
        if (error.code === '23505') continue; // unique violation — already synced
        return { success: false, error: error.message };
      }
    }

    return { success: true, receiptId: idempotencyKey };
  }

  async _syncPhoto(payload, idempotencyKey) {
    const { blobId, fileName, contentType } = payload;

    // If we have a blobId, read the raw blob from the photo store
    let uploadData;
    if (blobId) {
      const photoRecord = await getPhotoBlob(blobId);
      if (!photoRecord?.blob) {
        return { success: false, error: 'Photo blob not found in vault' };
      }
      uploadData = photoRecord.blob;
    } else if (payload.base64) {
      // Backward compat: old-style base64 payloads
      uploadData = base64ToBlob(payload.base64, contentType);
    } else {
      return { success: false, error: 'No photo data in payload' };
    }

    const { error } = await this.supabase.storage
      .from('project-photos')
      .upload(fileName, uploadData, {
        contentType: contentType || 'image/jpeg',
        upsert: false,
      });

    if (error) {
      // 409 = file already exists (idempotent retry)
      if (error.statusCode === '409' || error.message?.includes('already exists')) {
        // Clean up the blob even though upload was a dupe
        if (blobId) await removePhotoBlob(blobId).catch(() => {});
        return { success: true, receiptId: 'duplicate' };
      }
      return { success: false, error: error.message };
    }

    // Clean up blob from IndexedDB after successful upload
    if (blobId) await removePhotoBlob(blobId).catch(() => {});
    return { success: true, receiptId: idempotencyKey };
  }

  async _syncChecklist(payload, idempotencyKey) {
    const { projectId, checklist } = payload;
    if (!projectId) return { success: false, error: 'Missing projectId' };

    const { error } = await this.supabase
      .from('projects')
      .update({ scope_checklist: checklist })
      .eq('id', projectId);

    if (error) return { success: false, error: error.message };
    return { success: true, receiptId: idempotencyKey };
  }

  // ── SERVICE WORKER INTEGRATION ──

  async _requestBackgroundSync() {
    if (!this._swRegistration) return;
    try {
      if ('sync' in this._swRegistration) {
        await this._swRegistration.sync.register('vault-drain');
      }
    } catch {
      // Background Sync API not supported or denied
    }
  }

  // ── INTERNAL ──

  _notify(event, data) {
    for (const cb of this.listeners) {
      try { cb(event, data); } catch { /* listener error */ }
    }
  }
}

// Utility: base64 data URI to Blob (backward compat for old vault entries)
function base64ToBlob(base64, contentType) {
  const parts = base64.split(',');
  const byteString = atob(parts[1] || parts[0]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: contentType || 'application/octet-stream' });
}
