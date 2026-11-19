// As onze catracas de design da Sala escura (D-1115, E-069 H-06; DIRECAO §9.4).
// Cada uma é só dado: o que olhar, como contar e que exemplos provam a conta.
// O motor está em `catraca.ts`; a linha de base de cada uma, em `linhasDeBase/`.
//
// Esta lista é TRAVADA (testes-sao-contrato): arquivo isento ou permitido que
// entra aqui é decisão do dono, e vai no commit com `[unlock:...]`.
//
// `umPrimarioPorTela` não está aqui: conta botão no HTML da tela, não varre
// arquivo (ver `umPrimarioPorTela.test.ts` e `primariosDaTela.ts`).

import type { Definicao } from './catraca';

const CODIGO = /\.(tsx?|css)$/;
const TSX = /\.tsx$/;

/** O texto sem comentários: aviso em comentário não é uso. */
function semComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:\w'"`])\/\/[^\n]*/g, '');
}

const contarRegex = (rx: RegExp) => (texto: string) => (semComentarios(texto).match(rx) ?? []).length;

// ── estiloInline ───────────────────────────────────────────────────────────

/** Onde termina o objeto que abre em `texto[ini]` (a chave já aberta). -1 se não fecha. */
function fimDoObjeto(texto: string, ini: number): number {
  let prof = 0;
  let aspas = '';
  for (let i = ini; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '\\') i++;
      else if (c === aspas) aspas = '';
    } else if (c === "'" || c === '"' || c === '`') aspas = c;
    else if (c === '{') prof++;
    else if (c === '}' && --prof === 0) return i;
  }
  return -1;
}

/** Os textos de cada entrada de primeiro nível do objeto `{ ... }`. */
function entradasDoObjeto(corpo: string): string[] {
  const entradas: string[] = [];
  let prof = 0;
  let aspas = '';
  let inicio = 0;
  for (let i = 0; i < corpo.length; i++) {
    const c = corpo[i];
    if (aspas) {
      if (c === '\\') i++;
      else if (c === aspas) aspas = '';
    } else if (c === "'" || c === '"' || c === '`') aspas = c;
    else if ('{[('.includes(c)) prof++;
    else if ('}])'.includes(c)) prof--;
    else if (c === ',' && prof === 0) {
      entradas.push(corpo.slice(inicio, i));
      inicio = i + 1;
    }
  }
  entradas.push(corpo.slice(inicio));
  return entradas.map((e) => e.trim()).filter(Boolean);
}

