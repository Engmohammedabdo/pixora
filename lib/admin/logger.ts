import { createAdminClient } from './db';

export async function logAdminAction(
  action: string,
  targetType: string | null,
  targetId: string | null,
  details: Record<string, unknown> | null,
  ipAddress: string | null
) {
  try {
    const supabase = createAdminClient();
    await supabase.from('admin_logs').insert({
      action,
      target_type: targetType,
      target_id: targetId,
      details,
      ip_address: ipAddress,
    });
  } catch (error) {
    console.error('[AdminLogger] Failed to log action:', error);
  }
}

export function getClientIP(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
