import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod/v4';
import { createServerClient } from '@/lib/supabase/server';
import JSZip from 'jszip';
import { inlineBytes, ownedStoragePath } from '@/lib/storage/export-source';

const InputSchema = z.object({
  assetIds: z.array(z.string().uuid()).min(1).max(50),
});

const MAX_ASSET_BYTES = 25 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 200 * 1024 * 1024;

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
    let added = 0;
    let skipped = 0;
    let bytes = 0;

    // Take each asset's bytes from the row itself or from OUR storage by path —
    // never by fetching its URL.
    //
    // `assets.url` is customer-writable (see lib/storage/export-source.ts), so
    // `await fetch(asset.url)` made this endpoint issue a request to an
    // attacker-chosen address from inside the network and hand the response back
    // in a ZIP the attacker downloads. Resolving through the storage client
    // removes the attacker's control of the destination entirely: the only thing
    // taken from `url` is a path, and that path must sit under this user's own
    // folder. Nothing outside our bucket is contacted at all.
    for (const [index, asset] of assets.entries()) {
      let body: Buffer | ArrayBuffer | null = inlineBytes(asset.url);

      if (!body) {
        const path = ownedStoragePath(asset.url, user.id);
        if (!path) {
          // A foreign http(s) host — a placehold.co mock, or a row someone
          // pointed elsewhere. Not ours to serve.
          skipped += 1;
          continue;
        }

        const { data: file, error: dlError } = await supabase.storage.from('assets').download(path);
        if (dlError || !file) {
          skipped += 1;
          continue;
        }
        if (file.size > MAX_ASSET_BYTES) {
          skipped += 1;
          continue;
        }
        body = await file.arrayBuffer();
      }

      const size = body instanceof Buffer ? body.length : body.byteLength;
      // The old code read every response with an unbounded arrayBuffer(), 50 at
      // a time, straight into the process heap.
      if (size > MAX_ASSET_BYTES || bytes + size > MAX_ARCHIVE_BYTES) {
        skipped += 1;
        continue;
      }
      bytes += size;
      added += 1;

      const ext = asset.format || (asset.type === 'audio' ? 'mp3' : 'png');
      const studio = (asset.generations as { studio?: string } | null)?.studio || 'pyrasuite';
      zip.file(`${studio}-${index + 1}.${ext}`, body);
    }

    if (added === 0) {
      return NextResponse.json({ success: false, error: 'no_exportable_assets' }, { status: 404 });
    }

    if (skipped > 0) {
      console.warn('[export] skipped %d of %d assets for %s', skipped, assets.length, user.id);
    }

    const zipBuffer = await zip.generateAsync({ type: 'uint8array' });

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="pyrasuite-export-${Date.now()}.zip"`,
        // A short archive and a complete one are otherwise indistinguishable to
        // the caller, which is exactly the signal a partial export needs.
        'X-Export-Included': String(added),
        'X-Export-Skipped': String(skipped),
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
