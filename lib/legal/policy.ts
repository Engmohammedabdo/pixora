/**
 * The privacy policy and terms of use, in both locales.
 *
 * ── WHY THIS IS NOT IN messages/{ar,en}.json ────────────────────────────────
 * This is a DELIBERATE exception to the repo's i18n convention, not an
 * oversight. Three reasons, in order of weight:
 *
 * 1. These are long-form legal documents, not UI strings. A UI string is a
 *    label whose meaning is carried by the screen around it; a legal clause
 *    carries its meaning alone and is read as a whole. Splitting one across
 *    dotted keys (`privacy.sections.cookies.body.3`) destroys the only thing
 *    that matters about it — the order and completeness of the prose.
 * 2. They must be versioned and diffable AS PROSE. When an ad reviewer, a
 *    customer or a lawyer asks "what did the policy say on the day I signed
 *    up", the answer has to be readable in `git log -p` on one file. JSON
 *    escaping, key reordering and a 1200-line diff context make that
 *    unreadable in practice.
 * 3. messages/*.json is already ~1200 lines of UI copy per locale. Dropping
 *    ~120 multi-paragraph legal strings into it makes BOTH unreviewable: the
 *    legal text is unreadable among the button labels, and a genuine UI
 *    translation regression hides in the noise.
 *
 * The i18n rule still holds for everything else, and the property this module
 * has to keep is the one that rule exists to protect: `ar` and `en` are
 * structurally identical — same document ids, same section count, same order —
 * so /en can never silently fall back to Arabic prose the reader cannot read.
 * That is exactly the defect this module was written to fix: both pages were
 * hardcoded Arabic, so /en/privacy and /en/terms served Arabic to an English
 * visitor and to every English-language ad reviewer who opened them.
 *
 * ── WHAT THE CONTENT HAS TO DO ──────────────────────────────────────────────
 * Meta and Google both FETCH AND READ the privacy policy on the landing domain
 * during a paid-campaign review. The previous policy had five sections and no
 * mention of cookies, pixels, analytics or advertising measurement at all —
 * while app/[locale]/layout.tsx mounts GoogleAnalytics, MetaPixel and
 * PageViewTracker on every landing view and the pixel plants `_fbp`/`_fbc`.
 * Undisclosed live tracking is what a manual reviewer looks for, and the
 * penalty is a domain or ad-account flag, not a rejected ad. The measurement
 * section therefore names the tools BY NAME (Google Analytics, Meta Pixel,
 * Meta Conversions API, Stripe) and is explicit that some measurement happens
 * server-side, because that is the part a reviewer cannot verify from the page
 * source and the part a customer cannot opt out of from their browser alone.
 *
 * ── THE ONE PRODUCT RULE THAT CONSTRAINS THIS FILE ──────────────────────────
 * CLAUDE.md: user-facing copy never names the AI models. The engine is
 * "بايرا" / "Pyra AI". Google, Meta and Stripe ARE named — they are data
 * processors, and naming them is the entire point of the disclosure. The AI
 * infrastructure providers are disclosed by FUNCTION ("the providers the Pyra
 * AI engine runs on") so the customer learns their prompt leaves our servers
 * without the copy turning into a model list.
 *
 * Every factual claim here was checked against the code, not assumed:
 * card data never reaches our servers (lib/stripe), RLS is on every public
 * table (30+ migrations), self-service deletion does NOT exist (there is no
 * delete route and no danger zone in the settings page) — so the policy
 * promises deletion ON REQUEST via /contact rather than repeating the old
 * page's false claim that you can delete your account from settings.
 */

export type LegalLocale = 'ar' | 'en';
export type LegalDocId = 'privacy' | 'terms';

export interface LegalSection {
  /** Rendered as the card title. Numbered in the source so the two locales
   *  cannot drift out of order without it being obvious in review. */
  heading: string;
  /** One string per paragraph. Never markdown — the page renders these as
   *  plain <p> elements, so any markup here would ship as literal characters. */
  body: string[];
}

export interface LegalDoc {
  title: string;
  /** One-paragraph statement of what the document covers, above the cards. */
  intro: string;
  /** Display string, already localized. Not a Date: the `no-hardcoded-date-locale`
   *  rule exists because formatting a Date per-locale at render time is how a
   *  page ends up showing Gregorian month names in Arabic. */
  updated: string;
  sections: LegalSection[];
  /** The trailing "how to reach us" line, rendered with a real link to /contact. */
  contact: { note: string; linkLabel: string };
}

