import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';
import { createAdminClient } from '@/lib/admin/db';

export async function GET(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const url = new URL(request.url);
  const cohortCount = Math.min(parseInt(url.searchParams.get('cohorts') || '6'), 12);

  const now = new Date();

  // Get all profiles and their signup dates
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, created_at');

  // Get all generations with user_id and created_at
  const cohortStart = new Date(now.getFullYear(), now.getMonth() - cohortCount, 1);
  const { data: generations } = await supabase
    .from('generations')
    .select('user_id, created_at')
    .gte('created_at', cohortStart.toISOString());

  // Build cohort data
  // Cohort = signup month, Columns = months 0, 1, 2, ...
  const cohorts: {
    cohort: string;
    totalUsers: number;
    months: { month: number; activeUsers: number; retentionRate: number }[];
  }[] = [];

  for (let i = cohortCount - 1; i >= 0; i--) {
    const cohortMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const cohortEnd = new Date(cohortMonth.getFullYear(), cohortMonth.getMonth() + 1, 0, 23, 59, 59);
    const cohortStr = `${cohortMonth.getFullYear()}-${String(cohortMonth.getMonth() + 1).padStart(2, '0')}`;

    // Users who signed up in this cohort month
    const cohortUsers = (profiles || []).filter(p => {
      const created = new Date(p.created_at);
      return created >= cohortMonth && created <= cohortEnd;
    });

    if (cohortUsers.length === 0) {
      cohorts.push({ cohort: cohortStr, totalUsers: 0, months: [] });
      continue;
    }

    const cohortUserIds = new Set(cohortUsers.map(u => u.id));
    const maxMonths = i; // How many months have passed since this cohort

    const monthData: { month: number; activeUsers: number; retentionRate: number }[] = [];

    // Month 0 = signup month (always 100%)
    monthData.push({ month: 0, activeUsers: cohortUsers.length, retentionRate: 100 });

    // Months 1 to maxMonths
    for (let m = 1; m <= maxMonths; m++) {
      const checkMonth = new Date(cohortMonth.getFullYear(), cohortMonth.getMonth() + m, 1);
      const checkEnd = new Date(checkMonth.getFullYear(), checkMonth.getMonth() + 1, 0, 23, 59, 59);

      // Count cohort users who had >= 1 generation in this month
      const activeInMonth = new Set<string>();
      for (const g of (generations || [])) {
        const gDate = new Date(g.created_at as string);
        if (gDate >= checkMonth && gDate <= checkEnd && cohortUserIds.has(g.user_id as string)) {
          activeInMonth.add(g.user_id as string);
        }
      }

      const retentionRate = cohortUsers.length > 0
        ? parseFloat(((activeInMonth.size / cohortUsers.length) * 100).toFixed(1))
        : 0;

      monthData.push({ month: m, activeUsers: activeInMonth.size, retentionRate });
    }

    cohorts.push({ cohort: cohortStr, totalUsers: cohortUsers.length, months: monthData });
  }

  return NextResponse.json({ success: true, data: { cohorts } });
}
