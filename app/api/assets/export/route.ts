import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import JSZip from 'jszip';

const InputSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { assetIds } = InputSchema.parse(body);

    // Fetch assets belonging to the user
    const { data: assets, error } = await supabase
      .from('assets')
      .select('id, url, type, format, generation_id, generations(studio)')
      .eq('user_id', user.id)
      .in('id', assetIds);

    if (error || !assets || assets.length === 0) {
      return NextResponse.json({ success: false, error: 'no_assets_found' }, { status: 404 });
    }

    const zip = new JSZip();

    // Download and add each asset to ZIP
    const downloadPromises = assets.map(async (asset, index) => {
      try {
        const res = await fetch(asset.url);
        if (!res.ok) return;

        const buffer = await res.arrayBuffer();
        const ext = asset.format || (asset.type === 'audio' ? 'mp3' : 'png');
        const studio = (asset.generations as { studio?: string } | null)?.studio || 'pixora';
        const filename = `${studio}-${index + 1}.${ext}`;

        zip.file(filename, buffer);
      } catch {
        // Skip failed downloads
      }
    });

    await Promise.all(downloadPromises);

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="pixora-export-${Date.now()}.zip"`,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'validation_error', details: error.issues }, { status: 400 });
    }
    console.error('Export error:', error);
    return NextResponse.json({ success: false, error: 'export_failed' }, { status: 500 });
  }
}
