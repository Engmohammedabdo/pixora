import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getStudioCost } from '@/lib/credits/costs';
import {
  EDIT_PRESET_IDS,
  EDIT_PROMPT_VERSION,
  EDIT_TYPES,
  buildEditPrompt,
  editPresetAspectRatio,
  editPresetMatchesType,
  editPresetPureWhiteField,
  editPresetRequiresBrandColors,
} from '@/lib/ai/prompts/edit';
import { snapWhiteFieldOnDataUrl } from '@/lib/image/white-field';
import { inputImageRef, readableImageUrl } from '@/lib/storage/reference-image';
import { createServerClient } from '@/lib/supabase/server';
import { resolveWorkingIdentity } from '@/lib/brand-kits/working-identity';
import type { BrandKit } from '@/lib/supabase/types';
import { failGeneration, finalizeGeneration, insertAssets } from '@/lib/supabase/generation-writes';
import { reserveCredits, refundCredits } from '@/lib/credits/deduct';
import { generateImage } from '@/lib/ai/router';
import { persistGeneratedImage, formatFromUrl } from '@/lib/storage/persist-image';
import { checkRateLimit } from '@/lib/rate-limit';
import { getCachedFeatureFlags, getStudioConfig, isStudioEnabled } from '@/lib/admin/settings';
import { PromptBlockedError, sanitizePrompt } from '@/lib/ai/prompts/safety';
import { resolveProjectId } from '@/lib/projects/verify';
import {
  effectSignatureFromDataUrl,
  looksLikeNoOp,
  overallChange,
  strongestLocalChange,
} from '@/lib/image/edit-effect';

/**
 * `editDescription` is OPTIONAL as of 2026-08-27, and that is the point of this
 * round. It was `z.string().min(5)`: a product-photography customer with a
 * finished brand kit and a project still had to WRITE A PROMPT before the
 * product would touch their photo. `photoshoot` has never worked that way —
 * `environment: z.enum([7 presets])` with `notes` optional — and the difference
 * between the two schemas WAS the difference in the product.
 *
 * The three rules below are enforced in `superRefine` rather than by making
 * fields required, because none of them is a per-field rule:
 *   1. `text_add` always needs the description — there it is not an instruction,
 *      it is the text to render, and no preset can stand in for it.
 *   2. Every other mode needs a preset OR a description — a request carrying
 *      neither has said nothing at all, and would spend a credit on the model's
 *      guess at what the customer wanted.
 *   3. A preset must belong to the chosen `editType`. `marketplace_white` under
 *      `color_change` is not a strange prompt to be composed and sent; it is a
 *      400. The rule is read from the preset table (`editPresetMatchesType`) so
 *      it is stated once, where the presets are.
 *
 * Note the shape of the refinement. `check:invariants`'s `prompt-input-bounded`
 * locates this schema by its opening line and reads on to the next
 * line-initial close, so the region it checks runs to the END of the refinement
 * — every field above is inside it. A schema restructured so that opening line
 * no longer appears (a base object refined into a differently-named const, say)
 * is skipped by that gate ENTIRELY, silently, with the rule still reporting
 * green. Proved both ways: adding an unbounded string field here fails the
 * invariant, and it fails on the LAST field, i.e. the whole region is read.
 */
const InputSchema = z.object({
  projectId: z.string().uuid().optional(),
  /** Explicit kit wins over the project's kit and over the account default.
   *  The rule is stated once, in lib/brand-kits/working-identity.ts. */
  brandKitId: z.string().uuid().optional(),
  imageUrl: readableImageUrl,
  editDescription: z.string().min(5).max(500).optional(),
  editType: z.enum(EDIT_TYPES),
  editPreset: z.enum(EDIT_PRESET_IDS).optional(),
}).superRefine((value, ctx) => {
  if (value.editType === 'text_add' && !value.editDescription) {
    ctx.addIssue({
      code: 'custom',
      path: ['editDescription'],
      message: 'editDescription is required for text_add — it is the text to render, not an instruction',
    });
  } else if (!value.editPreset && !value.editDescription) {
    ctx.addIssue({
      code: 'custom',
      path: ['editPreset'],
      message: 'either editPreset or editDescription is required',
    });
  }

  if (value.editPreset && !editPresetMatchesType(value.editPreset, value.editType)) {
    ctx.addIssue({
      code: 'custom',
      path: ['editPreset'],
      message: `editPreset ${value.editPreset} does not belong to editType ${value.editType}`,
    });
  }
});

