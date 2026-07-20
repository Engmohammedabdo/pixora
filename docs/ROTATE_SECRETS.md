# تدوير مفاتيح الإنتاج — Supabase المستضاف على Coolify

> ⚠️ هذا ليس Supabase السحابي. لا تتبع أي دليل يقول «من لوحة Supabase → Settings → Reset».
> عندك الحزمة كاملة على خادمك، والمفاتيح مترابطة — تغيير واحد بالغلط يوقف المنصة كلها.

**متى تستخدم هذا الملف:** فوراً. مفتاح `service_role` تسرّب أكثر من مرة (المستودع العام + محادثات).
من يملكه **يتجاوز كل سياسات RLS** عبر HTTPS مباشرة — أي أن ترحيلات 022 و024 و025 لا تحميك منه إطلاقاً.

---

## الفخ الأول: المفاتيح ليست مستقلة

```
SERVICE_PASSWORD_JWT  ──يوقّع──►  SERVICE_SUPABASEANON_KEY      (المتصفح)
                      └─يوقّع──►  SERVICE_SUPABASESERVICE_KEY   (الخادم)
```

`anon` و `service_role` ليسا كلمتَي سر — هما **توكِنات JWT موقّعة** بـ`SERVICE_PASSWORD_JWT`.

**النتيجة:** لو غيّرت `SERVICE_PASSWORD_JWT` وحده، المفتاحان القديمان يصبحان **توقيعاً غير صالح فوراً**،
وكل طلب من المتصفح ومن الخادم يفشل بـ401. لا بد من توليدهما من جديد **في نفس العملية**.

## الفخ الثاني: كلمة سر Postgres لا تتغيّر من متغيّر البيئة

`POSTGRES_PASSWORD` تُقرأ **مرة واحدة فقط** عند تهيئة قاعدة البيانات لأول مرة.
قاعدتك موجودة منذ شهور، فتغيير القيمة في Coolify **لن يغيّر كلمة السر الفعلية** —
سيقتصر أثره على أن الخدمات تحاول الاتصال بكلمة سر خاطئة، فتتوقف.

لا بد من تغييرها **داخل قاعدة البيانات نفسها** أيضاً.

## الفخ الثالث: لا تلمس `VAULT_ENC_KEY`

هذا المفتاح يفك تشفير أسرار مخزّنة داخل Supabase Vault.
تغييره يجعل كل ما شُفِّر به **غير قابل للاسترجاع نهائياً**. اتركه إلا إذا كنت تعرف تحديداً ما بداخله.

---

## الترتيب الصحيح

### 0) قبل أي شيء

- [ ] اجعل مستودع GitHub **private**.
- [ ] خذ **نسخة احتياطية** من قاعدة البيانات من Coolify.
- [ ] اختر وقتاً تقبل فيه توقّف المنصة ~10 دقائق.

### 1) كلمة سر Postgres

من محرر SQL في Supabase (أو `psql` كـ`postgres`):

```sql
ALTER USER postgres WITH PASSWORD '<كلمة-سر-جديدة-قوية>';
```

ثم في Coolify، حدّث **كل** المتغيّرات التي تحمل نفس القيمة:

```
SERVICE_PASSWORD_POSTGRES
POSTGRES_PASSWORD
PGPASSWORD
DB_PASSWORD
PG_META_DB_PASSWORD
```

> كلها تشير إلى نفس كلمة السر. لو نسيت واحداً، الخدمة التابعة له لن تقلع.

### 2) سر JWT + المفتاحان معاً

**(أ)** ولّد سراً جديداً (32 محرفاً على الأقل):

```bash
openssl rand -base64 32
```

**(ب)** ولّد المفتاحين الجديدين بالسر الجديد. شغّل هذا **محلياً** — لا تستخدم أي موقع ويب لتوليد JWT:

```bash
node scripts/gen-supabase-keys.js "<السر-الجديد>"
```

**(ج)** في Coolify حدّث:

