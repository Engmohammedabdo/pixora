import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getSignedAssetUrl } from '@/lib/supabase/signed-url';
import { ownedStoragePath } from '@/lib/storage/export-source';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('assets')
      .select('*, generations(studio, model, input, output)')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    // Sign asset URL
    const signedData = {
      ...data,
      url: await getSignedAssetUrl(supabase, data.url),
    };

    return NextResponse.json({ success: true, data: signedData });
  } catch (error) {
    console.error('Asset GET error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    // Fetch asset URL before deleting
    const { data: asset } = await supabase.from('assets').select('url').eq('id', id).eq('user_id', user.id).single();

    const { error } = await supabase
      .from('assets')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Clean up the storage object (best-effort). The path is resolved by the
    // SAME rule the export route uses — origin, public-object marker, the
    // caller's own user-id folder — never parsed by hand from `assets.url`,
    // which is a customer-writable column.
    if (asset?.url) {
      const path = ownedStoragePath(asset.url, user.id);
      if (path) {
        try {
          await supabase.storage.from('assets').remove([path]);
        } catch { /* Storage cleanup is best-effort */ }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Asset DELETE error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
