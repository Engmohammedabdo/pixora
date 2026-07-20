import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getPlan } from '@/lib/stripe/plans';

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  brandKitId: z.string().uuid().nullable().optional(),
});

/**
 * GET /api/projects — the caller's projects with a generation count each.
 *
 * Counts use one exact HEAD request per project. That is N+1 by shape, but each
 * is an index-only count returning no rows (idx_generations_user_project), which
 * is both cheaper and — unlike fetching every project_id and tallying in JS —
 * immune to PostgREST's default row cap silently truncating the tally.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const { data: projects, error } = await supabase
      .from('projects')
      .select('id, name, brand_kit_id, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[projects] list failed:', error.message);
      return NextResponse.json({ success: false, error: 'list_failed' }, { status: 500 });
    }

    const list = projects ?? [];
    const counts = new Map<string, number>();

    // One exact count per project via a HEAD request: `head: true` returns no rows,
    // so this is cheap and — unlike fetching every project_id and counting in JS —
    // it is not silently truncated by PostgREST's default row limit once a user
    // passes a thousand generations.
    await Promise.all(list.map(async (p) => {
      const { count } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('project_id', p.id);
      counts.set(p.id, count ?? 0);
    }));

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();

    const plan = getPlan(profile?.plan_id || 'free');

    return NextResponse.json({
      success: true,
      data: {
        projects: list.map((p) => ({
          id: p.id,
          name: p.name,
          brandKitId: p.brand_kit_id,
          createdAt: p.created_at,
          generationCount: counts.get(p.id) ?? 0,
        })),
        limit: plan.maxProjects,
        used: list.length,
      },
    });
  } catch (error) {
    console.error('Projects GET error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

/**
 * POST /api/projects — create a project, subject to the caller's plan limit.
 *
 * The limit is enforced HERE and not only in the UI: a hidden button is not a
 * limit, and the whole point of project quotas is that they are the reason an
 * agency upgrades.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const input = CreateSchema.parse(await request.json());

    const { data: profile } = await supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .single();

    const plan = getPlan(profile?.plan_id || 'free');

    // Quota, brand-kit ownership and the insert all happen inside create_project()
    // (migration 025). Counting here and inserting separately was racy: two
    // concurrent requests both read the same count and both inserted, so a free
    // user on a limit of 1 could end up with several projects. The function locks
    // the caller's profile row so concurrent creates serialise.
    //
    // Migration 024 also revoked INSERT on `projects` from users, so this must go
    // through the service-role client.
    const db = await createServiceRoleClient();
    const { data: project, error } = await db
      .rpc('create_project', {
        p_user_id: user.id,
        p_name: input.name,
        p_brand_kit_id: input.brandKitId ?? null,
        p_limit: plan.maxProjects,
      });

    if (error || !project) {
      const message = error?.message ?? '';
      if (message.includes('project_limit_reached')) {
        return NextResponse.json({
          success: false,
          error: 'project_limit_reached',
          limit: plan.maxProjects,
        }, { status: 403 });
      }
      if (message.includes('brand_kit_not_found')) {
        return NextResponse.json({ success: false, error: 'brand_kit_not_found' }, { status: 404 });
      }
      console.error('[projects] create failed:', message);
      return NextResponse.json({ success: false, error: 'create_failed' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: project.id,
        name: project.name,
        brandKitId: project.brand_kit_id,
        createdAt: project.created_at,
        generationCount: 0,
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }
    console.error('Projects POST error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
