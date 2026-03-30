import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '@/lib/admin/auth';

export async function POST(request: NextRequest) {
  const isAdmin = await verifyAdminSession(request);
  if (!isAdmin) {
    return NextResponse.json({ success: false, error: 'unauthorized' }, { status: 401 });
  }

  const { model } = await request.json();

  if (!['gemini', 'gpt', 'flux'].includes(model)) {
    return NextResponse.json({ success: false, error: 'Invalid model' }, { status: 400 });
  }

  const testPrompt = 'A professional product photo of a coffee cup on a marble table, studio lighting, 4K quality';
  const startTime = Date.now();

  try {
    const { generateImage } = await import('@/lib/ai/router');
    const result = await generateImage({
      prompt: testPrompt,
      model: model,
      resolution: '1080p',
    });

    const elapsed = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        model,
        result: result.url || 'No output URL',
        responseTimeMs: elapsed,
        usedFallback: result.usedFallback,
      },
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      data: {
        model,
        error: error instanceof Error ? error.message : 'Unknown error',
        responseTimeMs: elapsed,
        failed: true,
      },
    });
  }
}
