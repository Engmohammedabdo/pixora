import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { inputImageRef, readableImageUrl } from '@/lib/storage/reference-image';
import { createServerClient } from '@/lib/supabase/server';
import { failGeneration, finalizeGeneration, insertAssets } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { settleCharge } from '@/lib/credits/settle';
import { generateImage } from '@/lib/ai/router';
import { CREATOR_PROMPT_VERSION, buildCreatorPrompt } from '@/lib/ai/prompts/creator';
import { PLATFORM_IDS, aspectRatioFor, buildFramingBlock } from '@/lib/ai/prompts/platform-framing';
import { buildImageTextRule } from '@/lib/ai/prompts/image-text-rule';
import { CREDIT_COSTS } from '@/lib/credits/costs';
import { getStudioConfig, isStudioEnabled, getEffectivePrompt, getCachedFeatureFlags } from '@/lib/admin/settings';
import { getStudioCost } from '@/lib/credits/costs';
import { getMaxResolution } from '@/lib/stripe/plans';
import { checkRateLimit } from '@/lib/rate-limit';
import { persistGeneratedImage, formatFromUrl, WatermarkRequiredError } from '@/lib/storage/persist-image';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { getPromptVersion } from '@/lib/ai/prompts/versions';
import type { AIModel } from '@/types/studios';
import type { BrandKit } from '@/lib/supabase/types';
import { resolveProjectId } from '@/lib/projects/verify';
import { resolveWorkingIdentity } from '@/lib/brand-kits/working-identity';
import { refundAwareErrorCode } from '@/lib/studio-errors';

const InputSchema = z.object({
  prompt: z.string().min(10).max(1000),
  model: z.enum(['gemini', 'gpt', 'flux']),
  projectId: z.string().uuid().optional(),
  resolution: z.enum(['1080p', '2K', '4K']),
  // `style` reaches the image model on BOTH branches and had no ceiling at all.
  // 100 is the cap the admin-override branch already truncates it to.
  style: z.string().max(100).default('photographic'),
  // The output canvas, chosen by the customer rather than by the model.
  //
  // Measured 2026-08-31: four requests at this same `resolution` came back as
  // three different aspect ratios (1.79, 1.79, 0.67, 1.89), because gemini picks
  // the shape from prompt content when no `aspectRatio` is sent and no
  // text-to-image caller had ever sent one. A tool sold for producing sets of
  // posts cannot have a canvas that does not reproduce between two identical
  // requests.
  //
  // Optional with a `general` default, so every existing client keeps working.
  // The enum is built from the framing table rather than restated, so a platform
  // added there cannot be silently unreachable here.
  platform: z.enum(PLATFORM_IDS).default('general'),
  variations: z.union([z.literal(1), z.literal(4)]).default(1),
  brandKitId: z.string().uuid().optional(),
  /**
   * The customer's Apply-Brand-Kit toggle, OFF. Sent explicitly rather than
   * inferred from an absent `brandKitId`, because those are different requests:
   * the ladder in lib/brand-kits/working-identity.ts answers an absent id with
   * the project's kit or the account default, which is the correct answer for
   * "I did not choose" and the wrong one for "not this time". Optional and
   * defaulting to ON, so an older client keeps working.
   */
  useBrandKit: z.boolean().optional(),
  // `z.string().url()` accepted blob: and http: — neither readable server-side —
  // and an unbounded data: payload. edit and photoshoot were fixed for this; creator
  // was the one image studio that never got it, and it also wrote the raw payload
  // into generations.input via a bare ...input spread.
  referenceImageUrl: readableImageUrl.optional(),
});

/**
 * The brief's labels, keyed by the token the admin prompt editor advertises for
 * each one, and matching the headings buildCreatorPrompt emits.
 *
 * Kept in step with that builder by hand — this list claims to mirror it, and a
 * claim like that going stale is how the `app/layout.tsx` comment came to
 * assert the opposite of what the code did. Updated 2026-08-31 when creator
 * moved from a bullet list to headed blocks:
 *   - `resolution` REMOVED. No image model reads pixel dimensions from prose;
 *     it is an API parameter, and /api/admin/prompts no longer offers the chip.
 *   - `platform` ADDED. It is a real field now rather than the fixed string
 *     'General' the old builder invented.
 *   - Labels follow the new headings (SUBJECT / BRAND / STYLE), so an override
 *     that omits a token still reads as one prompt rather than two stapled
 *     together.
 */
