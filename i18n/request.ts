import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;

  if (!locale || !routing.locales.includes(locale as 'ar' | 'en')) {
    locale = routing.defaultLocale;
  }

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
    // Without an explicit zone, next-intl falls back to the runtime's zone —
    // the server's on SSR and the browser's on hydration — which both warns
    // and can render two different times for the same row.
    timeZone: 'Asia/Riyadh',
  };
});