const AR_UPDATED = '29 أغسطس 2026';
const EN_UPDATED = '29 August 2026';

const AR_PRIVACY: LegalDoc = {
  title: 'سياسة الخصوصية',
  intro:
    'توضّح هذه السياسة البيانات التي تجمعها منصة PyraSuite، وكيف نستخدمها، ومع من نشاركها، والخيارات المتاحة لك للتحكم فيها. وهي تنطبق على موقعنا وعلى جميع خدمات المنصة.',
  updated: AR_UPDATED,
  sections: [
    {
      heading: '1. البيانات التي نجمعها',
      body: [
        'بيانات الحساب: الاسم والبريد الإلكتروني وصورة الحساب إن أضفتها، إضافة إلى خطة اشتراكك ورصيد الكريدت لديك.',
        'بيانات نشاطك التجاري: ما تُدخله بنفسك عن علامتك — الاسم والمجال والوصف والجمهور المستهدف والمدينة والموقع الإلكتروني والألوان — ونستخدمه لتوليد محتوى أقرب إلى علامتك.',
        'المحتوى الذي ترسله: النصوص والصور والملفات التي ترفعها إلى الاستوديوهات، والمخرجات التي تنتج عنها.',
        'بيانات الاستخدام: الصفحات التي تزورها، والاستوديوهات التي تستخدمها، ونتيجة كل عملية توليد وتوقيتها واستهلاكها من الكريدت.',
        'بيانات تقنية: عنوان IP ونوع المتصفح والجهاز واللغة. نستخدمها لأغراض الأمان ومنع إساءة الاستخدام وضبط معدّل الطلبات، لا لبناء ملف تعريفي عنك.',
        'بيانات الدفع: تُعالَج بالكامل لدى Stripe. لا يصل رقم بطاقتك إلى خوادمنا ولا نخزّنه؛ نحتفظ فقط بمعرّف عميلك لدى Stripe وحالة اشتراكك وسجل فواتيرك.',
      ],
    },
    {
      heading: '2. كيف نستخدم بياناتك',
      body: [
        'تشغيل الخدمة: تنفيذ طلبات التوليد، وحفظ أعمالك، وإدارة رصيد الكريدت والاشتراك.',
        'التواصل معك بشأن حسابك: تأكيدات الدفع، واستعادة كلمة المرور، وإشعارات الخدمة الأساسية.',
        'تحسين المنتج: فهم ما يستخدمه العملاء فعلياً وأين يتعثّرون، ومعالجة الأعطال.',
        'قياس نتائج حملاتنا الإعلانية ومعرفة القنوات التي تجلب مشتركين حقيقيين.',
        'حماية المنصة: كشف الاحتيال وإساءة استخدام نظام الكريدت، وحماية الحسابات من محاولات الدخول غير المصرّح بها.',
        'لا نبيع بياناتك الشخصية ولا نؤجّرها، ولا نشاركها مع وسطاء بيانات أو معلنين خارجيين لأغراضهم الخاصة.',
      ],
    },
    {
      heading: '3. ملفات تعريف الارتباط وأدوات القياس',
      body: [
        'ملفات ضرورية لتشغيل الموقع: تحفظ جلسة الدخول وتُبقيك مسجّلاً في حسابك، وتحمي النماذج من إساءة الاستخدام. لا يمكن تعطيلها من داخل المنصة لأنها شرط لتسجيل الدخول نفسه.',
        'تحليلات الاستخدام: نستخدم Google Analytics 4 لقياس الزيارات والصفحات ومصادر الوصول. يضع ملفات باسم ‎_ga‎ و‎_ga_*‎ تحمل معرّفاً عشوائياً للمتصفح، لا اسمك ولا بريدك.',
        'قياس الإعلانات: نستخدم Meta Pixel (بكسل ميتا) لقياس نتائج إعلاناتنا على فيسبوك وإنستغرام. يضع ملفين باسم ‎_fbp‎ و‎_fbc‎، ولا يُنشأ ‎_fbc‎ إلا إذا وصلت إلى الموقع عبر نقرة على إعلان.',
        'قياس من جانب الخادم — نقولها بوضوح: جزء من القياس لا يحدث في متصفحك. عند إتمام عملية شراء أو إنشاء حساب، يرسل خادمنا الحدث مباشرة إلى Google Analytics وإلى Meta Conversions API. يحمل هذا الحدث نسخة مشفّرة تشفيراً أحادي الاتجاه (SHA-256) من بريدك الإلكتروني ومن معرّف حسابك لدينا، إضافة إلى قيمة الاشتراك ومعرّفات ملفات الارتباط أعلاه. لا نرسل بريدك بصيغته الأصلية، ولا اسمك، ولا أي جزء من المحتوى الذي تنشئه.',
        'المدفوعات: تستخدم صفحات الدفع لدى Stripe ملفات ارتباط خاصة بها لمنع الاحتيال أثناء عملية الدفع.',
        'كيف توقف التتبع: يمكنك حذف ملفات الارتباط أو حظرها من إعدادات متصفحك — مع ملاحظة أن حظر الملفات الضرورية يعطّل تسجيل الدخول. ولإيقاف تحليلات Google تحديداً، توفّر Google إضافة رسمية للمتصفح على tools.google.com/dlpage/gaoptout.',
        'وللتحكم في الإعلانات وقياسها لدى Meta، اضبط تفضيلات الإعلانات من حسابك على فيسبوك أو إنستغرام عبر accountscenter.facebook.com/ads. كما يمكنك على مستوى الجهاز إيقاف تتبّع التطبيقات في iOS أو إعادة ضبط معرّف الإعلان في أندرويد.',
        'إذا رغبت في الاعتراض على استخدام بياناتك في القياس الإعلاني من طرفنا، راسلنا وسننفّذ ذلك على حسابك.',
      ],
    },
    {
      heading: '4. مزوّدو الخدمة ونقل البيانات خارج الدولة',
      body: [
        'Stripe — معالجة المدفوعات والاشتراكات وحفظ سجلّ الفواتير.',
        'Google — قياس الزيارات عبر Google Analytics 4.',
        'Meta Platforms — قياس نتائج الإعلانات عبر Meta Pixel وواجهة Meta Conversions API.',
        'مزوّدو البنية التحتية: الاستضافة وقاعدة البيانات والتخزين، وخدمة البريد التي نرسل منها رسائل الحساب.',
        'مزوّدو البنية التحتية لنماذج الذكاء الاصطناعي التي يعمل عليها محرك بايرا: يُرسَل إليهم نص طلبك والصور المرفقة به لتنفيذ عملية التوليد فقط، ولا يُرسَل معها اسمك ولا بريدك الإلكتروني.',
        'هؤلاء المزوّدون قد يعالجون البيانات خارج دولة الإمارات، ومنها الاتحاد الأوروبي والولايات المتحدة. باستخدامك للمنصة فأنت على علم بأن بياناتك قد تُنقل وتُعالَج خارج الدولة وفق الشروط التعاقدية المبرمة مع كل مزوّد.',
      ],
    },
    {
      heading: '5. المحتوى الذي تُنشئه',
      body: [
        'المحتوى الذي تنشئه عبر المنصة — صور ونصوص وحملات وتعليق صوتي — تعود ملكيته لك.',
        'نحتفظ بنسخة منه لعرضه داخل حسابك في مكتبة ملفاتك ولتمكينك من الرجوع إليه.',
        'لا نستخدم محتواك ولا بيانات علامتك في تدريب نماذج ذكاء اصطناعي، ولا نعرضه لعملاء آخرين، ولا نبيعه.',
        'قد نطّلع على محتوى محدّد في حالات ضيّقة فقط: للرد على طلب دعم ترسله بنفسك، أو للتحقق من بلاغ إساءة استخدام، أو عند وجود إلزام قانوني.',
      ],
    },
    {
      heading: '6. مدة الاحتفاظ بالبيانات',
      body: [
        'بيانات الحساب والمحتوى: نحتفظ بها طوال بقاء حسابك نشطاً.',
        'عند طلب الحذف: نحذف بياناتك الشخصية ومحتواك خلال 30 يوماً من التحقق من الطلب.',
        'سجلات الفوترة والفواتير: نحتفظ بها للمدة التي تفرضها الأنظمة المحاسبية والتجارية في دولة الإمارات، وهي خمس سنوات، حتى بعد إغلاق الحساب.',
        'سجلات الأمان مثل محاولات تسجيل الدخول وعدّادات ضبط معدّل الطلبات: مدة قصيرة لا تتجاوز ما يلزم لغرضها.',
        'بيانات القياس المخزّنة لدى Google وMeta: تخضع لسياسات الاحتفاظ لدى كل منهما، والمدة الافتراضية لأحداث Google Analytics هي 14 شهراً.',
      ],
    },
    {
      heading: '7. أمان البيانات',
      body: [
        'نستخدم تشفير SSL/TLS لحماية بياناتك أثناء النقل.',
        'بيانات كل حساب معزولة على مستوى قاعدة البيانات نفسها عبر Row Level Security، بحيث لا يصل حساب إلى بيانات حساب آخر.',
        'نطبّق ضبطاً لمعدّل الطلبات وحماية من محاولات الدخول المتكررة.',
        'لا نخزّن بيانات البطاقات إطلاقاً — تبقى لدى Stripe وحدها.',
        'لا يوجد نظام آمن بنسبة مئة بالمئة. وإذا وقع خرق يمسّ بياناتك الشخصية، سنُشعرك وسنتخذ الإجراءات اللازمة للحدّ من أثره.',
      ],
    },
    {
      heading: '8. حقوقك في بياناتك',
      body: [
        'الاطّلاع على بياناتك والحصول على نسخة منها.',
        'تصحيح بيانات حسابك — متاح لك مباشرة من صفحة الإعدادات.',
        'حذف حسابك وبياناتك: أرسل الطلب من صفحة التواصل، وننفّذه خلال 30 يوماً، باستثناء ما يلزمنا الاحتفاظ به قانونياً كسجلات الفوترة.',
        'الاعتراض على استخدام بياناتك في القياس الإعلاني، بالوسائل الواردة في القسم الثالث.',
        'سحب موافقتك على الرسائل التسويقية في أي وقت، دون أن يؤثر ذلك على رسائل الخدمة الأساسية المتعلقة بحسابك.',
        'إذا رأيت أننا لم نتعامل مع طلبك كما ينبغي، فلك الحق في التقدّم بشكوى إلى الجهة الرقابية المختصة.',
      ],
    },
    {
      heading: '9. خصوصية القاصرين',
      body: [
        'الخدمة موجّهة للأنشطة التجارية ولمن بلغ 18 سنة فأكثر.',
        'لا نجمع عن قصد بيانات من هم دون 18 سنة. وإذا تبيّن لنا وجود حساب كهذا، نحذفه ونحذف بياناته.',
      ],
    },
    {
      heading: '10. التحديثات على هذه السياسة',
      body: [
        'قد نُحدّث هذه السياسة كلما تغيّرت الخدمة أو الأدوات التي نستخدمها.',
        'يظهر تاريخ آخر تحديث أعلى هذه الصفحة. وإذا كان التغيير جوهرياً — كإضافة أداة قياس جديدة أو غرض جديد لاستخدام البيانات — سنُشعرك عبر البريد الإلكتروني أو داخل المنصة قبل سريانه.',
      ],
    },
  ],
  contact: {
    note: 'لأي استفسار يخصّ الخصوصية، أو لطلب نسخة من بياناتك أو حذفها،',
    linkLabel: 'كلّمنا من هنا',
  },
};

