// D-1127 (E-069 H-11c) · A luz do canal: as duas cores do anel do avatar (DIRECAO §4.2).
//
// Função pura. A ordem das fontes é a regra do produto, não detalhe:
//   1. a paleta cadastrada no canal (`secundaria` e `acento`);
//   2. a amostra das capas, o campo `luz` do canal (backend, D-1130);
//   3. nada: anel neutro (`cc-vidro-3`), que o avatar desenha quando recebe `null`.
// Na PROD a paleta está vazia, então hoje vale (2) ou (3).
//
// A cor sai em OKLCH com a luminosidade travada (≥ 0,78 no escuro, ≤ 0,62 no claro): é o que
// faz o anel dar 3:1 sobre o painel com QUALQUER cor cadastrada, sem o operador precisar acertar.

export type TemaDaLuz = 'escuro' | 'claro';

export interface LuzDoCanal {
  /** `oklch(L C H)` pronto para `var()` no elemento do avatar. */
  a: string;
  b: string;
}

export interface FontesDaLuz {
  paleta?: { secundaria?: string | null; acento?: string | null } | null;
  /** Duas cores amostradas das capas (hex), quando o backend as servir. */
  amostra?: { a?: string | null; b?: string | null } | null;
}

export const LUMINOSIDADE_MINIMA_NO_ESCURO = 0.78;
export const LUMINOSIDADE_MAXIMA_NO_CLARO = 0.62;

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

function hexParaRgb(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const linear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** sRGB (0-1) → OKLCH, pelas matrizes de Björn Ottosson. H em graus. */
function rgbParaOklch([r, g, b]: [number, number, number]): { l: number; c: number; h: number } {
  const [lr, lg, lb] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const h = (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: Math.hypot(A, B), h: h < 0 ? h + 360 : h };
}

/** Trava a luminosidade do tema. Croma e matiz ficam: a cor continua sendo a do canal. */
export function travarLuminosidade(hex: string, tema: TemaDaLuz): string | null {
  const rgb = hexParaRgb(hex);
  if (!rgb) return null;
  const { l, c, h } = rgbParaOklch(rgb);
  const luminosidade =
    tema === 'escuro' ? Math.max(l, LUMINOSIDADE_MINIMA_NO_ESCURO) : Math.min(l, LUMINOSIDADE_MAXIMA_NO_CLARO);
  // Cinza (croma ~0) não tem matiz: 0 evita um NaN/ruído no CSS.
  const matiz = c < 0.002 ? 0 : h;
  return `oklch(${luminosidade.toFixed(3)} ${c.toFixed(3)} ${matiz.toFixed(1)})`;
}

function doPar(x: string | null | undefined, y: string | null | undefined, tema: TemaDaLuz): LuzDoCanal | null {
  const a = x ? travarLuminosidade(x, tema) : null;
  const b = y ? travarLuminosidade(y, tema) : null;
  // Uma cor só vale pelas duas: um anel de uma cor é melhor do que cair para o neutro.
  if (!a && !b) return null;
  return { a: (a ?? b) as string, b: (b ?? a) as string };
}

export function luzDoCanal(fontes: FontesDaLuz, tema: TemaDaLuz): LuzDoCanal | null {
  return (
    doPar(fontes.paleta?.secundaria, fontes.paleta?.acento, tema) ??
    doPar(fontes.amostra?.a, fontes.amostra?.b, tema)
  );
}

/** O pedaço do `Canal` que a luz lê: a paleta cadastrada e o `luz` que o backend amostra das capas. */
export interface CanalComLuz {
  paleta?: { secundaria?: string | null; acento?: string | null } | null;
  luz?: readonly string[] | null;
}

/** Fonte 2 vem do `luz` do canal (`[]` = sem capa = sem amostra). */
export function luzDoCanalDe(canal: CanalComLuz | null | undefined, tema: TemaDaLuz): LuzDoCanal | null {
  if (!canal) return null;
  const [a, b] = canal.luz ?? [];
  return luzDoCanal({ paleta: canal.paleta, amostra: { a, b } }, tema);
}
