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
 *
 * The Arabic is clear professional Arabic, not Egyptian or Gulf colloquial —
 * the founder's rule for the whole product. Until 2026-09-11 these templates
 * still spoke Egyptian (مفيش، عشان، دلوقتي، بتاعتك) after the site had been
 * rewritten. An email outlives the page that sent it, and a payment-failure or
 * password message in a dialect the reader does not speak reads as a scam. No
 * gate scans this file: test:one-dialect reads messages/ar.json and never lib/. The
 * vocabulary follows the product's own: كلمة المرور, بوست, كريدت.
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
  /**
   * The grey line under the card that says why this message arrived.
   *
   * It defaults to "you have an account", which is true of exactly one of the
   * messages here. A waitlist subscriber and an invitee do NOT have accounts —
   * telling them they do is both wrong and, for someone who never signed up for
   * anything, the sentence that makes the message read as spam. Each template
   * states its own reason.
   */
  reason?: string;
}

function layout({ locale, heading, paragraphs, cta, footnote, reason }: LayoutInput): string {
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
        ${reason ?? (isAr ? 'وصلتك هذه الرسالة لأن لديك حساباً على PyraSuite.' : 'You received this because you have a PyraSuite account.')}
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
      `حاولنا تحصيل رسوم اشتراك <strong>${planName}</strong>، لكن البنك رفض العملية.`,
      'لم يُلغَ أي شيء — رصيدك وأعمالك كما هي. نحتاج فقط إلى تحديث طريقة الدفع لكي يستمر اشتراكك.',
      'غالباً ما يكون السبب بسيطاً: بطاقة منتهية الصلاحية، أو حدّ للمشتريات عبر الإنترنت، أو رصيد غير كافٍ وقت المحاولة.',
    ];
    const cta = { label: 'حدّث طريقة الدفع', url: portalUrl };
    const footnote = 'سنعيد المحاولة تلقائياً خلال الأيام القادمة. إذا كنت قد حدّثت بطاقتك، فيمكنك تجاهل هذه الرسالة.';
    return {
      subject: 'يرجى تحديث طريقة الدفع — PyraSuite',
      html: layout({ locale, heading: 'لم تكتمل عملية الدفع', paragraphs, cta, footnote }),
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
      'تم تسجيلك في قائمة انتظار PyraSuite.',
      'تحوّل PyraSuite فكرتك إلى حملة تسويقية كاملة — صور ونصوص وخطة — بقوة بايرا 🦊.',
      'سنراسلك فور فتح الأبواب، ولن نرسل إليك أي شيء آخر.',
    ];
    const footnote = 'إذا لم تكن أنت من سجّل، فتجاهل هذه الرسالة ولن يصلك منّا شيء بعد ذلك.';
    return {
      subject: 'تم تسجيلك في قائمة الانتظار 🦊',
      html: layout({
        locale, heading: greeting, paragraphs, footnote,
        reason: 'وصلتك هذه الرسالة لأنك سجّلت في قائمة انتظار PyraSuite.',
      }),
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
    html: layout({
      locale, heading: greeting, paragraphs, footnote,
      reason: 'You received this because you joined the PyraSuite waitlist.',
    }),
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

// ───────────────────────────────────────────────────────────────────────────
// Password reset
//
// Sent by THIS app, not by Supabase Auth. Auth email is configured on a
// different service in Coolify and never was, so `resetPasswordForEmail()` had
// no transport — a customer who forgot their password had no way back into a
// paid account. Routing it through the mail server the app already uses means
// one SMTP configuration instead of two, and an Arabic-first message instead of
// GoTrue's English default template.
//
// The link is a bearer credential: anyone holding it can set the password. So
// the copy says what to do if the request was not theirs, and says nothing
// about whether an account exists — this email is only ever sent to an address
// that has one, and the HTTP response never differs either way.
// ───────────────────────────────────────────────────────────────────────────

export function passwordResetEmail(locale: Locale, resetUrl: string): EmailContent {
  if (locale === 'ar') {
    const paragraphs = [
      'وصلنا طلب لتغيير كلمة المرور الخاصة بحسابك في PyraSuite.',
      'اضغط على الزر أدناه لتعيين كلمة مرور جديدة مباشرةً. الرابط صالح لفترة قصيرة ولمرة واحدة فقط.',
    ];
    const cta = { label: 'اختر كلمة مرور جديدة', url: resetUrl };
    const footnote =
      'إذا لم تطلب ذلك، فتجاهل هذه الرسالة — لم تتغير كلمة المرور الخاصة بك، ولا يستطيع أحد تغييرها دون هذا الرابط.';
    return {
      subject: 'تغيير كلمة المرور — PyraSuite',
      html: layout({ locale, heading: 'كلمة مرور جديدة', paragraphs, cta, footnote }),
      text: toText(paragraphs, cta, footnote),
    };
  }

  const paragraphs = [
    'We received a request to change the password on your PyraSuite account.',
    'Use the button below to set a new one. The link is short-lived and works once.',
  ];
  const cta = { label: 'Choose a new password', url: resetUrl };
  const footnote =
    'If this was not you, ignore this email — your password has not changed, and nobody can change it without this link.';
  return {
    subject: 'Reset your password — PyraSuite',
    html: layout({ locale, heading: 'Set a new password', paragraphs, cta, footnote }),
    text: toText(paragraphs, cta, footnote),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Invite
//
// The message the whole invite-only launch runs on. Before it existed, the
// admin panel could mint a token and show the founder a link — and that was the
// end of the automation. Inviting thirty people meant composing thirty messages
// by hand, which is how a cohort of thirty becomes a cohort of the five you had
// the patience for.
//
// Three things about the copy are deliberate:
//
//  - **It names the credits.** The gate grants `beta_credits` on redemption
//    (migration 035). An invite that does not say what is waiting reads as a
//    request for the recipient's time; one that does reads as a gift.
//  - **It says the link is personal and single-use.** It is: the token is bound
//    to this address, `issue_invite` refuses to re-mint a redeemed one, and the
//    BEFORE INSERT trigger checks address and token together. Someone who
//    forwards it to a friend gives away their own seat and the friend gets
//    nothing — worth one sentence to prevent.
//  - **It does not promise a deadline.** Invite tokens have no expiry in the
//    schema. Writing "expires in 7 days" would be a lie the database does not
//    enforce, and the first person to try it on day 8 finds out.
// ───────────────────────────────────────────────────────────────────────────

export function inviteEmail(locale: Locale, inviteUrl: string, credits: number): EmailContent {
  if (locale === 'ar') {
    const paragraphs = [
      'حان دورك 🎉 — أصبح PyraSuite متاحاً لك الآن.',
      'تحوّل PyraSuite فكرتك إلى حملة تسويقية كاملة: صور منتجات، وبوستات، وتعليق صوتي، وخطة تسويق — كلها بقوة بايرا 🦊.',
      credits > 0
        ? `سيُفتح حسابك وفيه <strong>${credits} كريدت</strong> هدية، لتجرّب المنصة دون أن تدفع شيئاً.`
        : 'اضغط على الزر أدناه وابدأ مباشرةً.',
    ];
    const cta = { label: 'أنشئ حسابك الآن', url: inviteUrl };
    const footnote =
      'هذا الرابط مخصّص لبريدك الإلكتروني ويعمل مرة واحدة فقط. إذا أرسلته إلى شخص آخر، فلن يتمكن من استخدامه وستفقد مكانك.';
    return {
      subject: 'دعوتك إلى PyraSuite جاهزة 🦊',
      html: layout({
        locale, heading: 'أهلاً بك في PyraSuite', paragraphs, cta, footnote,
        reason: 'وصلتك هذه الرسالة لأنك في قائمة انتظار PyraSuite وقد حان دورك.',
      }),
      text: toText(paragraphs, cta, footnote),
    };
  }

  const paragraphs = [
    "You're in 🎉 — your PyraSuite invite is ready.",
    'PyraSuite turns an idea into a complete marketing campaign: product shots, social posts, voiceover, and a plan — all powered by Pyra 🦊.',
    credits > 0
      ? `Your account opens with <strong>${credits} free credits</strong> so you can try it without paying anything.`
      : 'Use the button below to get started.',
  ];
  const cta = { label: 'Create your account', url: inviteUrl };
  const footnote =
    'This link is tied to your email address and works once. Forwarding it means nobody can use it — including you.';
  return {
    subject: 'Your PyraSuite invite is ready 🦊',
    html: layout({
      locale, heading: 'Welcome to PyraSuite', paragraphs, cta, footnote,
      reason: "You received this because you're on the PyraSuite waitlist and your turn came up.",
    }),
    text: toText(paragraphs, cta, footnote),
  };
}
