// ============================================================================
// src/crew-pwa/installPrompt.js
// Owns the BeforeInstallPromptEvent lifecycle and the "hide-forever"
// dismissal state. Exposes a tiny pubsub so the useCrewSync hook can
// reactively show or hide the install banner.
// ============================================================================

const LOG = '[install-prompt]';
const DISMISS_KEY = 'surveyos:install-banner-dismissed';

let deferredPrompt = null;
let isInstalled = false;
let isBannerDismissed = false;

const listeners = new Set();

function notify() {
    const state = getInstallState();
    for (const cb of listeners) {
        try {
            cb(state);
        } catch (err) {
            console.warn(`${LOG} listener threw:`, err);
        }
    }
}

function detectInstalled() {
    if (typeof window === 'undefined') return false;
    // Chrome / Android / desktop
    if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
    // iOS Safari home-screen apps
    if (typeof navigator !== 'undefined' && navigator.standalone === true) return true;
    return false;
}

function readDismissed() {
    if (typeof localStorage === 'undefined') return false;
    try {
        return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
        return false;
    }
}

let initialized = false;

/**
 * Wire up the install-prompt listener. Idempotent — safe to call on every
 * mount. Must be called before useCrewSync can report isInstallable.
 */
export function initializeInstallPrompt() {
    if (initialized || typeof window === 'undefined') return;
    initialized = true;

    isInstalled = detectInstalled();
    isBannerDismissed = readDismissed();

    window.addEventListener('beforeinstallprompt', (e) => {
        // Hold onto the event so we can trigger it later — browsers no
        // longer support auto-prompting.
        e.preventDefault();
        deferredPrompt = e;
        console.debug(`${LOG} beforeinstallprompt captured`);
        notify();
    });

    window.addEventListener('appinstalled', () => {
        console.debug(`${LOG} appinstalled — clearing prompt`);
        deferredPrompt = null;
        isInstalled = true;
        notify();
    });

    // Fire once so subscribers get initial state even if no prompt event
    // ever arrives (e.g. iOS, already-installed).
    notify();
}

/**
 * Current install-related state. Pure read; safe from render.
 */
export function getInstallState() {
    return {
        isInstallable: Boolean(deferredPrompt) && !isInstalled,
        isInstalled,
        isBannerDismissed,
        // Banner shows when we CAN install AND the user hasn't hidden it.
        showInstallBanner: Boolean(deferredPrompt) && !isInstalled && !isBannerDismissed,
    };
}

/**
 * Subscribe to install-state changes. Returns an unsubscribe function.
 * @param {(state: ReturnType<typeof getInstallState>) => void} cb
 */
export function subscribeInstallState(cb) {
    listeners.add(cb);
    try {
        cb(getInstallState());
    } catch (err) {
        console.warn(`${LOG} initial notify threw:`, err);
    }
    return () => listeners.delete(cb);
}

/**
 * Trigger the browser's native install prompt. Resolves with the user's
 * choice ('accepted' | 'dismissed' | null if nothing to prompt).
 */
export async function triggerInstall() {
    if (!deferredPrompt) {
        console.debug(`${LOG} no deferred prompt to trigger`);
        return null;
    }
    try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        console.debug(`${LOG} user choice: ${choice?.outcome}`);
        // The prompt is single-use — clear it even if they dismissed so
        // the banner disappears until the browser fires another event.
        deferredPrompt = null;
        if (choice?.outcome === 'accepted') {
            isInstalled = true;
        }
        notify();
        return choice?.outcome ?? null;
    } catch (err) {
        console.warn(`${LOG} prompt failed:`, err);
        deferredPrompt = null;
        notify();
        return null;
    }
}

/**
 * Persist a "never show this banner again" flag.
 */
export function dismissInstallBanner() {
    isBannerDismissed = true;
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch (err) {
            console.warn(`${LOG} localStorage write failed:`, err);
        }
    }
    notify();
}

/**
 * Reset the dismissed flag. Not exposed from useCrewSync — intended for
 * settings UI in a later stage or for tests.
 */
export function resetInstallBannerDismissal() {
    isBannerDismissed = false;
    if (typeof localStorage !== 'undefined') {
        try {
            localStorage.removeItem(DISMISS_KEY);
        } catch {
            // ignore
        }
    }
    notify();
}