const OVERRIDE_BRIEF_LABELS: ReadonlyArray<readonly [token: string, label: string]> = [
  ['user_prompt', 'SUBJECT'],
  ['brand_name', 'Brand'],
  ['brand_colors', 'Brand Colours'],
  ['selected_style', 'STYLE'],
  ['platform', 'Platform'],
];

/**
 * Fill an admin override's {tokens}, then append only the parts of the brief it
 * did not already ask for.
 *
 * /api/admin/prompts:8 advertises these tokens as clickable chips and seeds the
 * copyable default WITH them (`userPrompt: '{user_prompt}'`, :50), so an
 * override written the way the UI teaches contains `{user_prompt}` verbatim.
 * Appending the brief without substituting shipped that literal brace text to
 * the model as content; substituting and then appending everything anyway would
 * state the same subject twice. So: substitute, and append what is left over.
 *
 * A token we do not recognise is left exactly as written. Blanking it would
 * silently delete something the admin typed, and guessing at its meaning is
 * worse than letting them see their own text came through untouched.
 */
function composeOverridePrompt(override: string, values: Readonly<Record<string, string>>): string {
  const substituted = new Set<string>();
  const filled = override.replace(/\{([a-z_]+)\}/g, (match: string, token: string) => {
    if (!(token in values)) return match;
    substituted.add(token);
    return values[token];
  });

  // Same labels buildCreatorPrompt uses, so an override written against the
  // default prompt's shape still reads as one prompt rather than two stapled
  // together.
  const brief = OVERRIDE_BRIEF_LABELS
    .filter(([token]) => !substituted.has(token) && values[token])
    .map(([token, label]) => `- ${label}: ${values[token]}`);

  return brief.length > 0 ? `${filled}\n\n${brief.join('\n')}` : filled;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    // Check maintenance mode
    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json(
        { success: false, error: 'maintenance_mode' },
        { status: 503 }
      );
    }

    // Check if studio is enabled via admin settings
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'creator')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await request.json();
    const input = InputSchema.parse(body);

    // Three reads in front of the first model call: the plan (for the resolution
    // cap), the project id (ownership), and the Working Identity. The auth check
    // and the rate limit deliberately stay above this — they GATE the work rather
    // than race it.
    //
    // This group used to say "three INDEPENDENT reads", and that was true only
    // because the kit read here was `input.brandKitId` and nothing else — the
    // project was never consulted, so a customer who selected a client in the
    // ProjectSelector this page renders could pay up to 4 credits and receive an
    // image made for a different client's business. Resolving the identity
    // properly makes it depend on the VERIFIED project id, so the promise is held
    // rather than awaited and the two dependent reads chain inside the same group.
    // The profile read still runs alongside them, which is the parallelism that
    // was worth keeping.
    const projectIdPromise = resolveProjectId(supabase, user.id, input.projectId);

    // The Working Identity — see CONTEXT.md and lib/brand-kits/working-identity.ts,
    // which resolves explicit -> project -> account default once, for all seven
    // studios, instead of six routes each believing an id the browser computed.
    //
    // The branch is a latency choice and nothing more, and it is exact rather than
    // approximate: step 1 is TERMINAL either way (ADR-0001 — an explicit id that
    // does not resolve returns no identity and deliberately does not fall
    // through), so when `brandKitId` is present the module never reads
    // `projectId` at all and there is nothing to wait for. That is the hot path —
    // every studio page sends an id — and it stays exactly one query, running
    // beside the profile read, the same shape this group had before.
    //
    // No `omit`: unlike plan and analysis, creator's form collects none of the
    // five business facts, so the kit is the only source for all of them.
    //
    // Called HERE — above the generations insert and above the reservation —
    // because `sanitizePrompt` runs inside it and throws PromptBlockedError, which
    // must reach the OUTER catch with no credits moved and no orphan row.
    const [profileResult, projectId, identity] = await Promise.all([
      supabase.from('profiles').select('plan_id').eq('id', user.id).single(),
      projectIdPromise,
      input.brandKitId
        ? resolveWorkingIdentity(supabase, user.id, {
            optedOut: input.useBrandKit === false,
            brandKitId: input.brandKitId,
            // buildCreatorPrompt reads the row and filters as it goes; these two
            // are what the ROUTE itself prints on the admin-override composer.
            need: ['name', 'colors'],
          })
        : projectIdPromise.then((verified) =>
            // `false` means the project is not the caller's and the 404 below is
            // already decided; resolving against no project keeps this branch
            // total rather than filing the request under an unverified id.
            resolveWorkingIdentity(supabase, user.id, {
              optedOut: input.useBrandKit === false,
              projectId: verified === false ? null : verified,
              need: ['name', 'colors'],
            })
          ),
    ]);

    if (input.brandKitId && identity.source === 'none') {
      // ADR-0001: a stale or foreign id resolves to nothing and deliberately does
      // not fall through. Logged rather than returned — the customer did not type
      // this id and cannot act on it — but logged, because before this line no
      // console output anywhere under app/api/studios mentioned a brand kit, which
      // is how six studios ran with no identity for a month.
      console.warn(`[working-identity][creator] brandKitId ${input.brandKitId} did not resolve for user ${user.id}`);
    }

    // Enforce resolution limit based on the customer's plan
    const profile = profileResult.data;
    const maxRes = getMaxResolution(profile?.plan_id || 'free');
    const resOrder: string[] = ['1080p', '2K', '4K'];
    if (resOrder.indexOf(input.resolution) > resOrder.indexOf(maxRes)) {
      return NextResponse.json(
        { success: false, error: 'resolution_not_available', maxResolution: maxRes },
        { status: 403 }
      );
    }

    // Calculate credit cost (use admin override if set)
    const creditCost = getStudioCost('creator', input.resolution);
    const totalCost = creditCost * input.variations;

    // Never trust a client-supplied project id: resolveProjectId (above, in the
    // Promise.all) verifies it belongs to the caller before any work is filed into it.
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    // The safety filter runs HERE, on the customer's own text, before anything
    // branches on the admin override. buildCreatorPrompt() is the only caller of
    // sanitizePrompt on this path, so while the override REPLACED the built
    // prompt, setting one in /admin/settings switched the prompt filter off for
    // the highest-risk paid surface in the product — and PromptBlockedError, the
    // 400 + `term` response the UI is built to render, could never fire. A filter
    // that an unrelated setting can disable is not a filter.
    // Capped at the schema's own maximum (InputSchema.prompt max 1000) rather
    // than sanitizePrompt's 2000 default, so the builder and the override path
    // truncate identically.
    const safeUserPrompt = sanitizePrompt(input.prompt, 1000);

    // Build prompt (check for admin override first)
    const promptOverride = await getEffectivePrompt('creator');

    // The override COMPOSES with the customer's brief, it does not replace it.
    // `promptOverride || build(...)` dropped input.prompt entirely — the model
    // was asked to draw nothing in particular while `generations.input` still
    // recorded the customer's request, so the row looked like it had been used.
    // See composeOverridePrompt() for why the brief is substituted first and
    // only then appended.
    //
    // The brand kit's own columns are filtered because they are customer-writable
    // and would otherwise reach the model without ever meeting the filter — the
    // same shape of hole the override itself once punched in it. They are no
    // longer filtered INSIDE this branch, though, and that is a deliberate
    // widening rather than an oversight: resolveWorkingIdentity() filters every
    // column any prompt path reads, for every request, above the reservation. The
    // old placement bought one thing — a brand-kit string could not block a
    // generation with no override — and cost the thing that matters more, which is
    // that a blocked term failed in two studios and not the other five. It now
    // fails the same way everywhere, before any money moves, naming the term.
    //
    // `safeName` is capped at 100, not the 200 this line used to use. That 200 was
    // the outlier: five of the six sites deciding this already used 100, and
    // buildCreatorPrompt (lib/ai/prompts/creator.ts:64) re-capped it to 100 one
    // call later anyway, so the default path never saw a name longer than that.
    // `safeColorLine` is composed from three parts capped at 40 each rather than
    // by filtering one concatenated string at 200, so the components and the line
    // can never disagree.
    const fullPrompt = promptOverride
      ? composeOverridePrompt(promptOverride, {
          user_prompt: safeUserPrompt,
          brand_name: identity.safeName ?? '',
          brand_colors: identity.safeColorLine ?? '',
          selected_style: sanitizePrompt(input.style, 100),
          // `resolution` and `mood` are no longer offered: neither reached the
          // model usefully, and /api/admin/prompts no longer advertises them as
          // chips. `platform` is now a real field rather than the fixed string
          // 'General' the builder used to invent.
          platform: input.platform,
        // Mirrors campaign's override branch: appended after the composed
        // brief, same placement buildCreatorPrompt itself uses (after the
        // subject/brand lines, before the style/technical directives it
        // appends on the default path — this override has none of those).
        // `identity.block` rather than a second buildBrandContextBlock() call on
        // the same input: the module already built it, from the same five fields,
        // with the same function. Two call sites computing one string is how the
        // two halves of a rule drift apart one edit at a time.
        }) + identity.block
          // An override REPLACES the built prompt, so without this the one
          // defect this round measured — a street of invented shop signs —
          // stays open on the admin path. The containment rule is not part of
          // the brief an admin is editing; it is the rule the studio holds
          // regardless of who wrote the brief, which is why it is appended
          // rather than offered as a token.
          + buildFramingBlock(input.platform)
          // Same hasReferenceImage branch as the default path. An override that
          // says nothing about text still must not order the customer's own
          // packaging blanked — see buildCreatorPrompt's note and
          // preserveTextRule().
          + buildImageTextRule(input.referenceImageUrl ? 'preserve' : 'contained', safeUserPrompt)
      : buildCreatorPrompt({
          userPrompt: safeUserPrompt,
          style: input.style,
          // ── WHY THIS ASSERTION, AND WHAT WOULD REMOVE IT ─────────────────
          // `buildCreatorPrompt` declares `brandKit?: BrandKit | null`, i.e. the
          // whole 17-column row, while `resolveWorkingIdentity` returns the 11 it
          // narrowed to (WORKING_IDENTITY_COLUMNS). The six it drops — `user_id`,
          // `logo_url`, `font_primary`, `font_secondary`, `website_url`,
          // `created_at` — are read by NOTHING under lib/ai/, which is the reason
          // the module narrows in the first place; before it, `select('*')`
          // carried all six into the prompt path of six routes and none of them
          // ever looked at one.
          //
          // Checked field by field against the builder rather than assumed:
          // lib/ai/prompts/creator.ts reads `name` (:64), `primary_color`,
          // `secondary_color`, `accent_color` (:67), `brand_voice` (:71),
          // and `industry`/`description`/`target_audience`/`city` (:103-106),
          // plus the bare truthiness at :84. All nine are present on
          // WorkingIdentityKit at the same types. So the assertion widens the
          // TYPE and removes nothing the callee touches.
          //
          // It is still an assertion, and the fix is one line in the builder:
          // declare `brandKit` as the narrowed shape (or as the structural subset
          // it actually reads) and this cast goes away. Not done here because
          // that file is shared and this change is a substitution, not a
          // redesign.
          brandKit: identity.kit as BrandKit | null,
          platform: input.platform,
          hasReferenceImage: Boolean(input.referenceImageUrl),
        });

    // Create generation record
    const { data: generation, error: genError } = await supabase
      .from('generations')
      .insert({
        user_id: user.id,
        studio: 'creator',
        model: input.model,
        // Verified above — this is the resolved id, never the raw client value.
        project_id: projectId,
        // `...input` wrote the raw reference payload into this JSONB column — up to
        // 20 MB of base64 in a row every admin screen reads. Record that one was
        // supplied; the bytes stay in memory, where only the model call needs them.
        // edit and photoshoot already did this.
        input: {
          ...input,
          // AFTER the spread, so it overrides what the browser sent. `...input`
          // recorded the REQUESTED id, which is a different fact from the one
          // that ran: a stale id records a kit that contributed nothing
          // (ADR-0001), and a request with no id at all recorded nothing while
          // the project's or the account's kit was in force. A restore reads
          // this column back into the form, so the two must be the same fact.
          brandKitId: identity.kit?.id ?? null,
          fullPrompt,
          promptVersion: CREATOR_PROMPT_VERSION,
          ...(input.referenceImageUrl ? { referenceImageUrl: inputImageRef(input.referenceImageUrl) } : {}),
        },
        credits_used: totalCost,
        status: 'processing',
      })
      .select()
      .single();

    if (genError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    // Reserve credits (atomic check + deduct)
    const reserveResult = await reserveCredits({
      userId: user.id, amount: totalCost,
      studio: 'creator', description: `Image generation - ${input.resolution} x${input.variations}`,
      generationId: generation?.id,
    });
    if (!reserveResult.success) {
      // Only a verdict from the RPC BODY proves nothing was charged.
      // `insufficient_credits` is such a verdict (017_reserve_credits.sql:31) — the
      // function ran and declined. Any other failure is a transport error, and the
      // reservation may well have committed with only the reply lost, so the row
      // must stay in the reconciler's window until the ledger is consulted.
      const nothingWasCharged = reserveResult.error === 'insufficient_credits';
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: nothingWasCharged,
          error: 'credit_reservation_failed',
        }, 'creator');
      }
      return NextResponse.json({
        success: false,
        error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed',
        required: totalCost,
      }, { status: 402 });
    }

    // Credits already returned to the user inside the try below. The catch
    // refunds the reservation, and refunding it WHOLE after a partial refund has
    // landed mints credits: refund_credits caps only the slice routed to the
    // purchased pool (supabase/migrations/033_refund_to_source_pool.sql:279) and
    // credits the full p_amount to the balance regardless (033:284-286). Nothing
    // between the partial-refund site and the end of the try throws today, but
    // the persist call used to swallow every failure and now does not, so this
    // stops being an accident of ordering. Declared out here because a `let`
    // inside the try is not in scope in the catch.
    let refundedSoFar = 0;

    try {
    // Generate image(s)
    //
    // This used to be an inline copy of the persist logic that wrote to
    // `generations/<uid>/...`. The live storage policy is
    //   INSERT WITH CHECK (bucket_id = 'assets' AND (storage.foldername(name))[1] = uid()::text)
    // so segment 1 was the literal string 'generations' and every upload was
    // denied — the error was logged and the raw data: URL kept, which is why
    // creator has been writing megabytes of base64 into generations.output and
    // assets.url. The shared helper already has the correct uid-first layout.
    const planId = profile?.plan_id || 'free';
    const uploadImage = (url: string, index: number): Promise<string> =>
      persistGeneratedImage(supabase, url, {
        userId: user.id,
        generationId: generation.id,
        index,
        planId,
      });

    let imageUrls: string[];
    let hasMock = false;
    let hasUsedFallback = false;
    let resultModel = input.model;
    let resultOriginalModel: string | undefined;
    // Tracks the balance actually left after any partial refund below. Stays at
    // the reservation's balance when no partial refund is needed.
    let balanceAfterPartialRefund = reserveResult.newBalance;
    // What the customer was ACTUALLY charged. Starts at the reservation and only
    // drops when a refund is CONFIRMED landed. This route used to state the charge
    // as `imageUrls.length * creditCost` — the intended figure — in both the ledger
    // and the response, so a partial refund that failed told the customer and every
    // admin revenue number that credits came back when they had not.
    let creditsCharged = totalCost;

    if (input.variations === 4) {
      // Generate 4 variations — track individual successes/failures
      const promises = Array.from({ length: 4 }, () =>
        generateImage({
          prompt: fullPrompt,
          model: input.model,
          resolution: input.resolution,
          referenceImageUrl: input.referenceImageUrl,
          // Safe to send as of 2026-08-31: gpt and flux forward this now, in
          // that order, which is the precondition router.ts:31 states. Before
          // that it would have been silently dropped on two of the three models
          // this studio lets the customer pick.
          aspectRatio: aspectRatioFor(input.platform),
        }).catch(() => null)
      );

      const results = await Promise.all(promises);
      const successCount = results.filter((r) => r !== null).length;

      // If ALL failed → full refund + error
      if (successCount === 0) {
        const refundResult = await refundCredits({
          userId: user.id, amount: totalCost,
          description: 'Full refund: all 4 variations failed',
          generationId: generation.id,
        });
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'all_variations_failed',
        }, 'creator');
        return NextResponse.json({
          success: false,
          // Was the English sentence 'All generation attempts failed. Credits
          // refunded.' — not a registered code, so mapApiError collapsed it to the
          // generic fallback and the Arabic customer was never told their credits
          // had come back, which is the one thing that sentence existed to say.
          error: refundAwareErrorCode(refundResult, 'generation_failed'),
        }, { status: 500 });
      }

      // Persist BEFORE settling the cost, and count a variation we cannot store
      // as a failed variation.
      //
      // On a watermarked plan (free only, lib/stripe/plans.ts:27) uploadImage now
      // THROWS instead of handing back the clean original — see
      // lib/storage/persist-image.ts WatermarkRequiredError. Dropping just that
      // variation feeds it into the partial-refund path this branch already runs
      // for a variation the model never returned; from the customer's side the
      // two are the same event, one of four images is not deliverable. Letting
      // the throw reach the catch instead would take the three good, already
      // watermarked and uploaded images down with it AND refund `totalCost` on
      // top of the partial refund below.
      const uploadPromises = results.map((r, i) =>
        r
          ? uploadImage(r.url || '', i).catch((e: unknown) => {
              // Only the watermark verdict is a droppable image. Anything else is
              // a fault and belongs in the refunding catch below.
              if (!(e instanceof WatermarkRequiredError)) throw e;
              console.error(`[creator] variation ${i} dropped, watermark could not be burned in:`, e.message);
              return '';
            })
          : Promise.resolve('')
      );
      const urls = await Promise.all(uploadPromises);

      imageUrls = urls.filter((u) => u !== '');
      const failedCount = 4 - imageUrls.length;

      // Every variation that generated was then undeliverable — all four failed
      // the watermark. There is nothing to return, so this is a failure and the
      // whole reservation goes back; without this the partial refund below would
      // report `success: true` over an empty grid.
      if (imageUrls.length === 0) {
        const refundResult = await refundCredits({
          userId: user.id, amount: totalCost,
          description: 'Full refund: no variation could be stored',
          generationId: generation.id,
        });
        // Only mark it terminal once the credits are actually back. The
        // reconciler's scan window is `status IN ('pending','processing')`
        // (028_reconcile_orphaned_generations.sql:161), and after migration 038
        // it is the ONLY automated payout left — so writing 'failed' over a
        // refund that did not land takes the row out of reach of the one thing
        // that could still pay the customer, and the credits survive only in a
        // `[credits][OWED]` log line. Leaving it in 'processing' costs a delay
        // of at most one 15-minute tick and cannot double-pay: the reconciler
        // derives what it owes from the ledger (SUM(usage) - SUM(refund),
        // 028:169-176), so a refund that DID land leaves nothing owed.
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'all_variations_failed',
        }, 'creator');
        return NextResponse.json({
          success: false,
          error: refundAwareErrorCode(refundResult, 'generation_failed'),
        }, { status: 500 });
      }

      // Partial refund for failed variations. Captured (not bare) so the
      // balance we report back reflects whether the refund actually landed —
      // mirrors photoshoot's analogous partial-refund site.
      if (failedCount > 0) {
        const refundAmount = failedCount * creditCost;
        const partialRefund = await refundCredits({
          userId: user.id, amount: refundAmount,
          description: `Partial refund: ${failedCount}/4 variations failed (${refundAmount} credits returned)`,
          generationId: generation.id,
        });
        const settled = settleCharge(totalCost, refundAmount, partialRefund.success);
        creditsCharged = settled.charged;
        if (partialRefund.success) {
          balanceAfterPartialRefund = partialRefund.newBalance;
          // Only advance by what LANDED: `outstanding = totalCost - refundedSoFar`
          // in the outer catch depends on it, and over-advancing mints credits.
          refundedSoFar += settled.refunded;
        }
      }

      hasMock = results.some((r) => r?.mock);
      hasUsedFallback = results.some((r) => r?.usedFallback);
      const firstResult = results.find((r) => r !== null);
      if (firstResult) {
        resultModel = firstResult.model as AIModel;
        resultOriginalModel = firstResult.originalModel;
      }
    } else {
      const result = await generateImage({
        prompt: fullPrompt,
        model: input.model,
        resolution: input.resolution,
        referenceImageUrl: input.referenceImageUrl,
        aspectRatio: aspectRatioFor(input.platform),
      });

      const finalUrl = await uploadImage(result.url || '', 0);
      imageUrls = [finalUrl];
      hasMock = result.mock ?? false;
      hasUsedFallback = result.usedFallback ?? false;
      resultModel = result.model as AIModel;
      resultOriginalModel = result.originalModel;
    }

    // The free-plan watermark is burned in by uploadImage() above, before the
    // single storage upload — see lib/storage/persist-image.ts.

    // Update generation with result. `credits_used` MUST be rewritten here: it was
    // inserted as the full reservation, but failed variations are partially
    // refunded above — leaving the original figure makes the ledger disagree with
    // the credits the user actually kept, and every admin revenue number derived
    // from `generations.credits_used` overstates income.
    await finalizeGeneration(supabase, generation.id, {
      output: { urls: imageUrls, mock: hasMock, usedFallback: hasUsedFallback },
      credits_used: creditsCharged,
      status: 'completed',
      // creator already tracked which model served (resultModel) and echoed it in
      // the response, but never wrote it to the row the admin views read.
      model: resultModel,
    }, 'creator');

    // Save assets (one per successful image)
    const assetInserts = imageUrls
      .filter((u) => u)
      .map((url) => ({
        user_id: user.id,
        generation_id: generation.id,
        type: 'image' as const,
        url,
        format: formatFromUrl(url),
      }));

    await insertAssets(supabase, assetInserts, 'creator');

    return NextResponse.json({
      success: true,
      data: {
        generationId: generation.id,
        imageUrls,
        model: resultModel,
        mock: hasMock,
        usedFallback: hasUsedFallback,
        originalModel: resultOriginalModel,
        creditsUsed: creditsCharged,
        totalReserved: totalCost,
        refunded: totalCost - creditsCharged,
        newBalance: balanceAfterPartialRefund,
      },
    });
    } catch (genError) {
      // Refund what is still outstanding, never the whole reservation again:
      // the 4-variation branch may already have returned part of it, and
      // refund_credits does not net a second payout against the first
      // (033_refund_to_source_pool.sql:284-286 credits p_amount unconditionally,
      // and only the purchased-pool slice is capped, 033:279). Refunding
      // `totalCost` here after a partial refund would mint credits on the free
      // tier — the same shape as the round-3 rewind defect in CLAUDE.md.
      const outstanding = totalCost - refundedSoFar;
      const refundResult: { success: boolean } = outstanding > 0
        ? await refundCredits({
            userId: user.id, amount: outstanding,
            description: `Refund: creator generation failed`,
            generationId: generation?.id,
          })
        : { success: true };
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'creator');
      }
      // PromptBlockedError carries its own dedicated response (400 + `term`),
      // handled by the outer catch below — don't clobber that with refund_failed.
      if (!refundResult.success && !(genError instanceof PromptBlockedError)) {
        console.error('Creator API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'validation_error', details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Creator API error:', error);
    return NextResponse.json(
      { success: false, error: 'generation_failed' },
      { status: 500 }
    );
  }
}
