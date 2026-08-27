import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { getStudioCost } from '@/lib/credits/costs';
import {
  EDIT_PRESET_IDS,
  EDIT_PROMPT_VERSION,
  EDIT_TYPES,
  buildEditPrompt,
  editPresetMatchesType,
  editPresetRequiresBrandColors,
} from '@/lib/ai/prompts/edit';
import { buildBrandContextBlock } from '@/lib/ai/prompts/brand-context';
import { inputImageRef, readableImageUrl } from '@/lib/storage/reference-image';
import { createServerClient } from '@/lib/supabase/server';
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
   *  See the three-step resolution below. */
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

    // ── The brand kit, resolved in three steps ────────────────────────────
    //
    // This studio knew NOTHING about the customer until now (review finding
    // F10): it resolved `projectId` and used it only as a label on the
    // generations row. `buildEditPrompt`'s `brandKit` parameter existed and was
    // documented dead. It is the studio a paying subscriber uses on their own
    // product photographs, which makes it the last place "I should not have to
    // tell it who I am again" is acceptable.
    //
    //   1. an explicit `brandKitId` — the form knows which kit the customer is
    //      looking at, and that beats any inference;
    //   2. the selected project's kit — switching client switches identity, and
    //      that is what client workspaces are sold for;
    //   3. the account's default kit.
    //
    // Step 3 is finding F12, fixed the same way in photoshoot and storyboard: a
    // customer who finishes onboarding and never creates a project has exactly
    // one kit and no project, so a project-only lookup gives them nothing — on
    // the precise journey the brand-context work was built for.
    //
    // A `brandKitId` that is not the caller's simply resolves to null, the same
    // as photoshoot and every other studio: it is not a distinct failure the
    // customer can act on, and it is not worth an error code.
    let brandKit: BrandKit | null = null;
    if (input.brandKitId) {
      const { data } = await supabase
        .from('brand_kits')
        .select('*')
        .eq('id', input.brandKitId)
        .eq('user_id', user.id)
        .single();
      brandKit = data;
    } else {
      let projectKitId: string | null = null;
      if (projectId) {
        const { data: project } = await supabase
          .from('projects')
          .select('brand_kit_id')
          .eq('id', projectId)
          .eq('user_id', user.id)
          .single();
        projectKitId = project?.brand_kit_id ?? null;
      }
      if (projectKitId) {
        const { data } = await supabase
          .from('brand_kits')
          .select('*')
          .eq('id', projectKitId)
          .eq('user_id', user.id)
          .single();
        brandKit = data;
      }
      if (!brandKit) {
        // `is_default` first, then the newest — the SAME order the client
        // already resolves in (`hooks/useBrandKit.ts:98`:
        // `brandKits.find(is_default) || brandKits[0]`, over a list ordered
        // created_at DESC). Two resolutions of one question that disagree is
        // how a customer gets one identity in the form and another in the
        // prompt.
        const { data } = await supabase
          .from('brand_kits')
          .select('*')
          .eq('user_id', user.id)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);
        brandKit = data?.[0] ?? null;
      }
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
    // is why the block is built here rather than inside buildEditPrompt:
    // buildBrandContextBlock() is where `industry`/`description`/
    // `target_audience`/`city` meet sanitizePrompt, and those columns are
    // customer-writable straight over PostgREST. Built once and passed in — the
    // `sanitize-before-reserve` invariant fails the build on either call landing
    // after reserveCredits().
    const safeDescription = input.editDescription ? sanitizePrompt(input.editDescription) : undefined;
    const brandContextBlock = brandKit
      ? buildBrandContextBlock({
          name: brandKit.name ?? null,
          industry: brandKit.industry ?? null,
          description: brandKit.description ?? null,
          targetAudience: brandKit.target_audience ?? null,
          city: brandKit.city ?? null,
        })
      : '';

    // `brand_color_match` is the one preset whose direction is a colour it does
    // not itself carry. With no kit AND no free text there is nothing to match,
    // and the honest answer is a 400 naming the missing input — not a credit
    // spent on the model's guess at what "the brand colour" might be. The UI
    // should not offer this preset without a kit; the route does not assume it.
    if (
      input.editPreset &&
      editPresetRequiresBrandColors(input.editPreset) &&
      !brandKit &&
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
      brandKit,
      brandContextBlock,
    });

    const { data: generation, error: genInsertError } = await supabase.from('generations').insert({
      user_id: user.id, project_id: projectId, studio: 'edit', model: 'gemini', status: 'processing',
      // `brandKitId` is the RESOLVED kit, not the requested one: the whole point
      // of the three-step resolution is that the request usually names none, so
      // recording the request would record null for every run that actually used
      // a kit — and this column is the only record of which identity produced a
      // given image.
      input: {
        imageUrl: inputImageRef(input.imageUrl),
        editDescription: input.editDescription,
        editType: input.editType,
        editPreset: input.editPreset,
        brandKitId: brandKit?.id ?? null,
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
      result = await generateImage({ prompt, model: 'gemini', resolution: '1080p', referenceImageUrl: input.imageUrl });

      // Apply watermark for free plan users
      const { data: profile } = await supabase
        .from('profiles')
        .select('plan_id')
        .eq('id', user.id)
        .single();
      const planId = profile?.plan_id || 'free';

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
