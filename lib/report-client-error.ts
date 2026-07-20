/**
 * Best-effort client-side error reporter, shared by app/global-error.tsx and
 * app/[locale]/(dashboard)/error.tsx. Posts to /api/client-errors so a crash
 * that only a user sees is not invisible to the owner in production — the
 * hosting platform captures the route's stderr line.
 *
 * Uses `navigator.sendBeacon` when available (survives page unload during a
 * crash) and falls back to `fetch(..., { keepalive: true })` otherwise. Both
 * are fire-and-forget: reporting must never throw or affect the UI.
 */

const CLIENT_ERROR_ENDPOINT = '/api/client-errors';
const MAX_MESSAGE_LENGTH = 500;
const MAX_STACK_LENGTH = 4000;

export function reportClientError(error: Error & { digest?: string }): void {
  try {
    const payload = JSON.stringify({
      message: (error?.message || 'Unknown error').slice(0, MAX_MESSAGE_LENGTH),
      stack: error?.stack?.slice(0, MAX_STACK_LENGTH),
      digest: error?.digest,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });

    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([payload], { type: 'application/json' });
      const queued = navigator.sendBeacon(CLIENT_ERROR_ENDPOINT, blob);
      if (queued) return;
    }

    void fetch(CLIENT_ERROR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => {
      // Best-effort only — never let a reporting failure affect the UI.
    });
  } catch {
    // Never let error reporting itself throw during a crash.
  }
}
