# Handoff: finish surfacing failed refunds in the last 4 studio routes

**Status: DONE.** Completed in commit `38ce6ca`, after the concurrent session was stopped and its
work committed separately as `143175f`. All eight studio routes now capture the refund result —
17 call sites total. Verified: `grep -rn "await refundCredits" app/api/studios/*/route.ts |
grep -v "= await refundCredits"` returns nothing.

Kept for the record of what was done and why. The one item deliberately NOT done is the campaign
`Promise.all` gap — see the note at the end.

## Why this is a handoff and not a commit

`refundCredits()` returns `{ success, error }`, but the studio routes call it as a bare
`await refundCredits({...})` and discard the result. When a refund does not land, the user is told
only "generation failed" — their credits are gone and nothing tells them they are owed anything.

Four routes are fixed and shipped (commit `ce0313f`):

- `app/api/studios/analysis/route.ts`
- `app/api/studios/plan/route.ts`
- `app/api/studios/storyboard/route.ts`
- `app/api/studios/voiceover/route.ts`

The other four could not be committed, because at the time of writing they held **uncommitted,
unreviewed changes from a concurrent session**:

- `app/api/studios/campaign/route.ts`
- `app/api/studios/creator/route.ts`
- `app/api/studios/edit/route.ts`
- `app/api/studios/photoshoot/route.ts`

Editing them was never the problem — `git add`ing them was. Staging any of those files would have
swept that session's in-progress work into a commit nobody had reviewed. Delivering the change as
instructions instead keeps that work intact and lets whoever owns it apply this in one pass.

## The change

Everything needed already exists on `main`. Nothing new has to be designed.

**Helper** — `lib/studio-errors.ts` (already shipped):

```ts
export function refundAwareErrorCode(refundResult: { success: boolean }, fallbackCode: string): string {
  return refundResult.success ? fallbackCode : 'refund_failed';
}
```

**Message key** — `studio.errors.refund_failed`, already present in both `messages/ar.json` and
`messages/en.json`, and already routed through `mapApiError`, so every studio picks it up with no
client change:

> التوليد فشل ولم نتمكن من إرجاع رصيدك تلقائياً. تم إشعار فريقنا وسنعيد رصيدك قريباً — إذا لم يظهر خلال يوم عمل، تواصل مع الدعم

## What to do in each of the four files

At **every** `await refundCredits({ ... })` that is followed by an error response, capture the result
and feed it through the helper. The transformation is mechanical:

```ts
// BEFORE — result discarded, a failed refund is invisible to the user
await refundCredits({
  userId: user.id, amount: creditCost,
  description: 'Refund: campaign generation failed',
  generationId: generation?.id,
});
return NextResponse.json(
  { success: false, error: 'generation_failed' },
  { status: 500 }
);
```

```ts
// AFTER — a refund that did not land changes what the user is told
const refundResult = await refundCredits({
  userId: user.id, amount: creditCost,
  description: 'Refund: campaign generation failed',
  generationId: generation?.id,
});
return NextResponse.json(
  { success: false, error: refundAwareErrorCode(refundResult, 'generation_failed') },
  { status: 500 }
);
```

Add `refundAwareErrorCode` to the existing `@/lib/studio-errors` import in each file.

### Rules that matter

1. **Preserve the HTTP status.** All eight existing sites return 500; do not change that.
2. **Preserve the fallback code.** Pass whatever code that site returned before —
   `generation_failed`, `generation_parse_failed`, etc. The helper only overrides it when the refund
   itself failed.
3. **Do not touch `PromptBlockedError` handling.** Those paths return 400 with a `term` field and no
   refund is involved. `storyboard` has a reachable one; leave it exactly as is.
4. **Partial refunds count too.** `creator` (per failed variation) and `photoshoot` (per failed shot)
   each have a partial-refund call site as well as a full one. Both need the treatment — a partial
   refund that fails loses the user just as much money.
5. **Do not modify `lib/credits/deduct.ts`.** It is already correct: one bounded retry on transient
   database failures, then a structured `[credits][OWED]` log line carrying userId, amount and
   generationId for manual reconciliation.

## Verify after applying

```bash
npx tsc --noEmit          # exit 0
npx next lint             # zero warnings

# every refundCredits call in a route should now be assigned, not bare:
grep -rn "await refundCredits" app/api/studios/*/route.ts | grep -v "= await refundCredits"
# expect: no output
```

## Related, still open

- `campaign`'s per-post image failures inside `Promise.all` are dropped without a partial refund.
  That is a separate defect in the same file and worth fixing in the same pass.
- `supabase/migrations/028_reconcile_orphaned_generations.sql` is written but **not applied**. It
  closes the other half of this problem: a process killed between reservation and the catch block
  never attempts a refund at all. Its own verification block is `ROLLBACK`-wrapped, so testing it
  costs nothing.


---

## Outcome

Completed in `38ce6ca`. Call sites captured per route: analysis 2, campaign 2, creator 3, edit 1,
photoshoot 3, plan 2, storyboard 2, voiceover 2 — 17 in total, zero bare calls remaining.

**The campaign `Promise.all` gap was deliberately left alone.** `CREDIT_COSTS.campaign` is a single
flat charge of 12 credits for the whole call — 9 posts plus optional images, bundled. There is no
per-image or per-post price anywhere in the product, unlike `creator` (cost x variations) or
`photoshoot` (SHOT_COSTS x shots), so a partial refund cannot be computed from anything real.
Deriving one — 12/9, say — would be inventing a price the product never defined and refunding
against it. That needs a pricing decision from the owner, not a code change.
