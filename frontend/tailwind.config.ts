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
    // D-1191 (E-069 H-24c): `colors` sai de `extend` e vira `theme.colors`: a paleta padrão do
    // Tailwind (slate, red, blue…) e as chaves antigas (bg, surface, accent, text, border, wb)
    // deixam de existir. Só as chaves da Sala escura e o que o vídeo exige (preto e branco do
    // scrim, `transparent`, `current`) ficam. Os tokens translúcidos (painel, vidro*, pop, poco,
    // fio*) já levam o alfa e não aceitam modificador `/NN`.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      black: 'rgb(0 0 0 / <alpha-value>)',
      white: 'rgb(255 255 255 / <alpha-value>)',
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
      info: cc('info'),
      fire: cc('fire'),
      foco: cc('foco'),
    },
    extend: {
      // D-1181: o degrau 13 (§9.2 da Sala escura) não está na escala padrão do
      // Tailwind 3. Sem ele, `bg-ok/13` não gera CSS e o fundo some em silêncio.
      opacity: {
        13: '0.13',
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
      // `min-h-linha`: a linha de lista tem NO MÍNIMO 72 px. O token em `height` não vale para
      // `min-height` no Tailwind, então ele é declarado aqui também (D-1120).
      minHeight: {
        linha: '72px',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
        mono: ['var(--font-mono)'],
      },
      borderRadius: {
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
        topo: 'inset 0 1px 0 var(--cc-fio-topo)',
        // `painel-luz`/`pop-luz`, não `painel`/`pop`: esses nomes já são cores e o
        // `shadow-*` aceita cor — a regra de cor venceria e apagaria o fio de luz.
        'painel-luz': 'inset 0 1px 0 var(--cc-fio-topo), var(--cc-sombra-painel)',
        'pop-luz': 'inset 0 1px 0 var(--cc-fio-topo), var(--cc-sombra-pop)',
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
