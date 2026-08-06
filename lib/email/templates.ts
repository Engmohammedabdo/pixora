/**
 * Email HTML, written for email clients rather than browsers.
 *
 * Constraints that shape everything here — none of them are stylistic preferences:
 *  - Tables for layout. Outlook renders through Word, which has no flexbox or grid.
 *  - Every style inline. Gmail strips <style> blocks from forwarded mail.
 *  - No web fonts, no external images, no JS. Blocked or stripped nearly everywhere.
 *  - `dir="rtl"` on the html element for Arabic, not a CSS class — Arabic mail that
 *    renders left-to-right reads as broken, and this is the first thing a Gulf
 *    customer will see from the product.
 *  - A plain-text alternative for every message. HTML-only mail scores as spam.
 */

const BRAND = '#4F46E5';
const TEXT = '#1F2937';
const MUTED = '#6B7280';
const BORDER = '#E5E7EB';

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

type Locale = 'ar' | 'en';

interface LayoutInput {
  locale: Locale;
  /** Shown large at the top. */
  heading: string;
  /** One paragraph per entry. */
  paragraphs: string[];
  cta?: { label: string; url: string };
  /** Small print under the divider. */
  footnote?: string;
}

function layout({ locale, heading, paragraphs, cta, footnote }: LayoutInput): string {
  const isAr = locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const align = isAr ? 'right' : 'left';
  const font = isAr
    ? "'Segoe UI', Tahoma, Arial, sans-serif"
    : "-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

  const body = paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.75;color:${TEXT};">${p}</p>`
    )
    .join('');

  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
         <tr><td style="border-radius:8px;background:${BRAND};">
           <a href="${cta.url}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${cta.label}</a>
         </td></tr>
       </table>`
    : '';

  const foot = footnote
    ? `<hr style="border:none;border-top:1px solid ${BORDER};margin:28px 0 16px;" />
       <p style="margin:0;font-size:13px;line-height:1.7;color:${MUTED};">${footnote}</p>`
    : '';

  return `<!doctype html>
<html dir="${dir}" lang="${locale}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#F9FAFB;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F9FAFB;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid ${BORDER};border-radius:12px;">
        <tr><td style="padding:32px;text-align:${align};direction:${dir};font-family:${font};">
          <p style="margin:0 0 24px;font-size:18px;font-weight:700;color:${BRAND};">PyraSuite 🦊</p>
          <h1 style="margin:0 0 16px;font-size:20px;line-height:1.5;font-weight:700;color:${TEXT};">${heading}</h1>
          ${body}
          ${button}
          ${foot}
        </td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:${MUTED};font-family:${font};direction:${dir};">
        ${isAr ? 'وصلتك الرسالة دي لأن عندك حساب على PyraSuite.' : 'You received this because you have a PyraSuite account.'}
      </p>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Strip tags for the plain-text alternative. */
function toText(paragraphs: string[], cta?: { label: string; url: string }, footnote?: string): string {
  const lines = paragraphs.map((p) => p.replace(/<[^>]+>/g, ''));
  if (cta) lines.push('', `${cta.label}: ${cta.url}`);
  if (footnote) lines.push('', footnote.replace(/<[^>]+>/g, ''));
  return `PyraSuite\n\n${lines.join('\n\n')}\n`;
}

// ───────────────────────────────────────────────────────────────────────────
// Payment failed
//
// The one email in this product that recovers revenue. Involuntary churn — an
// expired card, a bank decline — is the cheapest churn there is to prevent,
// because the customer still wants the product. The tone is deliberately not
// alarming: nothing has been taken away yet.
// ───────────────────────────────────────────────────────────────────────────

export function paymentFailedEmail(locale: Locale, planName: string, portalUrl: string): EmailContent {
  if (locale === 'ar') {
    const paragraphs = [
      `حاولنا نسحب اشتراك <strong>${planName}</strong> بس البنك رفض العملية.`,
      'مفيش حاجة اتلغت — رصيدك وشغلك زي ما هما. بس محتاجين تحدّث طريقة الدفع عشان الاشتراك يكمل.',
      'أغلب الأسباب بسيطة: كارت منتهي، أو حد للمشتريات الأونلاين، أو رصيد مش كفاية وقت المحاولة.',
    ];
    const cta = { label: 'حدّث طريقة الدفع', url: portalUrl };
    const footnote = 'هنحاول تاني تلقائياً على مدى الأيام الجاية. لو حدّثت الكارت، اعتبر الرسالة دي ملغية.';
    return {
      subject: 'محتاجين تحدّث طريقة الدفع — PyraSuite',
      html: layout({ locale, heading: 'الدفع ماتمّش', paragraphs, cta, footnote }),
      text: toText(paragraphs, cta, footnote),
    };
  }

  const paragraphs = [
    `We tried to charge your <strong>${planName}</strong> subscription and your bank declined it.`,
    'Nothing has been cancelled — your credits and your work are untouched. We just need an updated payment method to keep the subscription running.',
    'It is usually something small: an expired card, an online-purchase limit, or insufficient funds at the moment we tried.',
  ];
  const cta = { label: 'Update payment method', url: portalUrl };
  const footnote = 'We will retry automatically over the next few days. If you have already updated your card, you can ignore this.';
  return {
    subject: 'Update your payment method — PyraSuite',
    html: layout({ locale, heading: 'Your payment did not go through', paragraphs, cta, footnote }),
    text: toText(paragraphs, cta, footnote),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Waitlist confirmation
//
// Promises nothing the product cannot do yet — no launch date, no pricing, no
// feature claims. The waitlist page holds the same line.
// ───────────────────────────────────────────────────────────────────────────

export function waitlistWelcomeEmail(locale: Locale, name?: string | null): EmailContent {
  if (locale === 'ar') {
    const greeting = name ? `أهلاً ${escapeHtml(name)} 👋` : 'أهلاً 👋';
    const paragraphs = [
      'سجّلناك في قائمة انتظار PyraSuite.',
      'PyraSuite بتحوّل فكرتك لحملة تسويقية كاملة — صور، نصوص، خطة — بقوة بايرا 🦊.',
      'هنبعتلك أول ما نفتح الأبواب. مش هنبعت حاجة تانية.',
    ];
    const footnote = 'لو مش انت اللي سجّلت، تجاهل الرسالة ومش هيوصلك حاجة تانية.';
    return {
      subject: 'سجّلناك في قائمة الانتظار 🦊',
      html: layout({ locale, heading: greeting, paragraphs, footnote }),
      text: toText([greeting, ...paragraphs], undefined, footnote),
    };
  }

  const greeting = name ? `Hi ${escapeHtml(name)} 👋` : 'Hi 👋';
  const paragraphs = [
    "You're on the PyraSuite waitlist.",
    'PyraSuite turns an idea into a complete marketing campaign — images, copy, and a plan — powered by Pyra 🦊.',
    "We'll email you the moment we open up. Nothing else.",
  ];
  const footnote = "If this wasn't you, ignore this email and you won't hear from us again.";
  return {
    subject: "You're on the PyraSuite waitlist 🦊",
    html: layout({ locale, heading: greeting, paragraphs, footnote }),
    text: toText([greeting, ...paragraphs], undefined, footnote),
  };
}

/**
 * A name comes from a public, unauthenticated form. Interpolated raw it would be
 * stored HTML injected into an email — which renders in some clients and, worse,
 * lets the sender forge content that appears to come from us.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
