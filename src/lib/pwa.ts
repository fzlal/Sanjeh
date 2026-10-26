const RELOAD_GUARD_KEY = 'sanjeh:update-reload';
const RELOAD_DELAY = 1500;
const RELOAD_GUARD_WINDOW = 10_000;
const UPDATE_CHECK_THROTTLE = 5 * 60_000;
const UPDATE_CHECK_INTERVAL = 30 * 60_000;

let holds = 0;
let pendingReload = false;
let reloadTimer: number | undefined;
let registration: ServiceWorkerRegistration | undefined;
let lastCheck = 0;

function canReload() {
  try {
    const previous = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) || 0);
    return Date.now() - previous > RELOAD_GUARD_WINDOW;
  } catch {
    return true;
  }
}

function markReload() {
  try {
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
  } catch {
    /* storage can be unavailable; the in-memory flags still prevent loops */
  }
}

function scheduleReload() {
  if (!pendingReload || holds > 0 || reloadTimer !== undefined) return;
  if (!canReload()) {
    pendingReload = false;
    return;
  }
  reloadTimer = window.setTimeout(() => {
    reloadTimer = undefined;
    if (!pendingReload || holds > 0) return;
    pendingReload = false;
    markReload();
    window.location.reload();
  }, RELOAD_DELAY);
}

/** Defers a pending update reload while critical screens are open. */
export function holdAutoUpdate(): () => void {
  holds += 1;
  if (reloadTimer !== undefined) {
    window.clearTimeout(reloadTimer);
    reloadTimer = undefined;
  }
  return () => {
    holds = Math.max(0, holds - 1);
    if (holds === 0) scheduleReload();
  };
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  // A page that was not controlled on boot is being claimed for the first
  // time; that is not an update and must not reload the page.
  const hadController = Boolean(navigator.serviceWorker.controller);

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    pendingReload = true;
    scheduleReload();
  });

  const checkForUpdate = () => {
    if (!registration || document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastCheck < UPDATE_CHECK_THROTTLE) return;
    lastCheck = now;
    void registration.update().catch(() => {
      /* offline or transient hosting errors keep the current build */
    });
  };

  const start = () => {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, { updateViaCache: 'none' })
      .then((registered) => {
        registration = registered;
        lastCheck = Date.now();
      })
      .catch(() => {
        /* offline support is progressive; the app still works online */
      });
  };

  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });

  document.addEventListener('visibilitychange', checkForUpdate);
  window.addEventListener('online', checkForUpdate);
  window.setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL);
}
