import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (!user || authError) {
      return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const bucket = (formData.get('bucket') as string) || 'uploads';

    if (!file) {
      return NextResponse.json({ success: false, error: 'no_file' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: 'invalid_type', allowed: ALLOWED_TYPES },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { success: false, error: 'file_too_large', maxSize: '10MB' },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop() || 'png';
    const fileName = `${user.id}/${randomUUID()}.${ext}`;

    // Check if Supabase Storage is available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const isSupabaseConfigured = supabaseUrl && !supabaseUrl.includes('placeholder');

    if (isSupabaseConfigured) {
      // Upload to Supabase Storage
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(fileName, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        return NextResponse.json(
          { success: false, error: uploadError.message },
          { status: 500 }
        );
      }

      const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(fileName);

      return NextResponse.json({
        success: true,
        data: { url: urlData.publicUrl, fileName, bucket },
      });
    }

    // Fallback: save locally for development
    const uploadDir = join(process.cwd(), 'public', 'uploads', user.id);
    await mkdir(uploadDir, { recursive: true });

    const localPath = join(uploadDir, `${randomUUID()}.${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(localPath, buffer);

    const publicUrl = localPath.replace(join(process.cwd(), 'public'), '');

    return NextResponse.json({
      success: true,
      data: { url: publicUrl, fileName, bucket: 'local' },
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ success: false, error: 'internal_error' }, { status: 500 });
  }
}
