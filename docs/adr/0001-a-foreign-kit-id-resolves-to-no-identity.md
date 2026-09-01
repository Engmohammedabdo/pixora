# A brand kit id that is not the caller's resolves to no identity, and does not fall through

The Working Identity is resolved as: explicit `brandKitId` → the Project's kit → the account
default. When an explicit `brandKitId` arrives that does not belong to the caller — almost always
a stale id the browser kept from an earlier session, not something the customer typed — the
resolver returns **no identity at all** and reports `source: 'none'`. It deliberately does **not**
continue down the chain to the Project's kit or the account default.

## Why

Falling through looks like the helpful thing and is the dangerous thing. The id is stale because
the customer was working on a *different client a moment ago*; silently substituting whatever kit
is nearest is exactly "one client's look leaks into another's shoot", which is the failure the
Project→kit step exists to prevent. A resolver that repairs a wrong identity by guessing a
different one has not repaired anything — it has made the wrong answer unfalsifiable.

## Considered options

- **Fall through to the Project's kit / account default.** Rejected above. Note the failure is
  silent and per-Generation: nothing on screen and nothing in the row would say a substitution
  happened.
- **Return an error (`brand_kit_not_found`).** Rejected. The id usually comes from a
  `localStorage` snapshot the customer never chose and cannot correct, so a 4xx would fail a paid
  Generation over a condition with no customer action behind it, and it would change the response
  contract of seven paid routes at once. `PATCH /api/projects/[id]` does return an error for the
  same shape, and that is right there — a settings save the customer initiated, which they can
  retry.

## Consequences

- A Generation can legitimately run with no business context. That is a *reportable* state, not an
  error: the resolver returns `source: 'none'`, the routes log one structured line when an id was
  supplied and nothing resolved, and the customer sees the "your result will be generic" notice.
- One pre-existing exception stays: `edit` still returns `400 validation_error` with
  `path: ['brandKitId']` when a preset genuinely cannot be built without brand colours. That is a
  builder precondition, not an identity rule.
