/**
 * PDF generation utilities using browser-native approach.
 * Generates HTML content that can be printed to PDF via window.print()
 * or converted server-side with a headless browser later.
 */

interface CampaignPost {
  scenario: string;
  caption: string;
  tov: string;
  schedule: string;
  hashtags: string;
  imageUrl?: string | null;
}

interface AnalysisData {
  swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[] };
  personas?: { name: string; age: string; role: string; goals: string; pain_points: string }[];
  competitors?: { name: string; strengths: string; weaknesses: string; market_share: string }[];
  usp?: { statement: string; positioning: string; differentiators: string[] };
  roadmap?: { day_30: string[]; day_60: string[]; day_90: string[] };
  kpis?: { metric: string; target: string; timeframe: string }[];
}

interface StoryboardScene {
  scene_number: number;
  visual_description: string;
  dialogue: string;
  camera_angle: string;
  camera_movement: string;
  duration_seconds: number;
  mood: string;
}

function wrapInHtml(title: string, content: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>${title} — PyraSuite</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #0F172A; padding: 40px; line-height: 1.6; direction: rtl; }
  h1 { color: #6366F1; font-size: 28px; margin-bottom: 8px; }
  h2 { color: #4F46E5; font-size: 20px; margin: 24px 0 12px; border-bottom: 2px solid #E2E8F0; padding-bottom: 8px; }
  h3 { font-size: 16px; margin: 16px 0 8px; }
  .subtitle { color: #64748B; font-size: 14px; margin-bottom: 32px; }
  .brand { color: #6366F1; font-weight: bold; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  .card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; }
  .badge { display: inline-block; background: #EEF2FF; color: #4F46E5; padding: 2px 10px; border-radius: 12px; font-size: 12px; }
  .swot-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .swot-box { padding: 16px; border-radius: 8px; }
  .swot-s { background: #F0FDF4; border: 1px solid #BBF7D0; }
  .swot-w { background: #FEF2F2; border: 1px solid #FECACA; }
  .swot-o { background: #EFF6FF; border: 1px solid #BFDBFE; }
  .swot-t { background: #FFFBEB; border: 1px solid #FDE68A; }
  ul { padding-right: 20px; }
  li { font-size: 14px; margin-bottom: 4px; }
  .post-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 12px; page-break-inside: avoid; }
  .scene-card { border: 1px solid #E2E8F0; border-radius: 8px; padding: 12px; page-break-inside: avoid; }
  .meta { font-size: 12px; color: #64748B; }
  .tag { display: inline-block; background: #F1F5F9; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin: 2px; }
  .footer { margin-top: 40px; text-align: center; color: #94A3B8; font-size: 12px; border-top: 1px solid #E2E8F0; padding-top: 16px; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head>
<body>
${content}
<div class="footer">تم الإنشاء بواسطة <span class="brand">PyraSuite</span> — منصة التسويق بالذكاء الاصطناعي</div>
</body>
</html>`;
}

export function generateCampaignPdf(posts: CampaignPost[], title?: string): string {
  const postCards = posts.map((post, i) => `
    <div class="post-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3>منشور ${i + 1}</h3>
        <span class="badge">${post.schedule}</span>
      </div>
      <p style="color:#4F46E5;font-weight:600;margin-bottom:6px;">${post.tov}</p>
      <p style="font-size:14px;margin-bottom:8px;">${post.caption}</p>
      <p class="meta" style="margin-bottom:4px;"><strong>المشهد:</strong> ${post.scenario}</p>
      <div style="margin-top:8px;">${post.hashtags.split(/\s+/).map(h => `<span class="tag">${h}</span>`).join('')}</div>
    </div>
  `).join('');

  return wrapInHtml('خطة الحملة', `
    <h1>خطة الحملة التسويقية</h1>
    <p class="subtitle">${title || 'حملة من 9 منشورات'} — ${new Date().toLocaleDateString('ar-SA')}</p>
    ${postCards}
  `);
}

export function generateAnalysisPdf(analysis: AnalysisData, businessName?: string): string {
  const swotHtml = analysis.swot ? `
    <h2>تحليل SWOT</h2>
    <div class="swot-grid">
      <div class="swot-box swot-s"><h3>نقاط القوة</h3><ul>${analysis.swot.strengths.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="swot-box swot-w"><h3>نقاط الضعف</h3><ul>${analysis.swot.weaknesses.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="swot-box swot-o"><h3>الفرص</h3><ul>${analysis.swot.opportunities.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="swot-box swot-t"><h3>التهديدات</h3><ul>${analysis.swot.threats.map(s => `<li>${s}</li>`).join('')}</ul></div>
    </div>` : '';

  const personasHtml = analysis.personas ? `
    <h2>شخصيات المشتري</h2>
    <div class="grid-3">${analysis.personas.map(p => `
      <div class="card"><h3>${p.name} — ${p.age}</h3><p class="meta">${p.role}</p>
      <p style="font-size:13px;margin-top:8px;"><strong>الأهداف:</strong> ${p.goals}</p>
      <p style="font-size:13px;"><strong>التحديات:</strong> ${p.pain_points}</p></div>
    `).join('')}</div>` : '';

  const roadmapHtml = analysis.roadmap ? `
    <h2>خارطة الطريق</h2>
    <div class="grid-3">
      <div class="card"><h3>30 يوم</h3><ul>${analysis.roadmap.day_30.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="card"><h3>60 يوم</h3><ul>${analysis.roadmap.day_60.map(s => `<li>${s}</li>`).join('')}</ul></div>
      <div class="card"><h3>90 يوم</h3><ul>${analysis.roadmap.day_90.map(s => `<li>${s}</li>`).join('')}</ul></div>
    </div>` : '';

  const kpisHtml = analysis.kpis ? `
    <h2>مؤشرات الأداء</h2>
    <div class="grid-2">${analysis.kpis.map(k => `
      <div class="card" style="text-align:center;"><p style="font-size:24px;font-weight:bold;color:#6366F1;">${k.target}</p>
      <p style="font-size:13px;font-weight:600;">${k.metric}</p><p class="meta">${k.timeframe}</p></div>
    `).join('')}</div>` : '';

  return wrapInHtml('التحليل التسويقي', `
    <h1>التحليل التسويقي${businessName ? ` — ${businessName}` : ''}</h1>
    <p class="subtitle">تحليل شامل CMO-level — ${new Date().toLocaleDateString('ar-SA')}</p>
    ${swotHtml}${personasHtml}${roadmapHtml}${kpisHtml}
  `);
}

export function generateStoryboardPdf(scenes: StoryboardScene[], concept?: string): string {
  const sceneCards = scenes.map(s => `
    <div class="scene-card" style="display:grid;grid-template-columns:80px 1fr;gap:12px;">
      <div style="background:#F1F5F9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;">🎬</div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-weight:600;">Scene ${s.scene_number}</span>
          <span class="badge">${s.duration_seconds}s — ${s.mood}</span>
        </div>
        <p style="font-size:12px;color:#64748B;margin-bottom:4px;" dir="ltr">${s.visual_description}</p>
        <p style="font-size:14px;font-weight:500;margin-bottom:4px;">${s.dialogue}</p>
        <div><span class="tag">📷 ${s.camera_angle}</span><span class="tag">🎥 ${s.camera_movement}</span></div>
      </div>
    </div>
  `).join('');

  return wrapInHtml('ستوري بورد', `
    <h1>ستوري بورد الفيديو</h1>
    <p class="subtitle">${concept || 'فيديو تسويقي'} — ${new Date().toLocaleDateString('ar-SA')}</p>
    <div style="display:grid;gap:12px;">${sceneCards}</div>
  `);
}

export function openPdfInNewTab(html: string): void {
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }
}
