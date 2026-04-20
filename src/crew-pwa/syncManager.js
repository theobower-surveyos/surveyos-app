// ============================================================================
// src/crew-pwa/syncManager.js
// The offline-capable sync layer for the crew PWA. Keeps local IndexedDB in
// step with the Supabase truth, queues offline writes, and applies a
// field-layer-specific merge when pushes conflict with remote changes.
// Stage 8 ships the infrastructure; Stage 9 wires UI to consume it.
// ============================================================================

import {
    STORES,
    SYNC_STATUS,
    CACHE_WINDOW_DAYS,
    openCrewDB,
    getMeta,
    setMeta,
} from './indexedDbSchema.js';

const LOG = '[sync-manager]';
const META_LAST_SYNC = 'last_sync_at';
const META_USER_ID = 'user_id';
const META_FIRM_ID = 'firm_id';
const META_LAST_ERROR = 'last_sync_error';

// Crew-owned columns on stakeout_qc_points that the RLS column-protection
// trigger lets field roles modify. These are the columns the merge policy
// treats as "crew wins". Everything else on that table is PM-owned.
const CREW_QC_FIELDS = new Set(['field_fit_reason', 'field_fit_note', 'built_on_status']);

// Crew never writes to stakeout_assignments directly. Listed here for
// documentation and as a safety check if the queue ever receives one.
const PM_ASSIGNMENT_FIELDS = new Set([
    'title', 'assignment_date', 'party_chief_id', 'expected_hours',
    'default_tolerance_h', 'default_tolerance_v', 'notes',
    'client_contact_name', 'client_contact_phone', 'client_contact_role',
    'client_contact_notes', 'status',
]);

// Cacheable assignment statuses. Reconciled work is history — never cached.
const CACHEABLE_STATUSES = ['draft', 'sent', 'in_progress', 'submitted'];

// Single module-level pubsub for status changes. React's useCrewSync hook
// subscribes here.
const listeners = new Set();
let currentStatus = {
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    lastSyncAt: null,
    pendingWriteCount: 0,
    lastSyncError: null,
};

// Supabase + identity captured at init. Held in a closure so the public
// API can stay argument-free.
let ctx = null;

function emit(next) {
    currentStatus = { ...currentStatus, ...next };
    for (const cb of listeners) {
        try {
            cb(currentStatus);
        } catch (err) {
            console.warn(`${LOG} listener threw:`, err);
        }
    }
}

function wireOnlineEvents() {
    if (typeof window === 'undefined') return;
    window.addEventListener('online', () => {
        console.debug(`${LOG} online — draining pending writes`);
        emit({ isOnline: true });
        pushPendingWrites().catch((err) => {
            console.warn(`${LOG} push on online event failed:`, err);
        });
    });
    window.addEventListener('offline', () => {
        console.debug(`${LOG} offline`);
        emit({ isOnline: false });
    });
}

/**
 * Boot the sync layer. Idempotent — calling a second time with the same
 * user/firm is a no-op; calling with a different user clears local cache.
 *
 * @param {{ supabase: any, userId: string, firmId: string }} params
 */
export async function initializeSync({ supabase, userId, firmId }) {
    if (ctx && ctx.userId === userId && ctx.firmId === firmId) return;

    // User switch — scrub cached data from the previous account.
    const priorUser = await getMeta(META_USER_ID);
    if (priorUser && priorUser !== userId) {
        console.debug(`${LOG} user switch (${priorUser} → ${userId}) — clearing local cache`);
        const { clearAllCrewData } = await import('./indexedDbSchema.js');
        await clearAllCrewData();
    }

    ctx = { supabase, userId, firmId };
    await setMeta(META_USER_ID, userId);
    await setMeta(META_FIRM_ID, firmId);

    wireOnlineEvents();

    const lastSyncAt = await getMeta(META_LAST_SYNC);
    emit({ lastSyncAt: lastSyncAt ? new Date(lastSyncAt) : null });

    await refreshPendingCount();

    // Trigger a pull if the cache is stale or absent.
    const stale =
        !lastSyncAt ||
        Date.now() - new Date(lastSyncAt).getTime() > CACHE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (stale && currentStatus.isOnline) {
        console.debug(`${LOG} cache stale — running initial pull`);
        pullAssignmentData().catch((err) => {
            console.warn(`${LOG} initial pull failed:`, err);
        });
    }
}

/**
 * Fetch assignments the current user can work on, plus all related design
 * points, assignment points, and qc points. Writes to IndexedDB. Updates
 * last_sync_at.
 */
