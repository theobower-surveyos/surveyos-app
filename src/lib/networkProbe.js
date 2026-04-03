// ================================================================
// SurveyOS Network Probe — Adaptive Connectivity Detection
// ================================================================
// Classifies network state as: fast | slow | dead | offline
// The SyncEngine uses this to set its drain interval.
//
// State Machine:
//   OFFLINE  ←→  ONLINE → probe RTT →  FAST (<500ms)  → sync every 5s
//                                       SLOW (<5s)     → sync every 30s
//                                       DEAD (>5s)     → vault only, wait
// ================================================================

const FAST_THRESHOLD_MS = 500;
const SLOW_THRESHOLD_MS = 5000;

export class NetworkProbe {
  constructor(supabaseUrl) {
    this.probeUrl = supabaseUrl + '/rest/v1/';
    this.state = navigator.onLine ? 'online' : 'offline';
    this.rtt = null;
    this.listeners = new Set();

    // Browser connectivity events
    this._onOnline = () => { this.probe(); };
    this._onOffline = () => { this._setState('offline'); };

    window.addEventListener('online', this._onOnline);
    window.addEventListener('offline', this._onOffline);

    // Visibility change: probe immediately on tab return (TSC5 app-switch)
    this._onVisibility = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        this.probe();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    // Initial probe
    if (navigator.onLine) this.probe();
  }

  async probe() {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), SLOW_THRESHOLD_MS + 1000);

      await fetch(this.probeUrl, {
        method: 'HEAD',
        mode: 'cors',
        signal: controller.signal,
      });

      clearTimeout(timeout);
      this.rtt = performance.now() - start;

      if (this.rtt < FAST_THRESHOLD_MS) {
        this._setState('fast');
      } else if (this.rtt < SLOW_THRESHOLD_MS) {
        this._setState('slow');
      } else {
        this._setState('dead');
      }
    } catch {
      this._setState('dead');
      this.rtt = null;
    }

    return this.state;
  }

  getSyncInterval() {
    switch (this.state) {
      case 'fast': return 5000;
      case 'slow': return 30000;
      case 'dead':
      case 'offline':
      default: return null; // don't auto-sync — rely on events
    }
  }

  isOnline() {
    return this.state === 'fast' || this.state === 'slow';
  }

  onChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  _setState(newState) {
    if (newState === this.state) return;
    const prev = this.state;
    this.state = newState;
    for (const cb of this.listeners) {
      try { cb(newState, prev); } catch { /* listener error */ }
    }
  }

  destroy() {
    window.removeEventListener('online', this._onOnline);
    window.removeEventListener('offline', this._onOffline);
    document.removeEventListener('visibilitychange', this._onVisibility);
    this.listeners.clear();
  }
}
