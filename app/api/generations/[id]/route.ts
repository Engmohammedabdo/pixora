import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { MAX_RETRIEVABLE_OUTPUT_BYTES, isRetrievableStudio, stripInlineImages } from '@/lib/studios/text-output';

/**
 * GET /api/generations/[id] — one text generation, including its output.
 *
 * This is the route that makes paid work survive a closed tab. `plan`,
 * `analysis` and `storyboard` write their result only into `generations.output`;
 * before this existed nothing outside `/app/admin/` read that column, so the
 * customer's only copy of a 14-credit storyboard was the React state of the tab
 * that produced it.
 *
 * TWO REFUSALS, BOTH DELIBERATE
 *
 * *Not found vs not yours* are answered identically, as a 404. RLS already makes
 * another user's row invisible — `uid() = user_id` — so the query returns
 * nothing either way; reporting 403 for the second case would turn this into an
 * oracle for which generation ids exist.
 *
 * *Wrong studio* is refused explicitly rather than served. `output` on the image
 * studios holds base64 image data measured at 904 kB – 2.8 MB per row on the
 * live table; those files are already retrievable through `assets` and the files
 * page. Serving them here would be a multi-megabyte response that duplicates a
 * surface which does the job better.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await context.params;

    // A malformed id reaches Postgres as an invalid uuid and comes back as a 500
    // carrying raw driver text. Refuse the shape here instead.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    // Decide on METADATA alone. Selecting `output` up front meant pulling the
    // 904 kB – 2.8 MB blob an image studio stores across the wire specifically so
    // it could be discarded on the very next line. Two small queries beat one huge
    // one, and the refusal path now costs nothing.
    const { data: meta, error } = await supabase
      .from('generations')
      .select('id, studio, status, input, credits_used, created_at, project_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.error('[generations] fetch failed:', error.message);
      return NextResponse.json({ success: false, error: 'fetch_failed' }, { status: 500 });
    }

    if (!meta) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    if (!isRetrievableStudio(meta.studio as string)) {
      return NextResponse.json({ success: false, error: 'unsupported_studio' }, { status: 400 });
    }

    const { data: stored, error: outputError } = await supabase
      .from('generations')
      .select('output')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (outputError) {
      console.error('[generations] output fetch failed:', outputError.message);
      return NextResponse.json({ success: false, error: 'fetch_failed' }, { status: 500 });
    }

    // TWO independent guards, because campaign joined this set and its output is
    // not reliably small: lib/storage/persist-image.ts hands back a base64 `data:`
    // URL on four degradation paths, so a campaign row can carry nine inline
    // images. The stripper covers the source known today; the byte ceiling covers
    // the one nobody has thought of yet.
    const output = stripInlineImages(stored?.output ?? null);
    const bytes = Buffer.byteLength(JSON.stringify(output ?? null), 'utf8');
    if (bytes > MAX_RETRIEVABLE_OUTPUT_BYTES) {
      console.error(
        `[generations] ${id} (${meta.studio}) refused: stored output is ${bytes} bytes after stripping inline images, over the ${MAX_RETRIEVABLE_OUTPUT_BYTES} ceiling.`
      );
      return NextResponse.json({ success: false, error: 'unsupported_studio' }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { ...meta, output } });
  } catch (error) {
    console.error('[generations] unexpected:', error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: 'server_error' }, { status: 500 });
  }
}
