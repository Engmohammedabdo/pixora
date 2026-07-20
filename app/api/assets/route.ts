import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getSignedAssetUrl } from '@/lib/supabase/signed-url';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const studio = searchParams.get('studio');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = Math.min(parseInt(searchParams.get('limit') || '24', 10), 100);
    const offset = (page - 1) * limit;

    // Simple query without join — generations join can fail if FK isn't set up in Supabase
    let query = supabase
      .from('assets')
      .select('*', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    // Assets carry no project column of their own — they inherit it from the
    // generation that produced them. Without this filter the library mixes every
    // client's work together, which undoes the isolation projects exist to provide.
    const projectId = searchParams.get('projectId');

    if ((studio && studio !== 'all') || (projectId && projectId !== 'all')) {
      // Resolve matching generation ids first: PostgREST join filters do not
      // filter the parent rows correctly here.
      let genQuery = supabase
        .from('generations')
        .select('id')
        .eq('user_id', user.id);

      if (studio && studio !== 'all') genQuery = genQuery.eq('studio', studio);
      if (projectId === 'unassigned') {
        genQuery = genQuery.is('project_id', null);
      } else if (projectId && projectId !== 'all') {
        genQuery = genQuery.eq('project_id', projectId);
      }

      // Bound the id list explicitly. PostgREST caps rows by default and a very
      // long `in.(...)` list can exceed URL limits — either way files vanish from
      // the library with no error, which reads as data loss to the user.
      const MAX_GENERATION_IDS = 1000;
      const { data: gens } = await genQuery
        .order('created_at', { ascending: false })
        .limit(MAX_GENERATION_IDS);
      const genIds = (gens || []).map((g) => g.id);
      if (genIds.length === MAX_GENERATION_IDS) {
        console.warn('[assets] generation-id filter hit its cap; older assets may be omitted for user', user.id);
      }
      if (genIds.length === 0) {
        return NextResponse.json({ success: true, data: [], total: 0, page, limit });
      }
      query = query.in('generation_id', genIds);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Sign asset URLs
    const signedData = await Promise.all(
      (data || []).map(async (asset) => ({
        ...asset,
        url: await getSignedAssetUrl(supabase, asset.url),
      }))
    );

    return NextResponse.json({
      success: true,
      data: signedData,
      total: count || 0,
      page,
      limit,
    });
  } catch (error) {
    console.error('Assets GET error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
