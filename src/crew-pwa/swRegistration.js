// ============================================================================
// src/crew-pwa/swRegistration.js
// Thin wrapper around vite-plugin-pwa's virtual:pwa-register. Only called
// from App.jsx's production-only useEffect so dev reloads stay fast and
// cached-asset confusion is avoided during development.
// ============================================================================

const LOG = '[sw-registration]';

let registered = false;
let updateSW = null;

/**
 * Register the Workbox-generated service worker. No-op in dev builds and
 * on browsers without service-worker support. Idempotent.
 */
export async function registerServiceWorker() {
    if (registered) return;
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
        console.debug(`${LOG} no serviceWorker support — skipping`);
        return;
    }
    if (!import.meta.env.PROD) {
        console.debug(`${LOG} dev build — skipping registration`);
        return;
    }

    try {
        // virtual:pwa-register is injected by vite-plugin-pwa at build.
        // Dynamic import so dev bundles don't complain about the module.
        const { registerSW } = await import('virtual:pwa-register');
        updateSW = registerSW({
            immediate: false,
            onNeedRefresh() {
                console.debug(`${LOG} update available — will activate on next reload`);
            },
            onOfflineReady() {
                console.debug(`${LOG} cached for offline use`);
            },
            onRegisteredSW(swUrl) {
                console.debug(`${LOG} registered ${swUrl}`);
            },
            onRegisterError(err) {
                console.warn(`${LOG} registration failed:`, err);
            },
        });
        registered = true;
    } catch (err) {
        console.warn(`${LOG} virtual:pwa-register import failed:`, err);
    }
}

/**
 * Trigger immediate activation of a waiting service worker (if one is
 * queued via autoUpdate). Exposed for Stage 9's "update available" UI.
 */
export async function applyPendingUpdate() {
    if (typeof updateSW === 'function') {
        await updateSW(true);
    }
}
