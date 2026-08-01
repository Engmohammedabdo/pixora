'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const SEGMENTS = ['agency', 'store', 'freelancer', 'other'] as const;
type Segment = (typeof SEGMENTS)[number];

interface Props {
  /** Where on the page this form sits, so signups can be attributed later. */
  source?: string;
}

export function WaitlistForm({ source = 'landing' }: Props): React.ReactElement {
  const t = useTranslations('waitlist');
  const locale = useLocale();

  const [email, setEmail] = useState('');
  const [segment, setSegment] = useState<Segment | ''>('');
  const [company, setCompany] = useState(''); // honeypot
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (state === 'sending' || !email.trim()) return;

    setState('sending');
    setMessage('');
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          segment: segment || undefined,
          source,
          locale,
          company: company || undefined,
        }),
      });
      const json = await res.json();

      if (json?.success) {
        setState('done');
        return;
      }

      setState('error');
      setMessage(json?.error === 'rate_limited' ? t('tooMany') : t('invalidEmail'));
    } catch {
      setState('error');
      setMessage(t('networkError'));
    }
  };

  if (state === 'done') {
    return (
      <div
        role="status"
        className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-success)] bg-[var(--color-success)]/10 px-6 py-8 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-success)]/20">
          <Check className="h-6 w-6 text-[var(--color-success)]" />
        </div>
        <p className="text-lg font-bold">{t('successTitle')}</p>
        <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">{t('successBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-3">
      {/* Honeypot — hidden from people, irresistible to bots. Not display:none,
          which some bots detect and skip. */}
      <div aria-hidden="true" className="absolute -start-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="wl-company">Company</label>
        <input
          id="wl-company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="email"
          required
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('emailPlaceholder')}
          aria-label={t('emailLabel')}
          maxLength={254}
          className="flex-1 rtl:placeholder-shown:text-right"
        />
        <Button type="submit" disabled={state === 'sending'} className="gap-2 sm:w-auto">
          {state === 'sending' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {t('cta')}
        </Button>
      </div>

      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1.5 w-full text-xs text-[var(--color-text-muted)]">{t('segmentLabel')}</legend>
        {SEGMENTS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={segment === s}
            onClick={() => setSegment(segment === s ? '' : s)}
            className={
              segment === s
                ? 'rounded-full border border-primary-500 bg-primary-500 px-3 py-1.5 text-xs font-medium text-white transition-colors'
                : 'rounded-full border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text-secondary)] transition-colors hover:border-primary-300'
            }
          >
            {t(`segments.${s}`)}
          </button>
        ))}
      </fieldset>

      {state === 'error' && message ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">{message}</p>
      ) : (
        <p className="text-xs text-[var(--color-text-muted)]">{t('privacyNote')}</p>
      )}
    </form>
  );
}
