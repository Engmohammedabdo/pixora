import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/stripe/plans';
import { CreateBrandKitSchema } from '@/lib/brand-kits/schema';
import { mapBrandKitCheckViolation } from '@/lib/brand-kits/errors';
import { isOwnUploadUrl } from '@/lib/storage/uploaded-url';

// CreateBrandKitSchema now lives in lib/brand-kits/schema.ts, derived from the
// same field set UpdateBrandKitSchema uses. They disagreed before — POST had
// `.optional()` where PUT had `.nullable()` on logo_url/brand_voice, while the
// one form that feeds both always sent explicit `null` — so creating a kit
// without a logo or voice 400'd silently while editing the same kit worked.

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

    // A check_violation here is one of six constraints now: migration 042's
    // logo guard, or one of the five business-context bounds migration 045
    // added. The route already refuses the shapes it knows about
    // (isOwnUploadUrl, the Zod caps above), so reaching this means a layer has
    // drifted — report it as the 400 the customer can act on rather than a 500
    // carrying raw Postgres text, and let the log carry the detail.
    if (error) {
      if (error.code === '23514') {
        const code = mapBrandKitCheckViolation(error.message);
        console.error('[brand-kits] insert refused by the database guard:', error.message);
        return NextResponse.json({ success: false, error: code }, { status: 400 });
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
