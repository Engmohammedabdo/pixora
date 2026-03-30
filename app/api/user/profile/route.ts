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
      if (!avatar.type.startsWith('image/')) {
        return NextResponse.json({ success: false, error: 'Only images allowed' }, { status: 400 });
      }

      const ext = avatar.type.split('/')[1] || 'jpg';
      const path = `avatars/${user.id}.${ext}`;
      const buffer = Buffer.from(await avatar.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(path, buffer, { contentType: avatar.type, upsert: true });

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('assets').getPublicUrl(path);
        updates.avatar_url = urlData.publicUrl;
      }
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
