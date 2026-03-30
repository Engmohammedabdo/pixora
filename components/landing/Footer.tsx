import { Link } from '@/i18n/routing';

const STUDIO_LINKS = [
  { label: 'منشئ الصور', href: '/dashboard/creator' },
  { label: 'مخطط الحملات', href: '/dashboard/campaign' },
  { label: 'التحليل التسويقي', href: '/dashboard/analysis' },
  { label: 'تصوير المنتجات', href: '/dashboard/photoshoot' },
];

const SUPPORT_LINKS = [
  { label: 'الأسعار', href: '/#pricing' },
  { label: 'الأسئلة الشائعة', href: '/#faq' },
  { label: 'الإعدادات', href: '/dashboard/settings' },
];

const LEGAL_LINKS = [
  { label: 'سياسة الخصوصية', href: '/privacy' },
  { label: 'شروط الاستخدام', href: '/terms' },
];

export function Footer(): React.ReactElement {
  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)] py-12 px-6">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
          {/* Column 1: Brand */}
          <div>
            <h3 className="text-lg font-bold font-cairo text-[var(--color-text-primary)] mb-1">
              PyraSuite
            </h3>
            <p className="text-sm text-[var(--color-text-muted)] mb-2">
              مدعوم بمحرك Pyra AI 🦊
            </p>
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              اكتب بالعربي. بايرا تنفّذ.
            </p>
          </div>

          {/* Column 2: Studios */}
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
              الاستوديوهات
            </h4>
            <ul className="space-y-2">
              {STUDIO_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Support */}
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
              الدعم
            </h4>
            <ul className="space-y-2">
              {SUPPORT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Legal */}
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text-primary)] mb-4">
              قانوني
            </h4>
            <ul className="space-y-2">
              {LEGAL_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-[var(--color-border)] pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[var(--color-text-muted)]">
            &copy; 2026 PyraSuite. جميع الحقوق محفوظة.
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            Powered by Pyra AI 🦊 — Built by Pyramedia
          </p>
        </div>
      </div>
    </footer>
  );
}
