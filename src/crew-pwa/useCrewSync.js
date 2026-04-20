// ============================================================================
// src/crew-pwa/useCrewSync.js
// React hook that unifies sync status (from syncManager) with install
// state (from installPrompt). Stage 9 UI components subscribe once via
// this hook and get both signals in a single re-render.
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import {
    getSyncStatus,
    subscribeSyncStatus,
    manualSync as doManualSync,
} from './syncManager.js';
import {
    getInstallState,
    subscribeInstallState,
    triggerInstall,
    dismissInstallBanner as doDismiss,
    initializeInstallPrompt,
} from './installPrompt.js';

/**
 * Returns a unified view of PWA + sync state plus three action callbacks.
 *
 * @returns {{
 *   isOnline: boolean,
 *   isInstalled: boolean,
 *   isInstallable: boolean,
 *   lastSyncAt: Date | null,
 *   pendingWriteCount: number,
 *   lastSyncError: string | null,
 *   showInstallBanner: boolean,
 *   installApp: () => Promise<string | null>,
 *   dismissInstallBanner: () => void,
 *   manualSync: () => Promise<void>,
 * }}
 */
export default function useCrewSync() {
    const [sync, setSync] = useState(() => getSyncStatus());
    const [install, setInstall] = useState(() => getInstallState());

    useEffect(() => {
        // Idempotent — safe to call every mount.
        initializeInstallPrompt();
        const unsubSync = subscribeSyncStatus(setSync);
        const unsubInstall = subscribeInstallState(setInstall);
        return () => {
            unsubSync();
            unsubInstall();
        };
    }, []);

    const installApp = useCallback(() => triggerInstall(), []);
    const dismissInstallBanner = useCallback(() => doDismiss(), []);
    const manualSync = useCallback(() => doManualSync(), []);

    return {
        isOnline: sync.isOnline,
        isInstalled: install.isInstalled,
        isInstallable: install.isInstallable,
        lastSyncAt: sync.lastSyncAt,
        pendingWriteCount: sync.pendingWriteCount,
        lastSyncError: sync.lastSyncError,
        showInstallBanner: install.showInstallBanner,
        installApp,
        dismissInstallBanner,
        manualSync,
    };
}