const EN_PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  intro:
    'This policy explains what data PyraSuite collects, how we use it, who we share it with, and the choices you have. It covers our website and every part of the platform.',
  updated: EN_UPDATED,
  sections: [
    {
      heading: '1. What we collect',
      body: [
        'Account data: your name, email address, profile picture if you add one, along with your plan and credit balance.',
        'Business details you enter yourself: brand name, industry, description, target audience, city, website and colours. We use these to generate work that fits your brand.',
        'What you send us: the text, images and files you submit to the studios, and the output they produce.',
        'Usage data: the pages you visit, the studios you use, and the result, timing and credit cost of each generation.',
        'Technical data: IP address, browser, device and language. We use these for security, abuse prevention and rate limiting — not to build a profile of you.',
        'Payment data: handled entirely by Stripe. Your card number never reaches our servers and we do not store it. We keep only your Stripe customer reference, your subscription status and your invoice history.',
      ],
    },
    {
      heading: '2. How we use it',
      body: [
        'To run the service: process your generations, store your work, and manage your credits and subscription.',
        'To contact you about your account: payment confirmations, password resets and essential service notices.',
        'To improve the product: understand what customers actually use, where they get stuck, and fix failures.',
        'To measure our own advertising and learn which channels bring real subscribers.',
        'To protect the platform: detect fraud and credit-system abuse, and defend accounts against unauthorised access.',
        'We do not sell or rent your personal data, and we do not share it with data brokers or with outside advertisers for their own purposes.',
      ],
    },
    {
      heading: '3. Cookies and measurement',
      body: [
        'Essential cookies: these hold your login session and keep you signed in, and protect our forms from abuse. They cannot be turned off inside the platform because signing in depends on them.',
        'Usage analytics: we use Google Analytics 4 to measure visits, pages and traffic sources. It sets cookies named _ga and _ga_* holding a random browser identifier — not your name or email.',
        'Advertising measurement: we use the Meta Pixel to measure the results of our ads on Facebook and Instagram. It sets cookies named _fbp and _fbc; _fbc is only created if you reached the site by clicking one of our ads.',
        'Server-side measurement — stated plainly, because you cannot see it in your browser: some measurement does not happen in your browser at all. When a purchase or a sign-up completes, our server sends that event directly to Google Analytics and to the Meta Conversions API. The event carries a one-way hashed (SHA-256) copy of your email address and of your account identifier, together with the subscription value and the cookie identifiers above. We never send your email in the clear, your name, or any of the content you create.',
        'Payments: Stripe sets its own cookies on the checkout pages to prevent fraud during payment.',
        'How to stop tracking: you can delete or block cookies in your browser settings — note that blocking the essential ones will break sign-in. To opt out of Google Analytics specifically, Google publishes an official browser add-on at tools.google.com/dlpage/gaoptout.',
        'To control Meta advertising and its measurement, use your ad preferences on Facebook or Instagram at accountscenter.facebook.com/ads. At the device level you can also turn off app tracking on iOS or reset your advertising ID on Android.',
        'If you would rather we excluded your account from advertising measurement altogether, contact us and we will do that.',
      ],
    },
    {
      heading: '4. Processors and transfers outside the UAE',
      body: [
        'Stripe — payments, subscriptions and invoice records.',
        'Google — visit measurement through Google Analytics 4.',
        'Meta Platforms — advertising measurement through the Meta Pixel and the Meta Conversions API.',
        'Infrastructure providers: hosting, database and storage, plus the mail service we send account email from.',
        'The AI infrastructure the Pyra AI engine runs on: your prompt and any attached images are sent there to produce your generation, and nothing else — your name and email address are not.',
        'These providers may process data outside the UAE, including in the European Union and the United States. By using the platform you understand that your data may be transferred and processed abroad under the contractual terms we have with each provider.',
      ],
    },
    {
      heading: '5. The content you create',
      body: [
        'The content you generate — images, copy, campaigns, voiceovers — belongs to you.',
        'We keep a copy so it appears in your asset library and you can come back to it.',
        'We do not use your content or your brand details to train AI models, we do not show it to other customers, and we do not sell it.',
        'We look at specific content only in narrow cases: to answer a support request you send us, to investigate an abuse report, or where the law requires it.',
      ],
    },
    {
      heading: '6. How long we keep it',
      body: [
        'Account data and content: for as long as your account is active.',
        'On a deletion request: we delete your personal data and content within 30 days of verifying the request.',
        'Billing and invoice records: kept for the period UAE accounting and commercial rules require — five years — even after an account is closed.',
        'Security records such as login attempts and rate-limit counters: kept briefly, no longer than the purpose requires.',
        'Measurement data held by Google and Meta: governed by their own retention settings. The default retention for Google Analytics events is 14 months.',
      ],
    },
    {
      heading: '7. Security',
      body: [
        'We use SSL/TLS encryption to protect your data in transit.',
        'Each account’s data is isolated in the database itself through Row Level Security, so one account cannot reach another’s data.',
        'We apply rate limiting and protection against repeated login attempts.',
        'We never store card data — it stays with Stripe.',
        'No system is completely secure. If a breach affects your personal data, we will notify you and act to limit the impact.',
      ],
    },
    {
      heading: '8. Your rights',
      body: [
        'Access your data and get a copy of it.',
        'Correct your account details — available to you directly on the settings page.',
        'Delete your account and data: send the request from our contact page and we will action it within 30 days, except for records we are legally required to keep, such as billing.',
        'Object to your data being used for advertising measurement, by the routes described in section 3.',
        'Withdraw consent to marketing email at any time, without affecting the essential service email about your account.',
        'If you believe we have not handled your request properly, you have the right to complain to the competent supervisory authority.',
      ],
    },
    {
      heading: '9. Children',
      body: [
        'The service is intended for businesses and for people aged 18 or over.',
        'We do not knowingly collect data from anyone under 18. If we find such an account, we delete it and its data.',
      ],
    },
    {
      heading: '10. Changes to this policy',
      body: [
        'We may update this policy as the service and the tools we use change.',
        'The last-updated date is shown at the top of this page. If a change is material — a new measurement tool, or a new purpose for using your data — we will tell you by email or inside the platform before it takes effect.',
      ],
    },
  ],
  contact: {
    note: 'For any privacy question, or to request a copy of your data or its deletion,',
    linkLabel: 'get in touch here',
  },
};

