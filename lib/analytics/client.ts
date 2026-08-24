import { EVENTS, type EventName } from './events';

/**
 * The browser half of the event catalogue.
 *
 * Only the two names on CLIENT_REPORTABLE reach anywhere from here; the route
 * rejects the rest. See app/api/events/route.ts for why the list is that short.
 *
 * ── WHY IT NEVER THROWS AND NEVER BLOCKS ───────────────────────────────────
 * Every call site is a moment that matters to the customer — finishing signup,
 * redeeming an invite. An analytics POST that rejects must not surface as an
 * error on a screen that otherwise succeeded, and must not hold up a redirect.
 * So this returns void, swallows everything, and is called without `await`.
 */
export function reportEvent(name: EventName, params: Record<string, string | number | boolean> = {}): void {
  try {
    const payload = JSON.stringify({ name, params });

    // `keepalive` is the point of using fetch here rather than the query client:
    // signup navigates immediately after, and a normal fetch is cancelled when
    // the document tears down — losing precisely the event that marks the
    // conversion. keepalive lets the request outlive the page (64 kB cap, which
    // a bounded params object is nowhere near).
    void fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    }).catch(() => { /* analytics must never surface to the customer */ });
  } catch {
    /* ignore */
  }
}

export { EVENTS };