const SO_VARIAVEL = /^['"]?--/;

/** Quantos `style={{ ... }}` têm alguma chave que não seja variável CSS (`--x`). */
export function contarEstiloInline(texto: string): number {
  const codigo = semComentarios(texto);
  let total = 0;
  for (const m of codigo.matchAll(/style=\{\{/g)) {
    const ini = (m.index ?? 0) + m[0].length - 1;
    const fim = fimDoObjeto(codigo, ini);
    if (fim < 0) continue;
    const entradas = entradasDoObjeto(codigo.slice(ini + 1, fim));
    if (entradas.some((e) => !SO_VARIAVEL.test(e))) total += 1;
  }
  return total;
}

// ── tokensLegados ──────────────────────────────────────────────────────────

// As variáveis curtas da camada `.ap` (upgrade.css): o vocabulário antigo.
const CURTAS =
  'accent2?|accent-soft|on-accent|inset|panel|solid|shadow|mute|mat|line2?|ink|hi|dim|bg|warn|warn-soft|ok|ok-soft|info|info-soft|err|err-soft|sel-on|sel-line|sel-ink|sel-bg|glass|sans|mono';
const LEGADOS = [
  /var\(--wb-/g,
  new RegExp(String.raw`var\(--(?:${CURTAS})[,)]`, 'g'),
  /var\(--(?:bg|surface|accent|text)-\d+/g,
  /\b(?:text|bg|border|ring|fill|stroke|from|to|via|divide|outline|decoration|placeholder|shadow|caret)-(?:bg-(?:500|600|700|800|900|950)|text-(?:100|200|300|400|500)|surface-[123]|accent-[2-7]00)\b/g,
];

// ── semTransicaoTotal ──────────────────────────────────────────────────────

const TRANSICAO_TOTAL = [
  /\btransition-all\b/g,
  // `all` sozinho ou no meio da lista (`opacity .2s, all .3s`).
  /\btransition(?:-property|Property)?\s*:\s*['"]?(?:[^;'"}]*,\s*)?all\b/g,
  // Sem propriedade (`transition: 200ms`) o padrão é `all`.
  /\btransition\s*:\s*['"]?[\d.]/g,
];
// `outline-none` só vale com o foco desenhado de outro jeito na mesma linha:
// `ring-0`, `outline-offset`, as cores que não pintam (`transparent`, `inherit`,
// `current`) e os modificadores sem cor (`inset`, estilos de traço) não desenham nada.
const FOCO_DESENHADO =
  /\b(?:ring|outline)-(?!(?:none|0|offset|transparent|inherit|current|inset|solid|dashed|dotted|double|hidden)\b)[\w[]/;

function contarOutlineSemPar(texto: string): number {
  return semComentarios(texto)
    .split('\n')
    .filter((l) => /\boutline-none\b|\boutline\s*:\s*['"]?(?:none|0)\b/.test(l) && !FOCO_DESENHADO.test(l)).length;
}

// ── fontesDoIndex ──────────────────────────────────────────────────────────

/** As famílias que o `index.html` pede ao Google Fonts. */
export function familiasDoIndex(html: string): string[] {
  return [...html.matchAll(/[?&]family=([^:&"]+)/g)].map((m) => decodeURIComponent(m[1]).replace(/\+/g, ' '));
}


const CORES_SOLTAS_CSS = [
  /\b(?:text|bg|border(?:-[xytrblse])?|ring(?:-offset)?|fill|stroke|from|to|via|outline|divide|placeholder|decoration|shadow|accent|caret)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-\d{2,3})?\b/g,
  /#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g,
  /\b(?:rgba?|hsla?|oklch|oklab)\(\s*[\d.]/g,
];

// ── as definições ──────────────────────────────────────────────────────────

const VIDEO = [
  /^src\/shared\/palco\//,
  /^src\/features\/shorts\/LegendaPrevia\.tsx$/,
  /^src\/features\/shorts\/DefinirPalcoModal\.tsx$/,
  /^src\/upgrade\/MolduraDeVideo\.tsx$/,
];
const DEFINE_TOKENS = [/^src\/styles\/tokens\.css$/, /^src\/index\.css$/];

export const DEFINICOES: Record<string, Definicao> = {
  estiloInline: {
    nome: 'estiloInline',
    porque: 'Use classe do Tailwind ou o componente; geometria de execução vai em variável CSS (`style={{ \'--p\': 42 }}`)',
    alvo: TSX,
    contar: contarEstiloInline,
    isentos: VIDEO,
    exemplos: [
      ['<div style={{ color: "red" }} />', 1],
      ['<div style={{ "--p": 42, \'--q\': 1 }} />', 0],
      ['<div style={{ "--p": 42, width: 3 }} />', 1],
      ['<i style={{ ...base, "--x": 1 }} /> <b style={{ a: f({ b: 1 }), c: 2 }} />', 2],
      ['<div style={estilo} /> // style={{ a: 1 }}', 0],
    ],
  },
  tokensLegados: {
    nome: 'tokensLegados',
    porque: 'Use os tokens `--cc-*` e as classes da Sala escura (tabela de-para da DIRECAO §9.2)',
    alvo: CODIGO,
    contar: (texto) => LEGADOS.reduce((soma, rx) => soma + contarRegex(rx)(texto), 0),
    exemplos: [
      ['color: var(--wb-text); background: var(--wb-bg-panel)', 2],
      ['background: var(--solid); color: var(--ink, #000); gap: var(--ok-x)', 2],
      ['className="bg-bg-900 text-text-100 hover:bg-surface-2 text-accent-400"', 4],
      ['className="bg-app text-fg border-fio" style="--bg-x: 1" /* var(--wb-x) */', 0],
    ],
  },
  caixaAlta: {
    nome: 'caixaAlta',
    porque: 'Sem caixa-alta como hierarquia: o peso e o tamanho da escala tipográfica fazem esse papel',
    alvo: CODIGO,
    contar: contarRegex(/\buppercase\b|\btextTransform\b|\btext-transform\b/g),
    exemplos: [
      ['className="text-xs uppercase tracking-wide"', 1],
      ["style={{ textTransform: 'uppercase' }}", 2],
      ['.x { text-transform: uppercase }', 2],
      ['const s = nome.toUpperCase();', 0],
    ],
  },
  vidroSoNaCasca: {
    nome: 'vidroSoNaCasca',
    porque: 'Vidro só pela classe `.cc-vidro-casca` (DIRECAO §3.6); o resto usa `bg-vidro` chapado ou `bg-painel-solido`',
    alvo: CODIGO,
    // Só o `index.css` define a casca; em qualquer outro arquivo, mesmo `.cc-vidro-casca {}` conta.
    contar: (texto, caminho) =>
      contarRegex(/backdrop-filter|backdropFilter|backdrop-blur/g)(
        caminho === 'src/index.css' ? texto.replace(/(^|[}\n])\s*\.cc-vidro-casca\s*\{[^}]*\}/g, '$1') : texto,
      ),
    exemplos: [
      ['className="bg-black/60 backdrop-blur-sm"', 1],
      ["style={{ backdropFilter: 'blur(3px)' }}", 1],
      ['a { backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px) }', 2],
      ['.cc-vidro-casca { backdrop-filter: blur(30px) } // backdrop-filter', 1],
      ['.outra, .cc-vidro-casca { backdrop-filter: blur(30px) }', 1],
    ],
  },
  feixeSoNoLugar: {
    nome: 'feixeSoNoLugar',
    porque: 'O feixe e o fio de luz têm lugar marcado (DIRECAO §3.1): botão primário, aba, mapa, trilha, agulha, h1',
    alvo: CODIGO,
    contar: contarRegex(/\b(?:bg-feixe|text-feixe)(?![\w-])|(?<!-)\bcc-fio(?![\w-])|--cc-feixe/g),
    // Nasce zerada. Os arquivos permitidos (button, tabs, mapa-da-live, TrilhaDeEtapas,
    // a agulha, ScreenHeader e os quatro cartões) entram aqui, um a um, com a história que os cria.
    // O botão e a aba são donos do feixe (DIRECAO §3.1): isentos por nome.
    // D-1137 (H-13): a trilha (bolinha da etapa atual) e o h1 do cabeçalho de tela.
    isentos: [
      ...DEFINE_TOKENS,
      /^src\/components\/ui\/(?:button|tabs|mapa-da-live)\.tsx$/,
      /^src\/upgrade\/(?:TrilhaDeEtapas|ScreenHeader)\.tsx$/,
    ],
    exemplos: [
      ['className="bg-feixe text-sobre-feixe"', 1],
      ['<h1><span className="text-feixe">live</span></h1> <Card className="cc-fio" />', 2],
      ['background: var(--cc-feixe-a)', 1],
      ['className="bg-feixe-x cc-fio-x"', 0],
      ['border: 1px solid var(--cc-fio); border-color: var(--cc-fio-2)', 0],
    ],
  },
  territorioDoCanal: {
    nome: 'territorioDoCanal',
    porque: 'A cor do canal só aparece no `avatar-do-canal` e em `luzDoCanal` (DIRECAO §4.2)',
    alvo: CODIGO,
    contar: contarRegex(/(?:--)?\b(?:cc-)?canal-[ab]\b/g),
    isentos: [/^src\/styles\/tokens\.css$/],
    exemplos: [
      ['border: 2px solid var(--cc-canal-a)', 1],
      ['className="bg-canal-a text-canal-b"', 2],
      ['id="canal-ativo" const canal-x', 0],
    ],
  },
  semTransicaoTotal: {
    nome: 'semTransicaoTotal',
    porque: 'Transicione só `transform`, `opacity`, cor e `box-shadow`; e não tire o contorno de foco sem desenhar outro',
    alvo: CODIGO,
    contar: (texto) => TRANSICAO_TOTAL.reduce((s, rx) => s + contarRegex(rx)(texto), 0) + contarOutlineSemPar(texto),
    exemplos: [
      ['className="transition-all duration-200"', 1],
      ['a { transition: all .2s } b { transition-property: all }', 2],
      ["style={{ transition: 'all 120ms' }}", 1],
      ['className="outline-none"', 1],
      ['className="outline-none focus-visible:ring-2"', 0],
      ['.x { outline: none }', 1],
      ['className="transition-colors"', 0],
      ['a { transition: 200ms } b { transition: opacity .2s, all .3s }', 2],
      ["style={{ outline: 'none' }}", 1],
      ['className="outline-none ring-0"', 1],
      ['className="outline-none outline-offset-2"', 1],
      ['className="outline-none focus-visible:outline-transparent"', 1],
      ['className="outline-none focus-visible:ring-transparent"', 1],
      ['className="outline-none focus-visible:outline-inherit"', 1],
      ['className="outline-none focus-visible:outline-current"', 1],
      ['className="outline-none focus-visible:outline-dashed"', 1],
      ['className="outline-none focus-visible:outline-foco"', 0],
      ['className="outline-none focus-visible:ring-2 focus-visible:ring-accent-500"', 0],
      ['className="outline-none focus-visible:outline-2 focus-visible:outline-accent-400"', 0],
      ['a { transition: opacity .2s ease }', 0],
    ],
  },
  fontesDoIndex: {
    nome: 'fontesDoIndex',
    porque: 'O `index.html` só pede Plus Jakarta Sans e JetBrains Mono; as fontes do vídeo carregam sob demanda',
    alvo: /^index\.html$/,
    contar: (html) => familiasDoIndex(html).length,
    exemplos: [
      ['href="https://fonts.googleapis.com/css2?family=Geist:wght@400&family=Geist+Mono:wght@500&display=swap"', 2],
      ['href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300..800&display=swap"', 1],
    ],
  },
  // Extensão da `corLiteral` (D-849), que só olha .ts e .tsx: o mesmo vocabulário nos .css.
  corLiteralCss: {
    nome: 'corLiteralCss',
    porque: 'Cor só por token `--cc-*`; o valor literal mora em `styles/tokens.css`',
    alvo: /\.css$/,
    contar: (texto) => CORES_SOLTAS_CSS.reduce((soma, rx) => soma + contarRegex(rx)(texto), 0),
    isentos: [/^src\/styles\/tokens\.css$/],
    exemplos: [
      ['a { color: #fff; background: #1a1a2e }', 2],
      ['a { color: rgb(1 2 3 / .5); border-color: oklch(0.5 0.1 20) }', 2],
      ['@apply text-red-400 bg-black/70', 2],
      ['a { color: var(--cc-fg) } /* #fff */', 0],
    ],
  },
  // Extensão da `pisoDeFonte` (D-859), que só barra o abaixo de 11 px: qualquer
  // tamanho em px escrito à mão ignora a escala (`text-micro`…`text-display`).
  fonteArbitraria: {
    nome: 'fonteArbitraria',
    porque: 'Use a escala `text-micro`, `text-pequeno`, `text-corpo`, `text-linha`, `text-secao`, `text-titulo` ou `text-display`',
    alvo: CODIGO,
    contar: contarRegex(/\btext-\[\d+(?:\.\d+)?(?:px|rem|em)\]/g),
    exemplos: [
      ['className="text-[9.5px] text-[13px] text-[1.1rem]"', 3],
      ['className="text-[length:var(--x)] text-[#fff] text-corpo"', 0],
    ],
  },
};
