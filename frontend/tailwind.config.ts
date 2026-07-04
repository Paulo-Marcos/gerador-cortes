import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          500: 'var(--bg-500)',
          600: 'var(--bg-600)',
          700: 'var(--bg-700)',
          800: 'var(--bg-800)',
          900: 'var(--bg-900)',
          950: 'var(--bg-950)',
        },
        surface: {
          1: 'var(--surface-1)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
        },
        accent: {
          200: 'var(--accent-200)',
          300: 'var(--accent-300)',
          400: 'var(--accent-400)',
          500: 'var(--accent-500)',
          600: 'var(--accent-600)',
          700: 'var(--accent-700)',
        },
        text: {
          100: 'var(--text-100)',
          200: 'var(--text-200)',
          300: 'var(--text-300)',
          400: 'var(--text-400)',
          500: 'var(--text-500)',
        },
        border: {
          DEFAULT: 'var(--border)',
          hover: 'var(--border-hover)',
          accent: 'var(--border-accent)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        error: 'var(--error)',
        info: 'var(--info)',
        wb: {
          bg: 'var(--wb-bg)',
          'bg-panel': 'var(--wb-bg-panel)',
          'bg-card': 'var(--wb-bg-card)',
          'bg-card-elev': 'var(--wb-bg-card-elev)',
          'bg-inset': 'var(--wb-bg-inset)',
          border: 'var(--wb-border)',
          'border-soft': 'var(--wb-border-soft)',
          text: 'var(--wb-text)',
          'text-mute': 'var(--wb-text-mute)',
          'text-dim': 'var(--wb-text-dim)',
          accent: 'var(--wb-accent)',
          'accent-strong': 'var(--wb-accent-strong)',
          'accent-soft': 'var(--wb-accent-soft)',
          ink: 'var(--wb-ink)',
          'ink-fg': 'var(--wb-ink-fg)',
          ok: 'var(--wb-ok)',
          'ok-soft': 'var(--wb-ok-soft)',
          warn: 'var(--wb-warn)',
          'warn-soft': 'var(--wb-warn-soft)',
          err: 'var(--wb-err)',
          'err-soft': 'var(--wb-err-soft)',
          info: 'var(--wb-info)',
          'info-soft': 'var(--wb-info-soft)',
          violet: 'var(--wb-violet)',
          'violet-soft': 'var(--wb-violet-soft)',
          fire: 'var(--wb-fire)',
          'fire-soft': 'var(--wb-fire-soft)',
          leitura: 'var(--wb-leitura)',
          'leitura-soft': 'var(--wb-leitura-soft)',
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
