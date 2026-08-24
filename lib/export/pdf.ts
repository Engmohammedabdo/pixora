/**
 * PDF generation utilities using browser-native approach.
 * Generates HTML content that can be printed to PDF via window.print()
 * or converted server-side with a headless browser later.
 */

/*
 * Everything in this file renders MODEL OUTPUT. The studio routes now validate
 * the shape before they finalize, but rows written before that guard existed
 * are still restored out of `generations.output` by RecentWork and handed
 * straight back here — so nothing below may assume a field is present, and
 * every field is typed optional to force that at compile time.
 *
 * `txt()` also ESCAPES, because these strings are interpolated into markup that
 * goes to `document.write`: an unescaped `<` in a caption the model wrote is
 * markup, not text.
 */

/** Coerce a model-supplied value to printable text WITHOUT escaping. Only for
 *  values that are about to be split/inspected before being escaped. */
function plain(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function txt(value: unknown): string {
  return plain(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A list the document iterates over. A missing key must cost one empty
 *  section, never the whole export. */
function list<T>(value: readonly T[] | undefined | null): readonly T[] {
  return Array.isArray(value) ? value : [];
}

/** Is there anything under this key worth printing a heading over?
 *
 *  Presence is no longer the question. The studio schemas default every array
 *  the model omitted to `[]` and every field to `''`, so the key now EXISTS on
 *  sections the model never produced — and gating on `analysis.personas ?`
 *  printed "شخصيات المشتري" above an empty grid. */
function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasContent);
  if (value !== null && typeof value === 'object') return Object.values(value).some(hasContent);
  return plain(value).trim().length > 0;
}

interface CampaignPost {
  scenario?: string | null;
  caption?: string | null;
  tov?: string | null;
  schedule?: string | null;
  hashtags?: string | null;
  imageUrl?: string | null;
}

interface AnalysisData {
  swot?: { strengths?: string[]; weaknesses?: string[]; opportunities?: string[]; threats?: string[] } | null;
  personas?: { name?: string; age?: string; role?: string; goals?: string; pain_points?: string }[] | null;
  competitors?: { name?: string; strengths?: string; weaknesses?: string; market_share?: string }[] | null;
  usp?: { statement?: string; positioning?: string; differentiators?: string[] } | null;
  roadmap?: { day_30?: string[]; day_60?: string[]; day_90?: string[] } | null;
  kpis?: { metric?: string; target?: string; timeframe?: string }[] | null;
}

interface StoryboardScene {
  scene_number?: number;
  visual_description?: string;
  dialogue?: string;
  camera_angle?: string;
  camera_movement?: string;
  duration_seconds?: number;
  mood?: string;
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
  const postCards = list(posts).map((post, i) => `
    <div class="post-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3>منشور ${i + 1}</h3>
        <span class="badge">${txt(post.schedule)}</span>
      </div>
      <p style="color:#4F46E5;font-weight:600;margin-bottom:6px;">${txt(post.tov)}</p>
      <p style="font-size:14px;margin-bottom:8px;">${txt(post.caption)}</p>
      <p class="meta" style="margin-bottom:4px;"><strong>المشهد:</strong> ${txt(post.scenario)}</p>
      <div style="margin-top:8px;">${plain(post.hashtags).split(/\s+/).filter(Boolean).map(h => `<span class="tag">${txt(h)}</span>`).join('')}</div>
    </div>
  `).join('');

  return wrapInHtml('خطة الحملة', `
    <h1>خطة الحملة التسويقية</h1>
    <p class="subtitle">${txt(title) || 'حملة من 9 منشورات'} — ${new Date().toLocaleDateString('ar-SA')}</p>
    ${postCards}
  `);
}

export function generateAnalysisPdf(analysis: AnalysisData, businessName?: string): string {
  const swotHtml = analysis.swot && hasContent(analysis.swot) ? `
    <h2>تحليل SWOT</h2>
    <div class="swot-grid">
      <div class="swot-box swot-s"><h3>نقاط القوة</h3><ul>${list(analysis.swot.strengths).map(s => `<li>${txt(s)}</li>`).join('')}</ul></div>
      <div class="swot-box swot-w"><h3>نقاط الضعف</h3><ul>${list(analysis.swot.weaknesses).map(s => `<li>${txt(s)}</li>`).join('')}</ul></div>
      <div class="swot-box swot-o"><h3>الفرص</h3><ul>${list(analysis.swot.opportunities).map(s => `<li>${txt(s)}</li>`).join('')}</ul></div>
      <div class="swot-box swot-t"><h3>التهديدات</h3><ul>${list(analysis.swot.threats).map(s => `<li>${txt(s)}</li>`).join('')}</ul></div>
    </div>` : '';

  const personasHtml = hasContent(analysis.personas) ? `
    <h2>شخصيات المشتري</h2>
    <div class="grid-3">${list(analysis.personas).map(p => `
      <div class="card"><h3>${txt(p.name)} — ${txt(p.age)}</h3><p class="meta">${txt(p.role)}</p>
      <p style="font-size:13px;margin-top:8px;"><strong>الأهداف:</strong> ${txt(p.goals)}</p>
      <p style="font-size:13px;"><strong>التحديات:</strong> ${txt(p.pain_points)}</p></div>
    `).join('')}</div>` : '';

  const roadmapHtml = analysis.roadmap && hasContent(analysis.roadmap) ? `
    <h2>خارطة الطريق</h2>
    <div class="grid-3">
      <div class="card"><h3>30 يوم</h3><ul>${list(analysis.roadmap.day_30).map(s => `<li>${txt(s)}</li>`).join('')}</ul></div>
      <div class="card"><h3>60 يوم</h3><ul>${list(analysis.roadmap.day_60).map(s => `<li>${txt(s)}</li>`).join('')}</ul></div>
      <div class="card"><h3>90 يوم</h3><ul>${list(analysis.roadmap.day_90).map(s => `<li>${txt(s)}</li>`).join('')}</ul></div>
    </div>` : '';

  // The section the studio is NAMED for. `competitors` was declared on
  // AnalysisData and rendered nowhere, so تحليل المنافسين exported a PDF with no
  // competitors in it — while the tab beside it showed them on screen. Placed
  // first for the same reason.
  const competitorsHtml = hasContent(analysis.competitors) ? `
    <h2>المنافسون</h2>
    <div class="grid-2">${list(analysis.competitors).map(c => `
      <div class="card"><h3>${txt(c.name)}</h3><p class="meta">${txt(c.market_share)}</p>
      <p style="font-size:13px;margin-top:8px;"><strong>نقاط القوة:</strong> ${txt(c.strengths)}</p>
      <p style="font-size:13px;"><strong>نقاط الضعف:</strong> ${txt(c.weaknesses)}</p></div>
    `).join('')}</div>` : '';

  const kpisHtml = hasContent(analysis.kpis) ? `
    <h2>مؤشرات الأداء</h2>
    <div class="grid-2">${list(analysis.kpis).map(k => `
      <div class="card" style="text-align:center;"><p style="font-size:24px;font-weight:bold;color:#6366F1;">${txt(k.target)}</p>
      <p style="font-size:13px;font-weight:600;">${txt(k.metric)}</p><p class="meta">${txt(k.timeframe)}</p></div>
    `).join('')}</div>` : '';

  return wrapInHtml('التحليل التسويقي', `
    <h1>التحليل التسويقي${businessName ? ` — ${txt(businessName)}` : ''}</h1>
    <p class="subtitle">تحليل شامل CMO-level — ${new Date().toLocaleDateString('ar-SA')}</p>
    ${competitorsHtml}${swotHtml}${personasHtml}${roadmapHtml}${kpisHtml}
  `);
}

interface PlanData {
  objectives?: { goal?: string; kpi?: string; target?: string }[] | null;
  channels?: { name?: string; budget_pct?: number; strategy?: string }[] | null;
  calendar?: { week?: number; content?: string[]; channel?: string }[] | null;
  budget?: { total?: string; breakdown?: { item?: string; amount?: string; pct?: number }[] } | null;
}

/**
 * A marketing plan as a PDF.
 *
 * The plan studio had NO export at all — a 5-credit deliverable that could be read
 * on screen and nowhere else, while analysis and storyboard both exported. The four
 * sections below are exactly the four tabs the page renders; `kpis` is deliberately
 * absent, because exporting a section the screen does not show is the same defect as
 * the competitors section above in reverse.
 */
export function generatePlanPdf(plan: PlanData, businessName?: string): string {
  const objectivesHtml = hasContent(plan.objectives) ? `
    <h2>الأهداف</h2>
    <div class="grid-2">${list(plan.objectives).map(o => `
      <div class="card"><h3>${txt(o.goal)}</h3>
      <p style="font-size:13px;margin-top:8px;"><strong>المؤشر:</strong> ${txt(o.kpi)}</p>
      <p class="meta">${txt(o.target)}</p></div>
    `).join('')}</div>` : '';

  const channelsHtml = hasContent(plan.channels) ? `
    <h2>القنوات</h2>
    <div class="grid-2">${list(plan.channels).map(c => `
      <div class="card"><h3>${txt(c.name)} — ${txt(c.budget_pct)}%</h3>
      <p style="font-size:13px;margin-top:8px;">${txt(c.strategy)}</p></div>
    `).join('')}</div>` : '';

  const calendarHtml = hasContent(plan.calendar) ? `
    <h2>التقويم</h2>
    ${list(plan.calendar).map(w => `
      <div class="card" style="margin-bottom:10px;"><h3>الأسبوع ${txt(w.week)} — ${txt(w.channel)}</h3>
      <ul>${list(w.content).map(c => `<li>${txt(c)}</li>`).join('')}</ul></div>
    `).join('')}` : '';

  const budgetHtml = plan.budget && hasContent(plan.budget) ? `
    <h2>الميزانية</h2>
    <div class="card" style="text-align:center;"><p style="font-size:24px;font-weight:bold;color:#6366F1;">${txt(plan.budget.total)}</p>
    <p class="meta">إجمالي الميزانية</p></div>
    <div class="grid-2" style="margin-top:10px;">${list(plan.budget.breakdown).map(b => `
      <div class="card"><h3>${txt(b.item)}</h3><p class="meta">${txt(b.amount)} — ${txt(b.pct)}%</p></div>
    `).join('')}</div>` : '';

  return wrapInHtml('الخطة التسويقية', `
    <h1>الخطة التسويقية${businessName ? ` — ${txt(businessName)}` : ''}</h1>
    <p class="subtitle">خطة تسويقية شاملة — ${new Date().toLocaleDateString('ar-SA')}</p>
    ${objectivesHtml}${channelsHtml}${calendarHtml}${budgetHtml}
  `);
}

export function generateStoryboardPdf(scenes: StoryboardScene[], concept?: string): string {
  const sceneCards = list(scenes).map((s, i) => `
    <div class="scene-card" style="display:grid;grid-template-columns:80px 1fr;gap:12px;">
      <div style="background:#F1F5F9;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:24px;">🎬</div>
      <div>
        <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
          <span style="font-weight:600;">Scene ${txt(s.scene_number) || i + 1}</span>
          <span class="badge">${txt(s.duration_seconds)}s — ${txt(s.mood)}</span>
        </div>
        <p style="font-size:12px;color:#64748B;margin-bottom:4px;" dir="ltr">${txt(s.visual_description)}</p>
        <p style="font-size:14px;font-weight:500;margin-bottom:4px;">${txt(s.dialogue)}</p>
        <div><span class="tag">📷 ${txt(s.camera_angle)}</span><span class="tag">🎥 ${txt(s.camera_movement)}</span></div>
      </div>
    </div>
  `).join('');

  return wrapInHtml('ستوري بورد', `
    <h1>ستوري بورد الفيديو</h1>
    <p class="subtitle">${txt(concept) || 'فيديو تسويقي'} — ${new Date().toLocaleDateString('ar-SA')}</p>
    <div style="display:grid;gap:12px;">${sceneCards}</div>
  `);
}

/**
 * Opens the generated document in a new tab and asks the browser to print it.
 *
 * Returns FALSE when the tab could not be opened, so the caller can say so.
 * `window.open` returning null is the normal case here, not the exotic one: an
 * in-app webview (Instagram / WhatsApp open every link in one, and that is how
 * most of this market arrives), iOS Safari with its default "Block Pop-ups",
 * or any desktop popup blocker all return null. This used to be an `if (win)`
 * with no else — the button simply did nothing, forever, with nothing on screen.
 */
export function openPdfInNewTab(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  try {
    win.document.write(html);
    win.document.close();
  } catch {
    // A webview can hand back a window it then refuses to let us write to.
    return false;
  }
  // Half a second is long enough for the user to close the tab, and print() on
  // a closed window throws — which would surface as an unhandled rejection in a
  // timer, far away from anything that could report it.
  setTimeout(() => {
    if (!win.closed) win.print();
  }, 500);
  return true;
}
