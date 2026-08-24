'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, Loader2 } from 'lucide-react';

type Topic = 'billing' | 'bug' | 'account' | 'other';
const TOPICS: Topic[] = ['billing', 'bug', 'account', 'other'];

export function ContactForm(): React.ReactElement {
  const t = useTranslations('contact');
  const locale = useLocale();

  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [topic, setTopic] = useState<Topic>('billing');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Pre-fill from the session when there is one. A customer with a billing problem
  // should not have to retype the address the account is under — and a typo there is
  // how a reply goes to nobody. The server still takes the user id from the verified
  // session, never from this form.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/user/profile');
        if (!res.ok) return;
        const json = await res.json();
        const profile = json?.data ?? json?.profile;
        if (!cancelled && profile?.email) {
          setEmail((current) => current || profile.email);
          setName((current) => current || profile.name || '');
        }
      } catch {
        // Logged out. Expected — the form works either way.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, name, topic, message, company,
          locale,
          // Which screen they were on when it went wrong. Saves an entire round of
          // "where were you when this happened?".
          pageUrl: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) { setSent(true); return; }
      setError(t(json.error === 'rate_limited' ? 'errorRateLimited'
        : json.error === 'message_too_short' ? 'errorTooShort'
        : 'errorGeneric'));
    } catch {
      setError(t('errorGeneric'));
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
        <CheckCircle2 className="mx-auto mb-4 h-10 w-10 text-emerald-500" />
        <h2 className="mb-2 text-lg font-bold">{t('sentTitle')}</h2>
        <p className="text-sm text-[var(--color-text-secondary)]">{t('sentBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
      <div className="space-y-2">
        <Label htmlFor="topic">{t('topic')}</Label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TOPICS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setTopic(value)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                topic === value
                  ? 'border-[var(--color-brand)] bg-[color-mix(in_srgb,var(--color-brand)_10%,transparent)] font-medium text-[var(--color-brand)]'
                  : 'border-[var(--color-border)] hover:bg-[var(--color-bg)]'
              }`}
            >
              {t(`topics.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email" type="email" value={email} required dir="ltr"
          onChange={(e) => setEmail(e.target.value)}
          className="rtl:placeholder-shown:text-right"
          placeholder="you@example.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="name">{t('name')}</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">{t('message')}</Label>
        <Textarea
          id="message" rows={6} required minLength={10} value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('messagePlaceholder')}
        />
      </div>

      {/* Hidden from people, filled by bots. Not `display:none` alone — some bots
          skip that; off-screen with aria-hidden and no tab stop reads as a real
          field to a script and is invisible to a screen reader. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="company">Company</label>
        <input
          id="company" name="company" type="text" tabIndex={-1} autoComplete="off"
          value={company} onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <Button type="submit" disabled={loading || message.trim().length < 10} className="w-full">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('submit')}
      </Button>

      <p className="text-center text-xs text-[var(--color-text-muted)]">{t('responseTime')}</p>
    </form>
  );
}
