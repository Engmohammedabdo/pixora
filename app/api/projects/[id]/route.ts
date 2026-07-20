import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient, createServiceRoleClient } from '@/lib/supabase/server';

const UpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  brandKitId: z.string().uuid().nullable().optional(),
});

/**
 * PATCH /api/projects/[id] — rename a project or change its brand kit.
 *
 * Every query is scoped with `.eq('user_id', user.id)` as well as the id. RLS
 * already restricts rows, but repeating the ownership filter here means an IDOR
 * cannot appear if a policy is ever loosened.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const input = UpdateSchema.parse(await request.json());

    if (input.brandKitId) {
      const { data: kit } = await supabase
        .from('brand_kits')
        .select('id')
        .eq('id', input.brandKitId)
        .eq('user_id', user.id)
        .single();
      if (!kit) {
        return NextResponse.json({ success: false, error: 'brand_kit_not_found' }, { status: 404 });
      }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.name !== undefined) patch.name = input.name;
    if (input.brandKitId !== undefined) patch.brand_kit_id = input.brandKitId;

    // Service-role write (migration 024 revoked UPDATE for users). The
    // `.eq('user_id', user.id)` below is what still enforces ownership.
    const db = await createServiceRoleClient();
    const { data: project, error } = await db
      .from('projects')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select('id, name, brand_kit_id, created_at')
      .single();

    if (error || !project) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { id: project.id, name: project.name, brandKitId: project.brand_kit_id, createdAt: project.created_at },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error' }, { status: 400 });
    }
    console.error('Project PATCH error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id] — remove a project.
 *
 * Generations are NOT deleted. `generations.project_id` is ON DELETE SET NULL, so
 * the work returns to "unassigned" instead of disappearing. Deleting a client
 * folder must never destroy the paid output inside it.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    // Service-role write (migration 024 revoked DELETE for users). Ownership is
    // still enforced by the `.eq('user_id', user.id)` filter below.
    const db = await createServiceRoleClient();
    const { error, count } = await db
      .from('projects')
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      console.error('[projects] delete failed:', error.message);
      return NextResponse.json({ success: false, error: 'delete_failed' }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ success: false, error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Project DELETE error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
