import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// D-841: o Tailwind 3 não sabe pôr alfa num var() — `border-error/30` sobre
// `var(--error)` simplesmente não gerava CSS. Com `<alpha-value>` dentro de um
// color-mix, o modificador de opacidade volta a existir, e sem modificador a
// cor sai inteira (100%).
const comAlfa = (token: string) =>
  `color-mix(in oklab, var(${token}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          500: comAlfa('--bg-500'),
          600: comAlfa('--bg-600'),
          700: comAlfa('--bg-700'),
          800: comAlfa('--bg-800'),
          900: comAlfa('--bg-900'),
          950: comAlfa('--bg-950'),
        },
        surface: {
          1: comAlfa('--surface-1'),
          2: comAlfa('--surface-2'),
          3: comAlfa('--surface-3'),
        },
        accent: {
          200: comAlfa('--accent-200'),
          300: comAlfa('--accent-300'),
          400: comAlfa('--accent-400'),
          500: comAlfa('--accent-500'),
          600: comAlfa('--accent-600'),
          700: comAlfa('--accent-700'),
        },
        text: {
          100: comAlfa('--text-100'),
          200: comAlfa('--text-200'),
          300: comAlfa('--text-300'),
          400: comAlfa('--text-400'),
          500: comAlfa('--text-500'),
        },
        border: {
          DEFAULT: comAlfa('--border'),
          hover: comAlfa('--border-hover'),
          accent: comAlfa('--border-accent'),
        },
        success: comAlfa('--success'),
        warning: comAlfa('--warning'),
        error: comAlfa('--error'),
        info: comAlfa('--info'),
        wb: {
          bg: comAlfa('--wb-bg'),
          'bg-panel': comAlfa('--wb-bg-panel'),
          'bg-card': comAlfa('--wb-bg-card'),
          'bg-card-elev': comAlfa('--wb-bg-card-elev'),
          'bg-inset': comAlfa('--wb-bg-inset'),
          border: comAlfa('--wb-border'),
          'border-soft': comAlfa('--wb-border-soft'),
          text: comAlfa('--wb-text'),
          'text-mute': comAlfa('--wb-text-mute'),
          'text-dim': comAlfa('--wb-text-dim'),
          accent: comAlfa('--wb-accent'),
          'accent-strong': comAlfa('--wb-accent-strong'),
          'accent-soft': comAlfa('--wb-accent-soft'),
          ink: comAlfa('--wb-ink'),
          'ink-fg': comAlfa('--wb-ink-fg'),
          ok: comAlfa('--wb-ok'),
          'ok-soft': comAlfa('--wb-ok-soft'),
          warn: comAlfa('--wb-warn'),
          'warn-soft': comAlfa('--wb-warn-soft'),
          err: comAlfa('--wb-err'),
          'err-soft': comAlfa('--wb-err-soft'),
          info: comAlfa('--wb-info'),
          'info-soft': comAlfa('--wb-info-soft'),
          violet: comAlfa('--wb-violet'),
          'violet-soft': comAlfa('--wb-violet-soft'),
          fire: comAlfa('--wb-fire'),
          'fire-soft': comAlfa('--wb-fire-soft'),
          leitura: comAlfa('--wb-leitura'),
          'leitura-soft': comAlfa('--wb-leitura-soft'),
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        serif: ['var(--font-serif)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.4)' },
          '50%': { boxShadow: '0 0 0 8px rgba(16,185,129,0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 200ms cubic-bezier(0.4,0,0.2,1)',
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
};

export default config;
