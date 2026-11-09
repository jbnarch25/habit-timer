// Screen Wake Lock during an active session. Feature-detected; degrades quietly.
// The browser releases the lock when the page is hidden, so it's re-acquired on visibilitychange.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire() {
  if (!wanted || !('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
  if (sentinel && !sentinel.released) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
  } catch {
    sentinel = null;
  }
}

function onVisibility() {
  if (document.visibilityState === 'visible') void acquire();
}

export function keepAwake(on: boolean) {
  if (on === wanted) {
    if (on) void acquire();
    return;
  }
  wanted = on;
  if (on) {
    document.addEventListener('visibilitychange', onVisibility);
    void acquire();
  } else {
    document.removeEventListener('visibilitychange', onVisibility);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  }
}

export const wakeLockSupported = () => typeof navigator !== 'undefined' && 'wakeLock' in navigator;
