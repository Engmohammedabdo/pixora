import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      screens: {
        xs: '400px',
      },
      colors: {
        primary: {
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        accent: {
          300: '#67E8F9',
          400: '#22D3EE',
          500: '#06B6D4',
          600: '#0891B2',
        },
        // Theme-aware: these CSS variables flip in .dark (globals.css),
        // so bg-surface / bg-surface-2 / bg-background adapt automatically
        surface: {
          DEFAULT: 'var(--color-surface)',
          2: 'var(--color-surface-2)',
        },
        background: {
          DEFAULT: 'var(--color-bg)',
        },
      },
      fontFamily: {
        cairo: ['var(--font-cairo)', 'sans-serif'],
        tajawal: ['var(--font-tajawal)', 'sans-serif'],
        inter: ['var(--font-inter)', 'sans-serif'],
      },
      // Radix portals dialogs, dropdowns and tooltips to document.body, so
      // their painting order is decided purely by z-index, not by nesting.
      // `popover` sits ABOVE `modal` on purpose: a DropdownMenu or Select
      // opened from inside a Dialog must paint over it. (Before this scale
      // existed both were z-50 and the later-mounted one won by tie-break,
      // which happened to work; an explicit tier makes it deliberate.)
      //
      // No `toast` tier: sonner's <Toaster> injects its own stylesheet with
      // the toaster container hardcoded to z-index:999999999 — not a CSS
      // variable, so it cannot be pointed at this scale. The `--z-index` CSS
      // var sonner does expose is set per-toast internally for stacking one
      // toast above another, not for the toaster's position on the page, so
      // passing a value through it would not touch the hardcoded 999999999
      // either. Keeping a documented `toast` tier here that reality ignores
      // is worse than having none.
      zIndex: {
        header: '30',
        nav: '35',
        scrim: '40',
        drawer: '50',
        modal: '60',
        popover: '65',
      },
    },
  },
  plugins: [],
};

export default config;
