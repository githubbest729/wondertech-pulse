/* WonderTech Pulse — PWA lifecycle: install prompt, service worker, Badging API,
 * Periodic Background Sync / Background Sync registration, Window Controls Overlay, capability report. */
(function (root) {
  'use strict';

  const PERIODIC_TAG = 'wtp-feed-refresh';
  const SYNC_TAG = 'wtp-sync';
  const PERIODIC_MIN_INTERVAL = 6 * 60 * 60 * 1000;

  const PWA = {
    deferredPrompt: null,
    registration: null,
    handlers: {},
    updateRequested: false,
    sw: { supported: false, state: 'not registered', reason: '' },
    periodic: 'not checked',
    background: 'not checked'
  };

  const nav = root.navigator;
  const doc = root.document;

  function isStandalone() {
    return (root.matchMedia && (root.matchMedia('(display-mode: standalone)').matches ||
      root.matchMedia('(display-mode: window-controls-overlay)').matches ||
      root.matchMedia('(display-mode: minimal-ui)').matches)) || nav.standalone === true;
  }

  function wcoVisible() {
    return !!(nav.windowControlsOverlay && nav.windowControlsOverlay.visible);
  }

  function applyDisplayMode() {
    const cl = doc.documentElement.classList;
    cl.toggle('standalone', isStandalone());
    cl.toggle('wco', wcoVisible());
  }

  /* ---------------------------- install prompt ---------------------------- */

  async function promptInstall() {
    const evt = PWA.deferredPrompt;
    if (!evt) return { outcome: 'unavailable' };
    evt.prompt();
    let choice = { outcome: 'dismissed' };
    try { choice = await evt.userChoice; } catch (_) {}
    PWA.deferredPrompt = null;
    return choice;
  }

  /* ---------------------------- service worker ---------------------------- */

  async function registerServiceWorker() {
    const h = PWA.handlers;
    if (!('serviceWorker' in nav)) {
      PWA.sw = { supported: false, state: 'unsupported', reason: 'This browser has no service worker support' };
      return PWA.sw;
    }
    if (!root.isSecureContext) {
      PWA.sw = { supported: false, state: 'insecure context', reason: 'Service workers require HTTPS or http://localhost' };
      return PWA.sw;
    }
    try {
      const reg = await nav.serviceWorker.register('sw.js', { scope: './', updateViaCache: 'none' });
      PWA.registration = reg;
      PWA.sw = { supported: true, state: 'registered', reason: '' };

      if (reg.waiting && nav.serviceWorker.controller && h.onUpdate) h.onUpdate(reg);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && nav.serviceWorker.controller && h.onUpdate) h.onUpdate(reg);
        });
      });

      nav.serviceWorker.addEventListener('controllerchange', () => {
        if (PWA.updateRequested) root.location.reload();
      });
      nav.serviceWorker.addEventListener('message', (e) => { if (h.onMessage) h.onMessage(e.data || {}); });

      // Check for a new SW periodically while the app stays open (field tablets often stay open for days).
      setInterval(() => { reg.update().catch(() => {}); }, 60 * 60 * 1000);

      nav.serviceWorker.ready.then((r) => registerSyncs(r)).catch(() => {});
      return PWA.sw;
    } catch (err) {
      PWA.sw = { supported: true, state: 'registration failed', reason: err.message };
      return PWA.sw;
    }
  }

  function applyUpdate() {
    const reg = PWA.registration;
    if (reg && reg.waiting) {
      PWA.updateRequested = true;
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      root.location.reload();
    }
  }

  /* ----------------------- Background / Periodic Sync ----------------------- */

  async function registerSyncs(reg) {
    // Periodic Background Sync (Chromium, installed PWAs only)
    try {
      if ('periodicSync' in reg) {
        let state = 'prompt';
        try { state = (await nav.permissions.query({ name: 'periodic-background-sync' })).state; } catch (_) {}
        if (state === 'granted') {
          await reg.periodicSync.register(PERIODIC_TAG, { minInterval: PERIODIC_MIN_INTERVAL });
          PWA.periodic = 'registered (every ≥ 6 h)';
        } else {
          PWA.periodic = 'available — install the app to enable (' + state + ')';
        }
      } else {
        PWA.periodic = 'unsupported — using sync-on-open fallback';
      }
    } catch (err) {
      PWA.periodic = 'error: ' + err.message;
    }
    PWA.background = 'sync' in reg ? 'available' : 'unsupported — using sync-on-reconnect fallback';
    if (PWA.handlers.onCapabilities) PWA.handlers.onCapabilities();
  }

  async function registerBackgroundSync() {
    try {
      const reg = PWA.registration || (await nav.serviceWorker.ready);
      if (reg && 'sync' in reg) {
        await reg.sync.register(SYNC_TAG);
        PWA.background = 'queued — will run when connectivity returns';
        return true;
      }
    } catch (_) { /* fall through */ }
    return false;
  }

  /* ------------------------------- badging ------------------------------- */

  async function setBadge(count) {
    try {
      if (count > 0 && 'setAppBadge' in nav) await nav.setAppBadge(count);
      else if ('clearAppBadge' in nav) await nav.clearAppBadge();
      else if (count === 0 && 'setAppBadge' in nav) await nav.setAppBadge(0);
    } catch (_) { /* badging is best-effort */ }
  }

  /* ---------------------------- capability report ---------------------------- */

  function capabilities(storage) {
    const yes = (b) => (b ? 'on' : 'off');
    const list = [
      { name: 'Service worker (offline shell)', state: PWA.sw.supported && PWA.sw.state === 'registered' ? 'on' : 'off', note: PWA.sw.state + (PWA.sw.reason ? ' — ' + PWA.sw.reason : '') + (nav.serviceWorker && nav.serviceWorker.controller ? ' · controlling this page' : '') },
      { name: 'Installable', state: isStandalone() ? 'on' : (PWA.deferredPrompt ? 'on' : 'mid'), note: isStandalone() ? 'running as an installed app' : (PWA.deferredPrompt ? 'install prompt ready' : 'use the browser menu to install if no prompt appears') },
      { name: 'Window Controls Overlay', state: yes('windowControlsOverlay' in nav), note: wcoVisible() ? 'active — custom title bar in use' : ('windowControlsOverlay' in nav ? 'supported (installed desktop app only)' : 'not supported by this browser') },
      { name: 'Periodic Background Sync', state: /^registered/.test(PWA.periodic) ? 'on' : (/^available|not checked/.test(PWA.periodic) ? 'mid' : 'off'), note: PWA.periodic },
      { name: 'Background Sync', state: /^unsupported/.test(PWA.background) ? 'off' : (PWA.background === 'not checked' ? 'mid' : 'on'), note: PWA.background },
      { name: 'Badging API', state: yes('setAppBadge' in nav), note: 'setAppBadge' in nav ? 'shows unreviewed critical count on the app icon' : 'not supported by this browser' },
      { name: 'Web Share', state: yes('share' in nav), note: 'share' in nav ? 'available for report export' : 'falls back to download / copy' },
      { name: 'File handling', state: yes('launchQueue' in root), note: 'launchQueue' in root ? 'open .json / .xml feed files directly' : 'not supported by this browser' },
      { name: 'Persistent storage', state: storage && storage.persisted ? 'on' : (storage && storage.supported ? 'mid' : 'off'), note: storage ? (storage.persisted ? 'granted — the browser will not evict the archive' : (storage.supported ? 'not granted — best-effort storage' : 'not supported')) : 'checking…' }
    ];
    return list;
  }

  /* --------------------------------- init --------------------------------- */

  function init(handlers) {
    PWA.handlers = handlers || {};
    const h = PWA.handlers;

    root.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      PWA.deferredPrompt = e;
      if (h.onInstallAvailable) h.onInstallAvailable();
    });
    root.addEventListener('appinstalled', () => {
      PWA.deferredPrompt = null;
      applyDisplayMode();
      if (h.onInstalled) h.onInstalled();
    });
    root.addEventListener('online', () => h.onNetwork && h.onNetwork(true));
    root.addEventListener('offline', () => h.onNetwork && h.onNetwork(false));

    applyDisplayMode();
    if (nav.windowControlsOverlay) nav.windowControlsOverlay.addEventListener('geometrychange', applyDisplayMode);
    ['standalone', 'window-controls-overlay', 'minimal-ui'].forEach((m) => {
      try { root.matchMedia('(display-mode: ' + m + ')').addEventListener('change', applyDisplayMode); } catch (_) {}
    });

    return registerServiceWorker();
  }

  root.WTP_PWA = {
    init, promptInstall, applyUpdate, setBadge, capabilities,
    registerBackgroundSync, isStandalone,
    get canInstall() { return !!PWA.deferredPrompt; },
    get state() { return PWA; }
  };
})(window);