// Read from the one table, not restated here. Every studio price lives in
// lib/credits/costs.ts, which is also what the PUBLIC pricing page imports — a
// second copy is how the published list and the charge drift apart.
const CREDIT_COST = getStudioCost('edit');

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    if (!(await checkRateLimit(supabase, user.id))) {
      return NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 });
    }

    const flags = await getCachedFeatureFlags();
    if (flags.maintenance_mode) {
      return NextResponse.json({ success: false, error: 'maintenance_mode' }, { status: 503 });
    }
    const studioConfig = await getStudioConfig();
    if (!isStudioEnabled(studioConfig, 'edit')) {
      return NextResponse.json({ success: false, error: 'studio_disabled' }, { status: 403 });
    }

    const body = await req.json();
    const input = InputSchema.parse(body);

    // Never trust a client-supplied project id: verify it belongs to the caller
    // before filing work into it, or a user could write into another
    // customer's workspace.
    const projectId = await resolveProjectId(supabase, user.id, input.projectId);
    if (projectId === false) {
      return NextResponse.json({ success: false, error: 'project_not_found' }, { status: 404 });
    }

    // ── The Working Identity ──────────────────────────────────────────────
    //
    // See CONTEXT.md for the concept and lib/brand-kits/working-identity.ts for
    // the rule. This studio knew NOTHING about the customer until 2026-08-27
    // (review finding F10): it resolved `projectId` and used it only as a label
    // on the generations row, and `buildEditPrompt`'s `brandKit` parameter
    // existed and was documented dead. It is the studio a paying subscriber uses
    // on their own product photographs, which makes it the last place "I should
    // not have to tell it who I am again" is acceptable.
    //
    // The three-step ladder that used to be written out here — explicit id, then
    // the selected project's kit, then the account default — is THE code the
    // module was extracted from, and it is now stated once for all seven
    // studios. Step 3 is finding F12: a customer who finishes onboarding and
    // never creates a project has exactly one kit and no project, so a
    // project-only lookup gives them nothing, on the precise journey the
    // brand-context work was built for.
    //
    // CORRECTION, 2026-09-01, kept because it is load-bearing history. The
    // deleted comment claimed step 3 was "fixed the same way in photoshoot and
    // storyboard", and CLAUDE.md repeated the claim. It was false: `ff239bf` is
    // a two-file CLIENT diff (storyboard/page.tsx, PhotoshootForm.tsx), and
    // neither of those ROUTES contained `is_default`, `from('projects')` or
    // `brand_kit_id` at all. The ladder existed in exactly ONE route — this one.
    // Every other studio's "fallback" lived in the browser, so any caller that
    // was not that page got no identity; `scripts/live/` never sends
    // `brandKitId`, which is why nobody noticed for a month. That asymmetry is
    // what this module removes, and the correction is recorded here so nobody
    // re-derives the false version from a doc.
    //
    // SECOND CORRECTION, 2026-09-01, and it now belongs with the module rather
    // than with this route: `is_default` has ZERO true rows on the live
    // database, and nothing in the product sets it on create (BrandKitForm
    // submits 13 columns without it; the 002:29 trigger only ever CLEARS other
    // rows), so step 3 has always resolved by `created_at DESC` — the NEWEST kit
    // — never by "default". The related ordering trap (`is_default` is NULLABLE,
    // Postgres orders a boolean DESC as NULLS FIRST, and supabase-js emits no
    // nulls directive when `nullsFirst` is undefined, so a NULL row outranked a
    // genuinely `true` one while the client's `find(kit => kit.is_default)`
    // skipped the NULL) is now stated and fixed inside the module —
    // lib/brand-kits/working-identity.ts, step 3, which passes
    // `nullsFirst: false` for exactly this reason.
    //
    // Called HERE — above the generations insert and above the reservation —
    // because `sanitizePrompt` runs inside it and throws PromptBlockedError,
    // which must reach the OUTER catch with no credits moved and no orphan row.
    // The `working-identity-before-reserve` invariant fails the build otherwise.
    //
    // No `omit`: this studio's form collects none of the five business facts, so
    // the kit is the only source for all of them.
    const identity = await resolveWorkingIdentity(supabase, user.id, {
      brandKitId: input.brandKitId,
      projectId,
    });
    if (input.brandKitId && identity.source === 'none') {
      // ADR-0001: a stale or foreign id resolves to nothing and deliberately
      // does not fall through. Logged rather than returned — the customer did
      // not type this id and cannot act on it, and this route's own deleted
      // comment already said so: "it is not a distinct failure the customer can
      // act on, and it is not worth an error code". Logged, though, because
      // before this round no console output anywhere under app/api/studios
      // mentioned a brand kit — which is how six studios ran with no identity
      // for a month with every gate green.
      console.warn(`[working-identity][edit] brandKitId ${input.brandKitId} did not resolve for user ${user.id}`);
    }

    // Filtered and built HERE — above the insert and above the reservation.
    // Both used to sit inside the post-reservation try block, so a blocked term
    // in the customer's own edit instruction reserved the credits first and
    // refunded them back out again; if that refund failed, the credits were gone
    // for a prompt no model ever saw. The catch below carried an exemption for
    // PromptBlockedError to paper over it. A PromptBlockedError thrown here
    // reaches the OUTER catch directly — no credits moved, no orphan row — the
    // same shape storyboard, plan and analysis use.
    //
    // The brand kit's business columns are filtered by the SAME rule, and that
    // is why the block is passed in rather than built inside buildEditPrompt:
    // buildBrandContextBlock() is where `industry`/`description`/
    // `target_audience`/`city` meet sanitizePrompt, and those columns are
    // customer-writable straight over PostgREST. It now runs inside
    // resolveWorkingIdentity() above — one call, one result, used — so the
    // ordering guarantee is the module's rather than this route's, and it holds
    // in all seven studios instead of the two that happened to build the block.
    // The `sanitize-before-reserve` invariant still fails the build on a builder
    // landing after reserveCredits().
    const safeDescription = input.editDescription ? sanitizePrompt(input.editDescription) : undefined;
    const brandContextBlock = identity.block;

    // `brand_color_match` is the one preset whose direction is a colour it does
    // not itself carry. With no kit AND no free text there is nothing to match,
    // and the honest answer is a 400 naming the missing input — not a credit
    // spent on the model's guess at what "the brand colour" might be. The UI
    // should not offer this preset without a kit; the route does not assume it.
    //
    // This survives the move to the Working Identity, deliberately, and ADR-0001
    // says so in as many words: it is a BUILDER PRECONDITION, not the identity
    // rule. `identity.kit === null` is the same condition the deleted
    // `!brandKit` tested — a resolved kit or nothing — so a stale id that
    // resolves to `source: 'none'` still lands here rather than composing a
    // recipe with no palette in it.
    if (
      input.editPreset &&
      editPresetRequiresBrandColors(input.editPreset) &&
      !identity.kit &&
      !safeDescription
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'validation_error',
          details: [
            {
              code: 'custom',
              path: ['brandKitId'],
              message: `editPreset ${input.editPreset} needs a brand kit or an editDescription naming the colour`,
            },
          ],
        },
        { status: 400 }
      );
    }

    // `edit` was the only studio with no prompt file: the whole prompt was a slug
    // turned into two English words, with nothing telling the model that a
    // reference image was attached or that the customer's photo had to survive.
    const prompt = buildEditPrompt({
      editType: input.editType,
      editDescription: safeDescription,
      editPreset: input.editPreset,
      // The palette, and the cap on it, are unchanged: `buildEditPrompt` reads
      // exactly three columns off this row — `primary_color`,
      // `secondary_color`, `accent_color` — and wraps each in
      // `sanitizePrompt(…, 40)` at lib/ai/prompts/edit.ts:740-746 before any
      // preset recipe can interpolate it. That is where the 40-char cap this
      // route relies on lives, and it still runs.
      //
      // The cast is a downcast, not a fabrication — the same one
      // app/api/studios/photoshoot/route.ts makes into `buildPhotoshootPrompt`
      // in this same round: `identity.kit` is this same `brand_kits` row
      // narrowed to WORKING_IDENTITY_COLUMNS, all three colour columns are in
      // that set, and `BrandKit` is assignable to `WorkingIdentityKit`, which is
      // why TypeScript accepts the assertion with no `as unknown` in the middle.
      //
      // What the module adds on top: `resolveWorkingIdentity` ran sanitizePrompt
      // over all three colour columns ABOVE the reservation, so a blocked term in
      // one now throws before any money moves. `identity.safeColors` is the same
      // three values already filtered and capped; feeding them here instead of
      // the row means narrowing `EditPromptInput.brandKit` (lib/ai/prompts/edit.ts:31)
      // to the palette the builder actually reads — a change to that file AND to
      // the six `buildEditPrompt({ … brandKit })` call sites in
      // scripts/tests/prompts.test.ts, one of which is the gate proving a blocked
      // brand colour is refused. It belongs in its own change. Until it happens,
      // `identity.safeColors` has no consumer here, and that is the one loose
      // end this conversion leaves.
      brandKit: identity.kit as BrandKit | null,
      brandContextBlock,
    });

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'edit', model: 'gemini', status: 'processing',
      // `brandKitId` is the RESOLVED kit, not the requested one: the whole point
      // of the three-step resolution is that the request usually names none, so
      // recording the request would record null for every run that actually used
      // a kit — and this column is the only record of which identity produced a
      // given image. This route already did it; six others recorded what the
      // browser SENT, which is why `input.brandKitId` meant two different things
      // depending on which studio wrote the row.
      input: {
        imageUrl: inputImageRef(input.imageUrl),
        editDescription: input.editDescription,
        editType: input.editType,
        editPreset: input.editPreset,
        brandKitId: identity.kit?.id ?? null,
        promptVersion: EDIT_PROMPT_VERSION,
      },
      credits_used: CREDIT_COST,
    }).select().single();

    // Fail loudly. Without this the request continues, reserves credits, calls the
    // model and returns 200 — while the generations row (and therefore the asset)
    // was never written. The user pays and receives nothing.
    if (genInsertError || !generation) {
      return NextResponse.json(
        { success: false, error: 'failed_to_create_generation' },
        { status: 500 }
      );
    }

    const reserveResult = await reserveCredits({
      userId: user.id, amount: CREDIT_COST,
      // Both halves come from a closed enum, so the ledger line cannot carry
      // customer text — and the preset is what a support question about "why
      // does my white background look grey" will actually turn on.
      studio: 'edit', description: `Image edit - ${input.editType}${input.editPreset ? ` (${input.editPreset})` : ''}`,
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
        }, 'edit');
      }
      return NextResponse.json({ success: false, error: nothingWasCharged ? 'insufficient_credits' : 'credit_reservation_failed', required: CREDIT_COST }, { status: 402 });
    }

    // Recorded onto the generation so the rate of no-ops becomes a measured
    // number rather than an impression. Null when it could not be measured.
    let editEffect: number | null = null;
    let result: Awaited<ReturnType<typeof generateImage>>;
    try {
      // 'gemini', not 'gpt': lib/ai/router.ts forwards `referenceImageUrl` only in
      // the gemini branch. With 'gpt' the image to edit never reached the model, so
      // "edit this photo" generated an unrelated picture from the instruction alone.
      //
      // `aspectRatio` is the marketplace presets' canvas (Amazon 1:1, noon 2:3),
      // sent as an API parameter because the prompt alone asking for a shape the
      // request pins to the original is a self-contradiction — and a contradicted
      // model declines at HTTP 200 with the credit charged.
      result = await generateImage({
        prompt,
        model: 'gemini',
        resolution: '1080p',
        referenceImageUrl: input.imageUrl,
        aspectRatio: input.editPreset ? editPresetAspectRatio(input.editPreset) ?? undefined : undefined,
      });

      // Apply watermark for free plan users
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_id')
        .eq('id', user.id)
        .single();
      const planId = profile?.plan_id || 'free';

      // ── THE MARKETPLACE WHITE IS A NUMBER, NOT A LOOK ─────────────────────
      // For presets whose spec states the background as an RGB value, snap the
      // border-connected near-white field to exact 255. Measured need: the same
      // prompt produced exact 255 on one canvas and a 246–253 warm white on the
      // other in a single live run (2026-08-27). BEFORE the effect measurement,
      // so what is measured is what ships. Fail-open inside the helper.
      if (result.url && input.editPreset && editPresetPureWhiteField(input.editPreset)) {
        result.url = await snapWhiteFieldOnDataUrl(result.url);
      }

      // ── DID THIS EDIT ACTUALLY CHANGE ANYTHING? ───────────────────────────
      // Measured HERE, before persistGeneratedImage replaces `result.url` with a
      // storage URL: at this moment the output is still the model's inline
      // `data:` payload, so both sides of the comparison are already in memory
      // and this costs no fetch.
      //
      // WARNING ONLY — it must never refund. See lib/image/edit-effect.ts for the
      // measured separation (worst no-op 23.3, weakest real edit 30.1, on eight
      // labelled production runs). That gap is enough to flag for a human and
      // nowhere near enough to move money: refusing a real edit and telling the
      // customer it failed is worse than the defect being detected.
      if (result.inputSignature && result.url) {
        try {
          const after = await effectSignatureFromDataUrl(result.url);
          const maxLocal = after ? strongestLocalChange(result.inputSignature, after) : null;
          const overall = after ? overallChange(result.inputSignature, after) : null;
          if (maxLocal !== null) editEffect = Math.round(maxLocal * 10) / 10;
          // BOTH measures, because there are two kinds of real edit. A localized
          // change shows in the strongest cell; a colour or style grade shows
          // only in the mean, and on that measure alone a genuine warm grade
          // scored LOWER than a labelled no-op. See lib/image/edit-effect.ts.
          if (looksLikeNoOp(maxLocal, overall)) {
            console.warn(
              `[edit][low-effect] generation ${generation?.id ?? '?'} preset=${input.editPreset ?? 'none'} ` +
                `type=${input.editType} local=${maxLocal?.toFixed(1)} overall=${overall?.toFixed(2)}: ` +
                'the model may have returned the input essentially unchanged, and the customer has been charged.'
            );
          }
        } catch {
          // Diagnostics never fail a paid generation.
        }
      }

      if (result.url) {
        // Pyra returns a data: URL. Persisting it keeps the whole image out of
        // generations.output and assets.url, and burns in the free-plan
        // watermark before the single upload.
        result.url = await persistGeneratedImage(supabase, result.url, {
          userId: user.id, generationId: generation.id, planId,
        });
      }
    } catch (genError) {
      const refundResult = await refundCredits({ userId: user.id, amount: CREDIT_COST, description: `Refund: edit generation failed`, generationId: generation?.id });
      if (generation) {
        await failGeneration(supabase, generation.id, {
          creditsSettled: refundResult.success,
          error: 'generation_failed',
        }, 'edit');
      }
      // No exemption for PromptBlockedError. The prompt is now built above the
      // reservation, so a blocked instruction cannot reach this arm at all — and
      // back when it could, exempting it meant a refund that FAILED still
      // returned a tidy 400 and lost the credits with nothing logged. Credits
      // that did not come back are the alarm, whatever threw. Same rule as
      // plan, analysis and storyboard.
      if (!refundResult.success) {
        console.error('Edit API error:', genError);
        return NextResponse.json({ success: false, error: 'refund_failed' }, { status: 500 });
      }
      throw genError;
    }

    if (generation) {
      await finalizeGeneration(supabase, generation.id, { status: 'completed', output: { imageUrl: result.url, mock: result.mock, editEffect } }, 'edit');
      // `format` was omitted here and nowhere else, so every edit export and library
      // download was named .png regardless of the bytes — the same wrong-extension
      // defect that was fixed for the export ZIP.
      await insertAssets(supabase, [{ user_id: user.id, generation_id: generation.id, type: 'image', url: result.url || '', format: formatFromUrl(result.url || '') }], 'edit');
    }

    return NextResponse.json({ success: true, data: { generationId: generation?.id, imageUrl: result.url, mock: result.mock, creditsUsed: CREDIT_COST, newBalance: reserveResult.newBalance } });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    if (error instanceof PromptBlockedError) {
      return NextResponse.json(
        { success: false, error: 'prompt_blocked', term: error.blockedTerm },
        { status: 400 }
      );
    }
    console.error('Edit API error:', error);
    return NextResponse.json({ success: false, error: 'generation_failed' }, { status: 500 });
  }
}
