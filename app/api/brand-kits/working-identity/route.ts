import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { resolveProjectId } from '@/lib/projects/verify';
import { STUDIO_IDENTITY_POLICY, resolveWorkingIdentity } from '@/lib/brand-kits/working-identity';
import { PromptBlockedError } from '@/lib/ai/prompts/safety';

/**
 * "If I generated right now, whose business would this be for?"
 *
 * The studios resolve the Working Identity server-side
 * (lib/brand-kits/working-identity.ts), which is correct and which left the
 * customer unable to see the answer until after they had paid for it. Before
 * this route, NO surface in the product named the kit a generation would use —
 * `brandKits.map` appears at exactly two sites in the whole app and neither is
 * on a generation path.
 *
 * It exists rather than having each page re-derive the answer because a rule
 * stated twice is a rule that drifts: that is the entire defect this work
 * exists to remove, and re-implementing the ladder in the browser to draw a
 * label would reintroduce it in the one place the customer can actually SEE the
 * disagreement.
 *
 * GET /api/brand-kits/working-identity?projectId=…&brandKitId=…&useBrandKit=false
 *
 * Every parameter is optional and mirrors what the studio is about to POST, so
 * the label and the generation cannot disagree.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const rawProjectId = params.get('projectId') ?? undefined;
    const rawBrandKitId = params.get('brandKitId') ?? undefined;

    // Verified the same way every studio verifies it. A projectId that is not
    // the caller's resolves to `false`; here that is not a 404 — the customer is
    // only asking a question — it simply means no project step.
    const projectId = await resolveProjectId(supabase, user.id, rawProjectId);

    // The studio asking. Its policy decides what gets filtered and what counts
    // as "contributed", and it MUST be the studio's own — the first version of
    // this route passed neither list, so `blocked` could not fire for the very
    // columns campaign and storyboard filter, and `contributed` was computed
    // over four business facts while plan omits three and analysis four. The
    // label said one thing and Generate did another, which is the failure this
    // whole change exists to remove, reintroduced in the one place the customer
    // can see it. Read from the shared table, never restated here.
    const studio = params.get('studio') ?? '';
    const policy = STUDIO_IDENTITY_POLICY[studio] ?? {};

    let identity;
    try {
      identity = await resolveWorkingIdentity(supabase, user.id, {
        optedOut: params.get('useBrandKit') === 'false',
        brandKitId: rawBrandKitId,
        projectId: projectId === false ? null : projectId,
        ...policy,
      });
    } catch (error) {
      // The one throw worth reporting rather than hiding. `sanitizePrompt` runs
      // over the kit's business columns inside `buildBrandContextBlock`, so a
      // blocked term in the customer's OWN brand kit means every studio will
      // refuse before generating. Told here, the customer learns it while the
      // Generate button is still unpressed instead of from a 400 they cannot
      // place. Any other error is a genuine failure and falls through.
      if (error instanceof PromptBlockedError) {
        return NextResponse.json({
          success: true,
          data: { id: null, name: null, source: 'none', projectValid: true, contributed: false, blocked: true, term: error.blockedTerm },
        });
      }
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: {
        id: identity.kit?.id ?? null,
        // The customer's own name, shown back to them — React escapes it, and
        // the display cap exists because `brand_kits.name` is writable to 200
        // characters over PostgREST and this renders in a single line.
        name: identity.kit?.name ? String(identity.kit.name).slice(0, 100) : null,
        source: identity.source,
        // A projectId that is not the caller's. The GET treats it as 'no project
        // step' and answers anyway, but the POST returns 404 project_not_found
        // BEFORE generating — so without this the bar would promise an identity
        // for a request that cannot run at all. Reported rather than thrown: the
        // customer is asking a question, not spending anything.
        projectValid: rawProjectId ? projectId !== false : true,
        // "A kit resolved" and "the kit had anything to say" are different
        // facts. Every kit created before migration 045 has all four business
        // columns null, which is the common shape — so a customer can have a
        // brand kit and still get a generic result, and only this flag can tell
        // them so before they spend the credit.
        contributed: identity.contributed,
        blocked: false,
      },
    });
  } catch (error) {
    console.error('Working identity GET error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
