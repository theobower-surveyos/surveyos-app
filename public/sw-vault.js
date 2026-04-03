// ================================================================
// SurveyOS Service Worker — Background Vault Drain
// ================================================================
// This is the last line of defense against data loss.
// When the browser tab is suspended (TSC5 app-switch to Trimble Access),
// the OS can still fire 'sync' events on this Service Worker.
//
// It reads directly from IndexedDB and pushes pending mutations
// to Supabase via fetch(), independent of the React app lifecycle.
// ================================================================

const SUPABASE_URL = '%%SUPABASE_URL%%'; // Replaced at build/deploy time
const SUPABASE_ANON_KEY = '%%SUPABASE_ANON_KEY%%'; // Replaced at build/deploy time

const DB_NAME = 'SurveyOS_Field_Vault';
const DB_VERSION = 3;

// ── INSTALL & ACTIVATE ──

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// ── BACKGROUND SYNC ──
// Fired by the OS when connectivity is available, even if the page is suspended.

self.addEventListener('sync', (event) => {
  if (event.tag === 'vault-drain') {
    event.waitUntil(drainVault());
  }
});

// ── PERIODIC BACKGROUND SYNC ──
// Chrome 80+: fires periodically even without explicit trigger.

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'vault-keepalive') {
    event.waitUntil(drainVault());
  }
});

// ── MESSAGE FROM PAGE ──
// Manual sync trigger from the SyncEngine.

self.addEventListener('message', (event) => {
  if (event.data?.type === 'DRAIN_VAULT') {
    drainVault().then((count) => {
      // Notify all open tabs
      self.clients.matchAll().then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'SYNC_COMPLETE', count });
        }
      });
    });
  }
});

// ================================================================
// VAULT DRAIN — reads IndexedDB directly, pushes to Supabase
// ================================================================

async function drainVault() {
  let db;
  try {
    db = await openIndexedDB();
  } catch {
    return 0; // DB not available
  }

  const pending = await getPendingMutations(db);
  if (pending.length === 0) return 0;

  // We need an auth token. Try to get it from IndexedDB metadata.
  // The page-side SyncEngine stores it there.
  const token = await getStoredToken(db);

  let synced = 0;

  for (const item of pending) {
    try {
      // Mark in-flight
      item.status = 'in_flight';
      item.lastAttempt = new Date().toISOString();
      await putMutation(db, item);

      const success = await processItem(item, token);

      if (success) {
        // Remove from queue
        await deleteMutation(db, item.idempotencyKey);
        // Clean up photo blob if applicable
        if (item.payload?.blobId) {
          await deletePhotoBlob(db, item.payload.blobId);
        }
        synced++;
      } else {
        // Mark failed with retry
        item.status = 'pending';
        item.retryCount = (item.retryCount || 0) + 1;
        await putMutation(db, item);
      }
    } catch {
      // Put it back as pending
      item.status = 'pending';
      await putMutation(db, item).catch(() => {});
    }
  }

  db.close();
  return synced;
}

async function processItem(item, token) {
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  if (item.actionType === 'csv_upload') {
    const points = item.payload?.points;
    if (!points || points.length === 0) return true;

    const res = await fetch(`${SUPABASE_URL}/rest/v1/survey_points`, {
      method: 'POST',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify(points),
    });

    return res.ok || res.status === 409;
  }

  if (item.actionType === 'checklist_toggle') {
    const { projectId, checklist } = item.payload;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/projects?id=eq.${projectId}`, {
      method: 'PATCH',
      headers: { ...headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({ scope_checklist: checklist }),
    });

    return res.ok;
  }

  if (item.actionType === 'photo_upload') {
    // Photos require the blob from the photo_blobs store.
    // If we can't read it here, skip and let the page-side engine handle it.
    // (Service Workers can read IndexedDB but Blob handling is limited.)
    return false; // Defer to page-side SyncEngine for photos
  }

  return false;
}

// ================================================================
// RAW IndexedDB ACCESS (no idb library in Service Worker)
// ================================================================

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      // Don't upgrade from the SW — let the page handle migrations
      request.transaction.abort();
      reject(new Error('DB needs upgrade'));
    };
  });
}

function getPendingMutations(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutation_queue', 'readonly');
    const store = tx.objectStore('mutation_queue');
    const request = store.getAll();
    request.onsuccess = () => {
      const all = request.result || [];
      resolve(all.filter(m => m.status === 'pending'));
    };
    request.onerror = () => reject(request.error);
  });
}

function putMutation(db, item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutation_queue', 'readwrite');
    const store = tx.objectStore('mutation_queue');
    const request = store.put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deleteMutation(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('mutation_queue', 'readwrite');
    const store = tx.objectStore('mutation_queue');
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function deletePhotoBlob(db, blobId) {
  return new Promise((resolve, reject) => {
    if (!db.objectStoreNames.contains('photo_blobs')) return resolve();
    const tx = db.transaction('photo_blobs', 'readwrite');
    const store = tx.objectStore('photo_blobs');
    const request = store.delete(blobId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function getStoredToken(db) {
  return new Promise((resolve) => {
    if (!db.objectStoreNames.contains('sync_metadata')) return resolve(null);
    const tx = db.transaction('sync_metadata', 'readonly');
    const store = tx.objectStore('sync_metadata');
    const request = store.get('auth_token');
    request.onsuccess = () => resolve(request.result?.value || null);
    request.onerror = () => resolve(null);
  });
}
