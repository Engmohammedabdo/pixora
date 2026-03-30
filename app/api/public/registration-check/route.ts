import { NextResponse } from 'next/server';
import { getCachedFeatureFlags } from '@/lib/admin/settings';

export async function GET() {
  try {
    const flags = await getCachedFeatureFlags();
    return NextResponse.json({
      registration_enabled: flags.registration_enabled,
    });
  } catch {
    // Default to allowing registration if settings can't be read
    return NextResponse.json({ registration_enabled: true });
  }
}
