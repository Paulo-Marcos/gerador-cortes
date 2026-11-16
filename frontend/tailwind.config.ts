import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

// D-841: o Tailwind 3 não sabe pôr alfa num var() — `border-error/30` sobre
// `var(--error)` simplesmente não gerava CSS. Com `<alpha-value>` dentro de um
// color-mix, o modificador de opacidade volta a existir, e sem modificador a
// cor sai inteira (100%).
const comAlfa = (token: string) =>
  `color-mix(in oklab, var(${token}) calc(<alpha-value> * 100%), transparent)`;

const cc = (t: string) => comAlfa(`--cc-${t}`);

const config: Config = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
      // D-1113 (E-069 H-02): chaves da Sala escura (D-1111 §4.6), ao lado das antigas.
      // `info` fica de fora de propósito: a chave já existe (`--info`) e sobrescrevê-la
      // mudaria a tela atual; o `--cc-info` entra quando a H-24 remover a camada antiga.
      // Os tokens translúcidos (painel, vidro*, pop, poco, fio*) já levam o alfa
      // e não aceitam modificador `/NN`.
      app: { DEFAULT: cc('bg'), 2: cc('bg-2') },
      painel: { DEFAULT: 'var(--cc-painel)', solido: cc('painel-solido') },
      vidro: { DEFAULT: 'var(--cc-vidro)', 2: 'var(--cc-vidro-2)', 3: 'var(--cc-vidro-3)' },
      pop: 'var(--cc-pop)',
      poco: 'var(--cc-poco)',
      veu: 'var(--cc-veu)',
      palco: cc('palco'),
      fio: { DEFAULT: 'var(--cc-fio)', 2: 'var(--cc-fio-2)' },
      campo: 'var(--cc-fio-campo)',
      fg: { DEFAULT: cc('fg'), 2: cc('fg-2'), 3: cc('fg-3'), off: cc('fg-off') },
      iris: {
        DEFAULT: cc('iris'),
        2: cc('iris-2'),
        suave: 'var(--cc-iris-suave)',
        fio: 'var(--cc-iris-fio)',
      },
      'sobre-iris': cc('sobre-iris'),
      'sobre-feixe': cc('sobre-feixe'),
      'sobre-erro': cc('sobre-erro'),
      ok: cc('ok'),
      aviso: cc('aviso'),
      erro: { DEFAULT: cc('erro'), cheio: cc('erro-cheio') },
      fire: cc('fire'),
      foco: cc('foco'),
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
      backgroundImage: {
        feixe:
          'linear-gradient(100deg, var(--cc-feixe-a) 0%, var(--cc-feixe-b) 52%, var(--cc-feixe-c) 100%)',
      },
      fontSize: {
        display: ['44px', { lineHeight: '50px', fontWeight: '300', letterSpacing: '-0.028em' }],
        titulo: ['22px', { lineHeight: '28px', fontWeight: '700', letterSpacing: '-0.02em' }],
        secao: ['16px', { lineHeight: '22px', fontWeight: '700', letterSpacing: '-0.015em' }],
        linha: ['14px', { lineHeight: '20px', fontWeight: '600' }],
        corpo: ['13px', { lineHeight: '20px' }],
        pequeno: ['12px', { lineHeight: '16px', fontWeight: '500' }],
        micro: ['11px', { lineHeight: '16px', fontWeight: '600' }],
      },
      height: {
        'botao-pq': '30px',
        'botao-md': '38px',
        'botao-gd': '46px',
        campo: '40px',
        linha: '72px',
        barra: '62px',
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
        etiqueta: '6px',
        ladrilho: '9px',
        campo: '12px',
        capa: '14px',
        bloco: '16px',
        cartao: '20px',
        painel: '24px',
        dialogo: '26px',
        pilula: '999px',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow)',
        topo: 'inset 0 1px 0 var(--cc-fio-topo)',
        painel: 'inset 0 1px 0 var(--cc-fio-topo), var(--cc-sombra-painel)',
        pop: 'inset 0 1px 0 var(--cc-fio-topo), var(--cc-sombra-pop)',
        feixe: 'inset 0 1px 0 rgb(255 255 255 / .55), 0 10px 30px -10px var(--cc-feixe-brilho)',
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