const AR_TERMS: LegalDoc = {
  title: 'شروط الاستخدام',
  intro:
    'تحكم هذه الشروط استخدامك لمنصة PyraSuite. اقرأها قبل إنشاء حسابك، فهي تحدّد ما نقدّمه، وما نتوقّعه منك، وكيف تعمل الاشتراكات والكريدت.',
  updated: AR_UPDATED,
  sections: [
    {
      heading: '1. قبول الشروط',
      body: [
        'باستخدامك لمنصة PyraSuite أو إنشائك حساباً عليها، فأنت توافق على هذه الشروط. وإذا لم توافق عليها، يُرجى عدم استخدام الخدمة.',
      ],
    },
    {
      heading: '2. الخدمة',
      body: [
        'PyraSuite منصة تسويق تعمل بمحرك بايرا للذكاء الاصطناعي، وتتيح لك توليد محتوى تسويقي متنوّع من صور ونصوص وحملات وتعليق صوتي.',
        'المخرجات تُولَّد آلياً. أنت مسؤول عن مراجعتها والتحقق من صحتها ومن ملاءمتها قبل نشرها أو استخدامها في إعلان مدفوع.',
        'نحتفظ بحق تعديل أي ميزة أو إيقافها، مع إشعار مسبق عندما يكون التغيير جوهرياً.',
      ],
    },
    {
      heading: '3. الأهلية والحساب',
      body: [
        'يجب أن يكون عمرك 18 سنة فأكثر، وأن تكون مخوّلاً بالتعاقد نيابة عن النشاط التجاري الذي تستخدم المنصة له.',
        'أنت مسؤول عن دقة بيانات حسابك وعن حماية كلمة مرورك، وعن كل نشاط يجري من خلال حسابك.',
        'أبلغنا فوراً إذا اشتبهت في وصول غير مصرّح به إلى حسابك.',
      ],
    },
    {
      heading: '4. نظام الكريدت',
      body: [
        'كريدت الاشتراك تتجدّد شهرياً ولا تُرحَّل إلى الشهر التالي، ما لم يُذكر خلاف ذلك في خطتك.',
        'كريدت الشحن الإضافي (top-up) صالحة لمدة 12 شهراً من تاريخ الشراء.',
        'الكريدت المستخدمة في عملية توليد ناجحة غير قابلة للاسترداد.',
        'إذا فشلت عملية التوليد من جانبنا، تُعاد الكريدت المحجوزة إلى رصيدك تلقائياً.',
      ],
    },
    {
      heading: '5. الاشتراكات والمدفوعات',
      body: [
        'تُعالَج المدفوعات بواسطة Stripe. بالاشتراك، تُفوّضنا بتحصيل قيمة الخطة بشكل دوري إلى أن تُلغي الاشتراك.',
        'يمكنك إلغاء اشتراكك في أي وقت، ويسري الإلغاء في نهاية فترة الفوترة الحالية. تبقى الخدمة متاحة حتى نهاية الفترة المدفوعة.',
        'لا نردّ قيمة فترة بدأت بالفعل، إلا في الحدود التي يفرضها القانون.',
        'الأسعار المعروضة بالدولار الأمريكي ما لم يُذكر غير ذلك، وقد يضيف بنكك رسوم تحويل عملة.',
        'لا تشمل الأسعار ضريبة القيمة المضافة، ولا تُصدر المنصة فواتير ضريبية في الوقت الحالي.',
        'إذا تعذّر تحصيل الدفعة، قد تُخفَّض خطتك إلى المجانية إلى حين تحديث وسيلة الدفع.',
      ],
    },
    {
      heading: '6. المحتوى والملكية',
      body: [
        'تحتفظ بملكية المحتوى الذي تنشئه، وأنت مسؤول عن استخدامه بما يتوافق مع القوانين المعمول بها وسياسات المنصات التي تنشره عليها.',
        'تمنحنا ترخيصاً محدوداً بتخزين محتواك وعرضه داخل حسابك، لغرض تشغيل الخدمة فقط.',
        'تحمل الصور المولَّدة في الخطة المجانية علامة مائية. تُزال العلامة في الخطط المدفوعة.',
        'أنظمة الذكاء الاصطناعي قد تُنتج مخرجات متشابهة لمستخدمين مختلفين، ولا نضمن تفرّد أي مخرج ولا صلاحيته للتسجيل كعلامة تجارية.',
      ],
    },
    {
      heading: '7. الاستخدام المقبول',
      body: [
        'يُحظر استخدام المنصة لإنشاء محتوى مخالف للقانون، أو مضلّل، أو ينتهك حقوق الملكية الفكرية للآخرين، أو ينتحل شخصية جهة أو فرد.',
        'يُحظر توليد محتوى إباحي أو عنيف أو محرّض على الكراهية، أو أي محتوى يخالف سياسات منصات الإعلان التي تنشر عليها.',
        'يُحظر التحايل على نظام الكريدت أو حدود الخطة، أو محاولة الوصول الآلي غير المصرّح به إلى الخدمة، أو إعادة بيع الخدمة دون اتفاق مكتوب معنا.',
      ],
    },
    {
      heading: '8. التعليق والإنهاء',
      body: [
        'نحتفظ بحق تعليق أو إنهاء أي حساب يخالف هذه الشروط، وبإشعار مسبق كلما كان ذلك ممكناً.',
        'يمكنك التوقف عن استخدام الخدمة في أي وقت. ننصح بتنزيل أعمالك قبل إغلاق الحساب، إذ ينتهي وصولك إلى المحتوى المخزّن بعد الإغلاق.',
      ],
    },
    {
      heading: '9. إخلاء المسؤولية وحدود الضمان',
      body: [
        'تُقدَّم الخدمة «كما هي». نبذل جهداً معقولاً لإبقائها متاحة ودقيقة، لكننا لا نضمن استمرارها دون انقطاع ولا خلوّها من الأخطاء.',
        'لا نضمن تحقيق نتائج تسويقية أو مبيعات معيّنة من استخدام المحتوى المولَّد.',
        'في الحدود التي يسمح بها القانون، تقتصر مسؤوليتنا الإجمالية تجاهك على المبالغ التي دفعتها لنا خلال الأشهر الثلاثة السابقة للحدث موضوع المطالبة.',
      ],
    },
    {
      heading: '10. القانون الحاكم',
      body: [
        'تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة، وتختص محاكم الدولة بالنظر في أي نزاع ينشأ عنها.',
      ],
    },
    {
      heading: '11. التعديلات على الشروط',
      body: [
        'قد نُعدّل هذه الشروط. يظهر تاريخ آخر تحديث أعلى الصفحة، وسنُشعرك بالتغييرات الجوهرية قبل سريانها.',
        'استمرارك في استخدام الخدمة بعد سريان التعديل يعني قبولك له.',
      ],
    },
  ],
  contact: {
    note: 'لأي سؤال حول هذه الشروط أو حول اشتراكك،',
    linkLabel: 'كلّمنا من هنا',
  },
};