export async function pullAssignmentData() {
    if (!ctx) {
        console.warn(`${LOG} pullAssignmentData called before init`);
        return;
    }
    const { supabase, userId } = ctx;
    emit({ lastSyncError: null });

    try {
        const cutoff = new Date(Date.now() - CACHE_WINDOW_DAYS * 24 * 60 * 60 * 1000)
            .toISOString()
            .slice(0, 10);

        // Pull cacheable assignments assigned to this user. Crew members
        // are identified by party_chief_id OR projects.assigned_crew —
        // RLS already enforces visibility; we just ask for what we can see.
        const { data: assignments, error: asgErr } = await supabase
            .from('stakeout_assignments')
            .select('*')
            .in('status', CACHEABLE_STATUSES)
            .gte('assignment_date', cutoff)
            .order('assignment_date', { ascending: false });
        if (asgErr) throw asgErr;

        const asgList = assignments || [];
        const asgIds = asgList.map((a) => a.id);
        const projectIds = [...new Set(asgList.map((a) => a.project_id).filter(Boolean))];

        const [apRes, dpRes, qpRes] = await Promise.all([
            asgIds.length > 0
                ? supabase.from('stakeout_assignment_points').select('*').in('assignment_id', asgIds)
                : Promise.resolve({ data: [] }),
            projectIds.length > 0
                ? supabase.from('stakeout_design_points').select('*').in('project_id', projectIds)
                : Promise.resolve({ data: [] }),
            asgIds.length > 0
                ? supabase.from('stakeout_qc_points').select('*').in('assignment_id', asgIds)
                : Promise.resolve({ data: [] }),
        ]);

        const db = await openCrewDB();
        const tx = db.transaction(
            [STORES.ASSIGNMENTS, STORES.ASSIGNMENT_POINTS, STORES.DESIGN_POINTS, STORES.QC_POINTS],
            'readwrite',
        );

        // Wipe caches that are strictly derived from remote — pending-write
        // data is protected by being keyed under pending_writes, not here.
        await Promise.all([
            tx.objectStore(STORES.ASSIGNMENTS).clear(),
            tx.objectStore(STORES.ASSIGNMENT_POINTS).clear(),
            tx.objectStore(STORES.DESIGN_POINTS).clear(),
        ]);

        const now = new Date().toISOString();
        for (const a of asgList) {
            await tx.objectStore(STORES.ASSIGNMENTS).put({
                ...a,
                sync_status: SYNC_STATUS.SYNCED,
                last_fetched_at: now,
            });
        }
        for (const ap of apRes.data || []) {
            await tx.objectStore(STORES.ASSIGNMENT_POINTS).put({
                ...ap,
                sync_status: SYNC_STATUS.SYNCED,
            });
        }
        for (const dp of dpRes.data || []) {
            await tx.objectStore(STORES.DESIGN_POINTS).put(dp);
        }

        // For qc_points we preserve any locally-pending rows. Remote rows
        // overwrite synced rows only — pending / conflict stay put.
        const qcStore = tx.objectStore(STORES.QC_POINTS);
        for (const qp of qpRes.data || []) {
            const existing = await qcStore.get(qp.id);
            if (existing && existing.sync_status !== SYNC_STATUS.SYNCED) {
                console.debug(`${LOG} preserving local qc_point ${qp.id} during pull`);
                continue;
            }
            await qcStore.put({ ...qp, sync_status: SYNC_STATUS.SYNCED });
        }

        await tx.done;

        await setMeta(META_LAST_SYNC, now);
        await setMeta(META_LAST_ERROR, null);
        emit({ lastSyncAt: new Date(now), lastSyncError: null });
        console.debug(`${LOG} pull complete — ${asgList.length} assignments, ${(qpRes.data || []).length} qc points`);
    } catch (err) {
        const msg = err?.message || String(err);
        console.error(`${LOG} pull failed:`, err);
        await setMeta(META_LAST_ERROR, msg);
        emit({ lastSyncError: msg });
    }
}

/**
 * Drain the pending-writes queue. Oldest first. Each item is retried on
 * the next call if its push fails without a structural merge conflict.
 */
export async function pushPendingWrites() {
    if (!ctx) {
        console.warn(`${LOG} pushPendingWrites called before init`);
        return;
    }
    if (!currentStatus.isOnline) {
        console.debug(`${LOG} offline — deferring push`);
        return;
    }

    const db = await openCrewDB();

    // Snapshot queue — mutations happen in a fresh tx per item so an early
    // failure doesn't strand later items.
    const all = await db.getAll(STORES.PENDING_WRITES);
    if (all.length === 0) return;

    for (const item of all) {
        const ok = await pushSingleWrite(item);
        if (ok) {
            const writeTx = db.transaction(STORES.PENDING_WRITES, 'readwrite');
            await writeTx.objectStore(STORES.PENDING_WRITES).delete(item.id);
            await writeTx.done;
        } else {
            const retry = (item.retry_count || 0) + 1;
            const writeTx = db.transaction(STORES.PENDING_WRITES, 'readwrite');
            await writeTx.objectStore(STORES.PENDING_WRITES).put({ ...item, retry_count: retry });
            await writeTx.done;
            // Cap retries at 10 before we stop hammering. Stage 9's UI can
            // surface this so the user knows something's wedged.
            if (retry >= 10) {
                console.warn(`${LOG} write ${item.id} (${item.table_name}) stuck after 10 retries`);
            }
        }
    }

    await refreshPendingCount();
}