```
SERVICE_PASSWORD_JWT          ← السر الجديد
SERVICE_SUPABASEANON_KEY      ← مفتاح anon الجديد
SERVICE_SUPABASESERVICE_KEY   ← مفتاح service_role الجديد
```

المتغيّرات الأخرى (`JWT_SECRET`, `AUTH_JWT_SECRET`, `GOTRUE_JWT_SECRET`, `PGRST_JWT_SECRET`,
`API_JWT_SECRET`, `METRICS_JWT_SECRET`) تشير إلى `${SERVICE_PASSWORD_JWT}` وتتحدّث تلقائياً.

> **أثر جانبي مقصود:** كل جلسات المستخدمين الحالية تنتهي. سيسجّلون الدخول من جديد. هذا صحيح ومطلوب —
> فالتوكِنات القديمة موقّعة بالسر المسرّب.

### 3) بقية الأسرار المكشوفة

| المتغيّر | أين تُغيّره |
|---|---|
| `SERVICE_PASSWORD_ADMIN` / `SERVICE_USER_ADMIN` | Coolify — دخول لوحة Supabase |
| `SERVICE_USER_MINIO` / `SERVICE_PASSWORD_MINIO` | Coolify — وتُحدَّث معها `AWS_ACCESS_KEY_ID` و`AWS_SECRET_ACCESS_KEY` |
| `SERVICE_PASSWORD_LOGFLARE` | Coolify |
| `SERVICE_PASSWORD_SUPAVISORSECRET` | Coolify — ومعها `SECRET_KEY_BASE` |
| `GOTRUE_EXTERNAL_GOOGLE_SECRET` | **Google Cloud Console** → Credentials → أنشئ سراً جديداً واحذف القديم |

### 4) حدّث تطبيق PyraSuite

مفتاح `anon` **مضمَّن داخل حزمة الواجهة** عبر `NEXT_PUBLIC_SUPABASE_ANON_KEY`،
فلا يكفي تغيير المتغيّر — لا بد من **إعادة بناء** التطبيق ونشره:

```
NEXT_PUBLIC_SUPABASE_ANON_KEY  ← مفتاح anon الجديد
SUPABASE_SERVICE_ROLE_KEY      ← مفتاح service_role الجديد
```

### 5) نظّف التاريخ

حذف السطر من الملف **لا يكفي** — القيمة محفوظة في الالتزامات السابقة وGitHub يفهرسها.

```bash
git rm --cached scripts/apply-migrations.sh scripts/apply-migrations-rest.sh
# ثم أعد كتابة التاريخ بأداة مثل git-filter-repo، أو ابدأ مستودعاً جديداً نظيفاً
```

### 6) اقفل المنفذ

قيّد المنفذ `5432` شبكياً من Coolify بحيث لا يُقبل الاتصال إلا من داخل الخادم.
اليوم قاعدتك مفتوحة على الإنترنت.

---

## التحقق بعد الانتهاء

- [ ] `https://pyrasuite.pyramedia.cloud` يفتح ويسمح بتسجيل الدخول.
- [ ] توليد واحد من أي استوديو يعمل.
- [ ] المفتاح **القديم** لم يعد يعمل:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: <المفتاح-القديم>" \
  https://pixoradb.pyramedia.cloud/rest/v1/profiles
# المتوقع: 401
```

- [ ] شغّل `supabase/CHECK_STATE.sql` وتأكد أن النتائج كما هو موصوف بداخله.

---

## بعدها مباشرة

طالما أنت داخل إعدادات Coolify، اضبط **SMTP** — `SMTP_HOST` فارغة اليوم،
وهذا يعطّل استرجاع كلمة السر ودعوات الفريق والفواتير. Resend أو Brevo يكفيان مجاناً في البداية.

## قاعدة من الآن فصاعداً

**لا ترسل ملف الأسرار لأي شخص ولا في أي محادثة.** لو احتاج أحد التأكد من الإعداد،
أرسل **أسماء** المتغيّرات لا قيمها. أي سر يُلصق في محادثة يجب اعتباره محروقاً ويُدوَّر.
