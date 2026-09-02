import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  // The HTML <link rel="alternate"> tags are the one hreflang channel. With this
  // on, next-intl ALSO sent an HTTP Link header whose x-default was "/" — a URL
  // that 307s — while the HTML said "/ar". See lib/seo/alternates.ts.
  alternateLinks: false,
});

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
