import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const name = formData.get('name') as string | null;
    const avatar = formData.get('avatar') as File | null;

    const updates: Record<string, string> = {};

    if (name && name.trim().length >= 2) {
      updates.name = name.trim();
    }

    if (avatar && avatar.size > 0) {
      if (avatar.size > 2 * 1024 * 1024) {
        return NextResponse.json({ success: false, error: 'File too large (max 2MB)' }, { status: 400 });
      }
      // A raster allowlist, not `image/*`. The avatars bucket accepts
      // image/svg+xml and is public with unrestricted `anon` SELECT, so an SVG
      // carrying a <script> would be served from the Supabase origin and run
      // there — stored XSS. SVG has no place as a user avatar anyway.
      const ALLOWED_AVATAR_TYPES: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
      };
      const ext = ALLOWED_AVATAR_TYPES[avatar.type];
      if (!ext) {
        return NextResponse.json(
          { success: false, error: 'unsupported_image_type' },
          { status: 400 }
        );
      }
      // Bucket and path shape both matter. There is a dedicated `avatars` bucket,
      // and its policy — like every other bucket's — is
      //   INSERT WITH CHECK (bucket_id = '<bucket>'
      //                      AND (storage.foldername(name))[1] = uid()::text)
      // This wrote `avatars/<uid>.<ext>` into the `assets` bucket, so it was both
      // in the wrong bucket and had the literal string 'avatars' as segment 1.
      // Every upload was denied, and because the branch below only acts on
      // success with no else, avatar_url was silently never updated.
      //
      // A fresh filename per upload keeps this an INSERT. `authenticated` holds
      // INSERT and SELECT only, so overwriting a fixed key would be rejected the
      // second time a user changed their picture.
      const path = `${user.id}/${randomUUID()}.${ext}`;
      const buffer = Buffer.from(await avatar.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, buffer, { contentType: avatar.type });

      if (uploadError) {
        console.error('[profile] avatar upload failed:', uploadError.message);
        return NextResponse.json({ success: false, error: 'avatar_upload_failed' }, { status: 500 });
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      updates.avatar_url = urlData.publicUrl;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'Nothing to update' }, { status: 400 });
    }

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, updates });
  } catch (error) {
    console.error('Profile update error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
