import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/stripe/plans';
import { brandKitLogoSchema } from '@/lib/brand-kits/schema';
import { isOwnUploadUrl } from '@/lib/storage/uploaded-url';

// `.nullable()` on the two optional text fields is not cosmetic. BrandKitForm
// submits `logo_url: logoUrl` and `brand_voice: brandVoice || null`, so a kit
// created without a logo or without a voice sent null — which `.optional()`
// rejects. The POST returned 400 validation_error, useBrandKit threw, and
// nothing in the UI caught it: the button re-enabled and the dialog sat there.
// Creating a brand kit without a logo did nothing at all, silently. PUT already
// had `.nullable()`, which is why editing worked and creating did not.
const CreateBrandKitSchema = z.object({
  name: z.string().min(1).max(100),
  logo_url: brandKitLogoSchema,
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  font_primary: z.string().max(50).optional(),
  font_secondary: z.string().max(50).optional(),
  brand_voice: z.string().max(500).nullable().optional(),
  is_default: z.boolean().optional(),
});

export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const { data, error } = await supabase
      .from('brand_kits')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Brand kits GET error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const input = CreateBrandKitSchema.parse(body);

    // Provenance, not syntax. `z.string().url()` accepted blob:, data:,
    // javascript: and any foreign host — see lib/storage/uploaded-url.ts.
    // Checked here rather than in the schema because it needs the caller's id:
    // owning the ROW says nothing about where the STRING points.
    if (input.logo_url && !isOwnUploadUrl(input.logo_url, user.id)) {
      return NextResponse.json({ success: false, error: 'invalid_logo_url' }, { status: 400 });
    }

    // Check plan-based brand kit limit
    const { data: profile } = await supabase.from('profiles').select('plan_id').eq('id', user.id).single();
    const plan = getPlan(profile?.plan_id || 'free');
    const { count } = await supabase.from('brand_kits').select('id', { count: 'exact', head: true }).eq('user_id', user.id);
    if ((count || 0) >= plan.maxBrandKits) {
      return NextResponse.json({ success: false, error: 'brand_kit_limit_reached', limit: plan.maxBrandKits }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('brand_kits')
      .insert({
        user_id: user.id,
        ...input,
      })
      .select()
      .single();

    // A check_violation here is migration 042's logo guard. The route already
    // refuses the same shapes (isOwnUploadUrl), so reaching this means the two
    // have drifted — report it as the 400 the customer can act on rather than a
    // 500 carrying raw Postgres text, and let the log carry the detail.
    if (error) {
      if (error.code === '23514') {
        console.error('[brand-kits] insert refused by the database guard:', error.message);
        return NextResponse.json({ success: false, error: 'invalid_logo_url' }, { status: 400 });
      }
      console.error('[brand-kits] insert failed:', error.message);
      return NextResponse.json({ success: false, error: 'save_failed' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'validation_error', details: error.issues },
        { status: 400 }
      );
    }
    console.error('Brand kits POST error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
