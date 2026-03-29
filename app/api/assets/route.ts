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

    let query = supabase
      .from('assets')
      .select('*, generations(studio, model, input)', { count: 'exact' })
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (studio && studio !== 'all') {
      // Get generation IDs for this studio first (PostgREST join filters don't work correctly)
      const { data: gens } = await supabase
        .from('generations')
        .select('id')
        .eq('user_id', user.id)
        .eq('studio', studio);
      const genIds = (gens || []).map(g => g.id);
      if (genIds.length > 0) {
        query = query.in('generation_id', genIds);
      } else {
        return NextResponse.json({ success: true, data: [], total: 0, page, limit });
      }
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