const EN_TERMS: LegalDoc = {
  title: 'Terms of Use',
  intro:
    'These terms govern your use of PyraSuite. Please read them before creating an account — they set out what we provide, what we expect from you, and how subscriptions and credits work.',
  updated: EN_UPDATED,
  sections: [
    {
      heading: '1. Acceptance',
      body: [
        'By using PyraSuite or creating an account, you agree to these terms. If you do not agree, please do not use the service.',
      ],
    },
    {
      heading: '2. The service',
      body: [
        'PyraSuite is a marketing platform powered by the Pyra AI engine. It lets you generate marketing content — images, copy, campaigns and voiceovers.',
        'Output is generated automatically. You are responsible for reviewing it, checking that it is accurate and appropriate, and doing so before you publish it or use it in a paid ad.',
        'We may change or discontinue any feature, with advance notice where the change is material.',
      ],
    },
    {
      heading: '3. Eligibility and your account',
      body: [
        'You must be 18 or older and authorised to enter into these terms on behalf of the business you are using the platform for.',
        'You are responsible for the accuracy of your account details, for keeping your password safe, and for all activity under your account.',
        'Tell us immediately if you suspect unauthorised access to your account.',
      ],
    },
    {
      heading: '4. Credits',
      body: [
        'Subscription credits renew monthly and do not roll over to the next month unless your plan says otherwise.',
        'Top-up credits are valid for 12 months from the date of purchase.',
        'Credits spent on a successful generation are non-refundable.',
        'If a generation fails on our side, the credits reserved for it are returned to your balance automatically.',
      ],
    },
    {
      heading: '5. Subscriptions and payment',
      body: [
        'Payments are processed by Stripe. By subscribing, you authorise us to charge your plan on a recurring basis until you cancel.',
        'You can cancel at any time. Cancellation takes effect at the end of the current billing period, and the service stays available until then.',
        'We do not refund a period that has already started, except where the law requires it.',
        'Prices are shown in US dollars unless stated otherwise, and your bank may add currency conversion fees.',
        'Prices do not include VAT, and the platform does not issue tax invoices at this time.',
        'If a payment fails, your plan may be moved to the free tier until the payment method is updated.',
      ],
    },
    {
      heading: '6. Content and ownership',
      body: [
        'You keep ownership of the content you create, and you are responsible for using it lawfully and in line with the policies of the platforms you publish it on.',
        'You grant us a limited licence to store and display your content inside your account, for the sole purpose of running the service.',
        'Images generated on the free plan carry a watermark. Paid plans are delivered without it.',
        'AI systems can produce similar output for different customers. We do not guarantee that any output is unique or that it can be registered as a trademark.',
      ],
    },
    {
      heading: '7. Acceptable use',
      body: [
        'You may not use the platform to create unlawful or misleading content, content that infringes other people’s intellectual property, or content that impersonates a person or organisation.',
        'You may not generate sexual, violent or hateful content, or anything that breaches the policies of the advertising platforms you publish on.',
        'You may not circumvent the credit system or plan limits, attempt unauthorised automated access, or resell the service without a written agreement with us.',
      ],
    },
    {
      heading: '8. Suspension and termination',
      body: [
        'We may suspend or terminate an account that breaches these terms, with advance notice wherever that is possible.',
        'You may stop using the service at any time. Download your work before closing your account — access to stored content ends when the account is closed.',
      ],
    },
    {
      heading: '9. Disclaimer and limitation of liability',
      body: [
        'The service is provided "as is". We make reasonable efforts to keep it available and accurate, but we do not warrant that it will be uninterrupted or error-free.',
        'We do not guarantee any particular marketing result or level of sales from the content you generate.',
        'To the extent permitted by law, our total liability to you is limited to the amounts you paid us in the three months before the event giving rise to the claim.',
      ],
    },
    {
      heading: '10. Governing law',
      body: [
        'These terms are governed by the laws of the United Arab Emirates, and the courts of the UAE have jurisdiction over any dispute arising from them.',
      ],
    },
    {
      heading: '11. Changes to these terms',
      body: [
        'We may amend these terms. The last-updated date is shown at the top of this page, and we will notify you of material changes before they take effect.',
        'Continuing to use the service after a change takes effect means you accept it.',
      ],
    },
  ],
  contact: {
    note: 'For any question about these terms or your subscription,',
    linkLabel: 'get in touch here',
  },
};

export const LEGAL_CONTENT: Record<LegalLocale, { privacy: LegalDoc; terms: LegalDoc }> = {
  ar: { privacy: AR_PRIVACY, terms: AR_TERMS },
  en: { privacy: EN_PRIVACY, terms: EN_TERMS },
};

function isLegalLocale(value: string): value is LegalLocale {
  return value === 'ar' || value === 'en';
}

/**
 * The single accessor. `locale` is the raw route segment, so it is typed as a
 * plain string and validated here rather than at every call site — an unknown
 * locale falls back to Arabic, which is the product's default locale
 * (i18n/routing.ts) and therefore the safe answer for a route that reached us
 * with a segment next-intl did not recognise.
 */
export function getLegalDoc(locale: string, doc: LegalDocId): LegalDoc {
  const key: LegalLocale = isLegalLocale(locale) ? locale : 'ar';
  return LEGAL_CONTENT[key][doc];
}