async function pushSingleWrite(item) {
    const { supabase } = ctx;
    const { table_name, row_id, action, payload } = item;

    try {
        if (table_name === 'stakeout_qc_points') {
            if (action === 'insert') {
                // Inserts never conflict — id is client-generated.
                console.debug(`${LOG} push insert qc_points ${row_id}`);
                const { error } = await supabase.from(table_name).insert(payload);
                if (error) throw error;
                await markRowSynced(STORES.QC_POINTS, row_id);
                return true;
            }
            if (action === 'update') {
                // Only crew-owned columns are valid updates per the
                // column-protection trigger. Filter defensively.
                const crewOnly = {};
                for (const [k, v] of Object.entries(payload || {})) {
                    if (CREW_QC_FIELDS.has(k)) crewOnly[k] = v;
                }
                if (Object.keys(crewOnly).length === 0) {
                    console.debug(`${LOG} qc_points update had no crew-owned fields — dropping`);
                    return true; // treat as successfully no-op
                }
                console.debug(`${LOG} push update qc_points ${row_id} fields=${Object.keys(crewOnly).join(',')}`);
                const { error } = await supabase
                    .from(table_name)
                    .update(crewOnly)
                    .eq('id', row_id);
                if (error) throw error;
                await markRowSynced(STORES.QC_POINTS, row_id);
                return true;
            }
        }

        if (table_name === 'stakeout_assignments') {
            if (action === 'update') {
                // Crew never owns any column on this table in Phase 1.
                // If one somehow landed in the queue, drop it rather than
                // clobber PM edits.
                const crewOwned = Object.keys(payload || {}).filter(
                    (k) => !PM_ASSIGNMENT_FIELDS.has(k),
                );
                if (crewOwned.length === 0) {
                    console.debug(`${LOG} assignment update has only PM fields — dropping (PM always wins)`);
                    return true;
                }
                console.warn(`${LOG} unexpected crew-owned assignment fields: ${crewOwned.join(',')} — skipping`);
                return true;
            }
        }

        if (table_name === 'stakeout_assignment_points') {
            console.debug(`${LOG} assignment_points writes are PM-only — dropping queued ${action}`);
            return true;
        }

        console.warn(`${LOG} unknown table ${table_name}; skipping`);
        return true;
    } catch (err) {
        console.error(`${LOG} push failed for ${action} ${table_name} ${row_id}:`, err);
        return false;
    }
}

async function markRowSynced(storeName, id) {
    const db = await openCrewDB();
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const row = await store.get(id);
    if (row) {
        await store.put({ ...row, sync_status: SYNC_STATUS.SYNCED });
    }
    await tx.done;
}

/**
 * Enqueue a write for later sync. Applies it to local IndexedDB first so
 * UI stays consistent offline, then triggers a push if online.
 *
 * @param {{
 *   table: 'stakeout_qc_points'|'stakeout_assignments'|'stakeout_assignment_points',
 *   action: 'insert'|'update'|'delete',
 *   payload: object,
 *   rowId?: string
 * }} params
 */
export async function queueWrite({ table, action, payload, rowId }) {
    if (!ctx) {
        console.warn(`${LOG} queueWrite called before init`);
        return;
    }

    const db = await openCrewDB();
    const id = rowId || payload?.id;

    // Optimistic local apply so the UI reads the change immediately.
    if (table === 'stakeout_qc_points') {
        const tx = db.transaction(STORES.QC_POINTS, 'readwrite');
        const store = tx.objectStore(STORES.QC_POINTS);
        if (action === 'insert') {
            await store.put({ ...payload, sync_status: SYNC_STATUS.PENDING });
        } else if (action === 'update' && id) {
            const existing = await store.get(id);
            if (existing) {
                await store.put({ ...existing, ...payload, sync_status: SYNC_STATUS.PENDING });
            }
        }
        await tx.done;
    }

    const queueTx = db.transaction(STORES.PENDING_WRITES, 'readwrite');
    await queueTx.objectStore(STORES.PENDING_WRITES).add({
        table_name: table,
        row_id: id,
        action,
        payload,
        created_at: new Date().toISOString(),
        retry_count: 0,
    });
    await queueTx.done;

    await refreshPendingCount();

    if (currentStatus.isOnline) {
        pushPendingWrites().catch((err) => {
            console.warn(`${LOG} push after queueWrite failed:`, err);
        });
    }
}

async function refreshPendingCount() {
    const db = await openCrewDB();
    const count = await db.count(STORES.PENDING_WRITES);
    emit({ pendingWriteCount: count });
}

/**
 * Snapshot of current sync state. Safe to call from render; subscribe via
 * subscribeSyncStatus for updates.
 */
export function getSyncStatus() {
    return { ...currentStatus };
}

/**
 * Subscribe to sync-state changes. Returns an unsubscribe function.
 * @param {(status: typeof currentStatus) => void} callback
 */
export function subscribeSyncStatus(callback) {
    listeners.add(callback);
    // Fire once so the subscriber has initial state.
    try {
        callback(currentStatus);
    } catch (err) {
        console.warn(`${LOG} initial notify threw:`, err);
    }
    return () => listeners.delete(callback);
}

/**
 * Convenience: force a pull + push cycle. Used by the manual-sync button.
 */
export async function manualSync() {
    if (!ctx) return;
    await pullAssignmentData();
    await pushPendingWrites();
}
