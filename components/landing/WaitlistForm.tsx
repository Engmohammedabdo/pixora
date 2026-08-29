'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * The browser half of the waitlist Lead, and the reason it exists at all.
 *
 * The server already sends this event (app/api/waitlist/route.ts). This copy is
 * NOT redundant: only the browser holds `_fbp`/`_fbc`, the cookies that give Meta
 * the match quality to tie a lead back to the ad click that produced it. The
 * server copy is the one that survives ad blockers and iOS/ATT. Meta dedups on
 * (event_name, event_id) for 48h, so the pair counts once and whichever arrives
 * first wins.
 *
 * The key MUST equal `waitlistEventId()` in lib/analytics/meta-capi.ts byte for
 * byte — same normalisation, same hash, same 32-char prefix. That module cannot
 * be imported here: it reads META_CAPI_ACCESS_TOKEN and uses `node:crypto`, so
 * importing it into a client component would pull a server secret's module into
 * the browser bundle. Hence Web Crypto, and hence this comment — a drift between
 * the two is not an error that shows up anywhere. It silently DOUBLE-COUNTS the
 * conversion, which halves the reported cost-per-lead and tells the founder to
 * spend more on an ad that is performing worse than it looks.
 */
async function waitlistEventId(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `wl_${hex.slice(0, 32)}`;
}

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
        // Report the conversion BEFORE swapping to the success view, and never
        // let a reporting failure become a customer-visible failure — the signup
        // is already stored server-side by this point.
        //
        // 'Lead' is the one standard event the browser may claim. MetaPixel.tsx
        // forbids Purchase / CompleteRegistration / InitiateCheckout here because
        // those are server-witnessed and a forged one is free Ads-Manager revenue.
        // A waitlist join is witnessed only by this public, unauthenticated form,
        // so there is no server witness to defer to — see the note on MetaEventName.
        try {
          const eventId = await waitlistEventId(email);
          (window as { fbq?: (...args: unknown[]) => void }).fbq?.(
            'track',
            'Lead',
            { content_name: 'waitlist', content_category: segment || 'unspecified' },
            { eventID: eventId }
          );
          const dl = (window as { dataLayer?: unknown[] }).dataLayer;
          if (dl) {
            // GA4's own recommended lead event, so this is markable as a key event
            // in the GA4 admin and importable into Google Ads.
            dl.push(['event', 'generate_lead', { method: source, app_locale: locale }]);
          }
        } catch {
          /* analytics must never break a signup */
        }
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
        className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--color-success)] bg-[color-mix(in_srgb,var(--color-success)_10%,transparent)] px-6 py-8 text-center"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-success)_20%,transparent)]">
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
