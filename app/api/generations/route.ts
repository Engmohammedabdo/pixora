import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { TEXT_STUDIOS, isTextStudio } from '@/lib/studios/text-output';

/**
 * GET /api/generations — the customer's own history for the text studios.
 *
 * WHY THIS ROUTE EXISTS
 *
 * `plan` (5 credits), `analysis` (3) and `storyboard` (14) write their entire
 * result into `generations.output` and nowhere else. Until this route, every
 * read of that table outside the studio write path lived under `/app/admin/` —
 * so a customer who reloaded the page lost work they had already paid for, with
 * no way to get it back and no warning that they were about to. The image
 * studios never had this problem because they also write `assets`, which the
 * files page reads.
 *
 * WHY `output` IS NOT RETURNED HERE
 *
 * Measured against the live table, `output` averages 904 kB for creator, 921 kB
 * for edit and 2.8 MB for photoshoot — those studios embed base64 image data in
 * it. A list endpoint that selected `*` would ship megabytes per row to a phone
 * on mobile data. The list carries metadata only; `/api/generations/[id]`
 * returns one row's output, and refuses the studios whose output is a blob.
 *
 * RLS does the access control: the `Users view own generations` policy is
 * `uid() = user_id`, and this runs on the user's cookie JWT via
 * `createServerClient()`. The explicit `.eq('user_id', ...)` below is belt and
 * braces, not the boundary.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studio = searchParams.get('studio');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 50);

    let query = supabase
      .from('generations')
      .select('id, studio, status, input, credits_used, created_at, project_id', { count: 'exact' })
      // Only the studios whose work is unreachable any other way. Listing image
      // generations here would duplicate the files page while telling the customer
      // less than it does.
      .in('studio', TEXT_STUDIOS)
      // A failed generation was refunded and holds no output; showing it in a
      // "your work" list invites someone to click into an empty page.
      .eq('status', 'completed')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (studio && studio !== 'all') {
      if (!isTextStudio(studio)) {
        return NextResponse.json({ success: false, error: 'unsupported_studio' }, { status: 400 });
      }
      query = query.eq('studio', studio);
    }

    const projectId = searchParams.get('projectId');
    if (projectId === 'unassigned') query = query.is('project_id', null);
    else if (projectId && projectId !== 'all') query = query.eq('project_id', projectId);

    const { data, error, count } = await query;

    if (error) {
      console.error('[generations] list failed:', error.message);
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: { rows: data ?? [], total: count ?? 0 },
    });
  } catch (error) {
    console.error('[generations] unexpected:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
