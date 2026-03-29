import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/stripe/plans';

const CreateBrandKitSchema = z.object({
  name: z.string().min(1).max(100),
  logo_url: z.string().url().optional(),
  primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  secondary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accent_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  font_primary: z.string().max(50).optional(),
  font_secondary: z.string().max(50).optional(),
  brand_voice: z.string().max(500).optional(),
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

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
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
