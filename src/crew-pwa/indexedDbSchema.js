// ============================================================================
// src/crew-pwa/indexedDbSchema.js
// Schema + openers for the crew-side IndexedDB. Database name carries a
// version suffix so future schema migrations can land cleanly alongside
// in-flight installs. This file is the only place that talks to `idb`.
// ============================================================================

import { openDB } from 'idb';

export const DB_NAME = 'surveyos_crew_v1';
export const DB_VERSION = 1;

// Store names are exported so callers never pass raw strings around.
export const STORES = Object.freeze({
    ASSIGNMENTS: 'assignments',
    ASSIGNMENT_POINTS: 'assignment_points',
    DESIGN_POINTS: 'design_points',
    QC_POINTS: 'qc_points',
    PENDING_WRITES: 'pending_writes',
    META: 'meta',
});

// Cache scope — assignments older than this (by assignment_date) are not
// pulled. Matches the Stage 8 "7 days" decision.
export const CACHE_WINDOW_DAYS = 7;

// Sync statuses on every stored row. pending = has unsynced local edits;
// conflict = push got rejected by the remote's merge policy.
export const SYNC_STATUS = Object.freeze({
    SYNCED: 'synced',
    PENDING: 'pending',
    CONFLICT: 'conflict',
});

let dbPromise = null;

/**
 * Open (or cache) a handle to the crew IndexedDB. Safe to call repeatedly —
 * the promise is memoized so we never open two connections.
 * @returns {Promise<IDBPDatabase>}
 */
export function openCrewDB() {
    if (dbPromise) return dbPromise;
    dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db, oldVersion /*, newVersion, transaction */) {
            // v0 → v1 bootstrap.
            if (oldVersion < 1) {
                // assignments
                if (!db.objectStoreNames.contains(STORES.ASSIGNMENTS)) {
                    const s = db.createObjectStore(STORES.ASSIGNMENTS, { keyPath: 'id' });
                    s.createIndex('by_project', 'project_id');
                    s.createIndex('by_status', 'status');
                    s.createIndex('by_date', 'assignment_date');
                    s.createIndex('by_sync', 'sync_status');
                }
                // assignment_points
                if (!db.objectStoreNames.contains(STORES.ASSIGNMENT_POINTS)) {
                    const s = db.createObjectStore(STORES.ASSIGNMENT_POINTS, { keyPath: 'id' });
                    s.createIndex('by_assignment', 'assignment_id');
                    s.createIndex('by_design_point', 'design_point_id');
                }
                // design_points (read-only for crew)
                if (!db.objectStoreNames.contains(STORES.DESIGN_POINTS)) {
                    const s = db.createObjectStore(STORES.DESIGN_POINTS, { keyPath: 'id' });
                    s.createIndex('by_project', 'project_id');
                    s.createIndex('by_point_id', 'point_id');
                }
                // qc_points — includes locally-created rows before first sync
                if (!db.objectStoreNames.contains(STORES.QC_POINTS)) {
                    const s = db.createObjectStore(STORES.QC_POINTS, { keyPath: 'id' });
                    s.createIndex('by_assignment', 'assignment_id');
                    s.createIndex('by_design_point', 'design_point_id');
                    s.createIndex('by_run', 'run_id');
                    s.createIndex('by_sync', 'sync_status');
                }
                // pending_writes — the offline write queue
                if (!db.objectStoreNames.contains(STORES.PENDING_WRITES)) {
                    db.createObjectStore(STORES.PENDING_WRITES, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                }
                // meta — small KV store: last_sync_at, user_id, firm_id, etc.
                if (!db.objectStoreNames.contains(STORES.META)) {
                    db.createObjectStore(STORES.META, { keyPath: 'key' });
                }
            }
        },
        blocked() {
            console.warn('[crew-pwa] IndexedDB open blocked — another tab is holding an older version.');
        },
        blocking() {
            console.warn('[crew-pwa] IndexedDB version upgrade needed — close other tabs.');
        },
        terminated() {
            console.warn('[crew-pwa] IndexedDB connection terminated unexpectedly.');
            dbPromise = null;
        },
    });
    return dbPromise;
}

/**
 * Shortcut: read a meta KV value. Returns `undefined` if not set.
 * @param {string} key
 */
export async function getMeta(key) {
    const db = await openCrewDB();
    const row = await db.get(STORES.META, key);
    return row?.value;
}

/**
 * Shortcut: write a meta KV value.
 * @param {string} key
 * @param {unknown} value
 */
export async function setMeta(key, value) {
    const db = await openCrewDB();
    await db.put(STORES.META, { key, value });
}

/**
 * Nuke the local database. Used when the signed-in user changes and we
 * need to prevent one crew's data from leaking into another's session.
 */
export async function clearAllCrewData() {
    const db = await openCrewDB();
    const tx = db.transaction(Object.values(STORES), 'readwrite');
    await Promise.all(Object.values(STORES).map((s) => tx.objectStore(s).clear()));
    await tx.done;
}
