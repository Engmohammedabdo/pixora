import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { brandKitLogoSchema } from '@/lib/brand-kits/schema';
import { isOwnUploadUrl } from '@/lib/storage/uploaded-url';

const UpdateBrandKitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  logo_url: brandKitLogoSchema,
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  font_primary: z.string().max(50).optional(),
  font_secondary: z.string().max(50).optional(),
  brand_voice: z.string().max(500).nullable().optional(),
  is_default: z.boolean().optional(),
});

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const input = UpdateBrandKitSchema.parse(body);

    // Same provenance check as POST. `input.logo_url` may legitimately be null
    // here (clearing the logo), which is why this tests the truthy case only.
    if (input.logo_url && !isOwnUploadUrl(input.logo_url, user.id)) {
      return NextResponse.json({ success: false, error: 'invalid_logo_url' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('brand_kits')
      .update(input)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single();

    // A check_violation here is migration 042's logo guard. The route already
    // refuses the same shapes (isOwnUploadUrl), so reaching this means the two
    // have drifted — report it as the 400 the customer can act on rather than a
    // 500 carrying raw Postgres text, and let the log carry the detail.
    if (error) {
      if (error.code === '23514') {
        console.error('[brand-kits] update refused by the database guard:', error.message);
        return NextResponse.json({ success: false, error: 'invalid_logo_url' }, { status: 400 });
      }
      console.error('[brand-kits] update failed:', error.message);
      return NextResponse.json({ success: false, error: 'save_failed' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'validation_error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Brand kit PUT error:', error);
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

    const { error } = await supabase
      .from('brand_kits')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[brand-kits] delete failed:', error.message);
      return NextResponse.json({ success: false, error: 'delete_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Brand kit DELETE error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
