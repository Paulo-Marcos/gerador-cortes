// D-1128 (E-069 H-03): a ponte das camadas antigas para os tokens da Sala escura.
// Contrato: toda variável antiga de cor (index.css `:root`, upgrade.css e
// upgrade-temas.css na `.ap`) chega, seguindo os `var()`, a UM `--cc-*` — o da tabela
// de-para da DIRECAO.md §9.2 —, que existe nos dois temas; nenhuma fica com cor
// literal nem sem destino. E o tema das telas é decidido pelos `--cc-*`, não por um
// bloco de tema que redeclare a cor antiga.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ler = (relativo: string) =>
  readFileSync(resolve(__dirname, relativo), 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '');

const index = ler('../../index.css');
const casca = ler('../../upgrade/upgrade.css') + ler('../../upgrade/upgrade-temas.css');
const tokens = ler('../tokens.css');

type Bloco = { seletor: string; decl: Map<string, string> };

/** Blocos mais internos `seletor { … }` com as declarações `--nome: valor`. */
function blocos(css: string): Bloco[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    seletor: m[1].trim().replace(/\s+/g, ' '),
    decl: new Map([...m[2].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((d) => [d[1], d[2].trim()])),
  }));
}

function juntar(lista: Bloco[]): Map<string, string> {
  return new Map(lista.flatMap((b) => [...b.decl]));
}

// Fonte e raio não são cor: saem pelas histórias da fonte (H-05) e da forma (telas).
const naoECor = /^--(font-|sans$|mono$|radius|r\d$)/;
const deCor = (m: Map<string, string>) => new Map([...m].filter(([nome]) => !nome.startsWith('--cc-') && !naoECor.test(nome)));

const raiz = deCor(juntar(blocos(index).filter((b) => b.seletor === ':root')));
const ap = deCor(juntar(blocos(casca).filter((b) => b.seletor === '.ap' || b.seletor === ':root')));

const ccEscuro = new Set(blocos(tokens).find((b) => b.seletor.includes(":root[data-theme='dark']"))!.decl.keys());
const seletorClaro = blocos(tokens).find((b) => b.seletor.includes(":root[data-theme='light']"))!.seletor;
const ccClaro = new Set(blocos(tokens).find((b) => b.seletor === seletorClaro)!.decl.keys());

/** A tabela de-para da §9.2, do lado de cada variável antiga declarada. */
const DE_PARA: Record<string, string> = {
  ...para('--cc-bg', '--wb-bg', '--bg', '--bg-950'),
  ...para('--cc-painel-solido', '--wb-bg-panel', '--wb-bg-card', '--solid', '--panel', '--bg-900', '--surface-1'),
  ...para('--cc-vidro-2', '--wb-bg-card-elev', '--wb-pill-bg', '--surface-2'),
  ...para('--cc-poco', '--wb-bg-inset', '--wb-bg-strip', '--inset', '--mat', '--bg-800', '--surface-3'),
  ...para('--cc-vidro-3', '--sel-bg'),
  ...para('--cc-fio-2', '--wb-border', '--line', '--bg-600', '--border', '--moldura'),
  ...para('--cc-fio', '--wb-border-soft', '--line2', '--bg-700'),
  ...para('--cc-fio-campo', '--border-hover', '--sel-line'),
  ...para('--cc-fg', '--wb-text', '--wb-ink', '--ink', '--sel-ink', '--text-100', '--text-500'),
  ...para('--cc-fg-2', '--wb-text-mute', '--mute', '--text-200'),
  ...para('--cc-fg-3', '--wb-text-dim', '--wb-text-faint', '--dim', '--text-300', '--text-400', '--bg-500'),
  ...para('--cc-iris', '--wb-accent', '--accent', '--accent-400', '--accent-500', '--accent-600', '--border-accent'),
  ...para('--cc-iris-2', '--wb-accent-strong', '--accent2', '--accent-200', '--accent-700'),
  ...para('--cc-iris-suave', '--wb-accent-soft', '--accent-soft', '--accent-300'),
  ...para('--cc-sobre-iris', '--wb-accent-fg', '--on-accent', '--wb-ink-fg', '--sel-on'),
  ...para('--cc-ok', '--wb-ok', '--wb-ok-soft', '--wb-ok-ink', '--ok', '--ok-soft', '--success', '--tint-aprovado', '--tint-aprovado-soft'),
  ...para('--cc-aviso', '--wb-warn', '--wb-warn-soft', '--wb-warn-ink', '--warn', '--warn-soft', '--warning'),
  ...para('--cc-erro', '--wb-err', '--wb-err-soft', '--wb-err-ink', '--wb-danger', '--wb-danger-ink', '--err', '--err-soft', '--error', '--tint-rejeitado', '--tint-rejeitado-soft'),
  ...para('--cc-info', '--wb-info', '--wb-info-soft', '--info', '--info-soft', '--wb-violet', '--wb-violet-soft', '--wb-leitura', '--wb-leitura-soft', '--tint-leitura', '--tint-leitura-soft'),
  // O fogo é só glifo; onde era fundo, vira vidro.
  ...para('--cc-fire', '--wb-fire'),
  ...para('--cc-vidro-2', '--wb-fire-soft', '--tint-fire', '--tint-fire-soft'),
  // Cartão: só o brilho de 1 px no topo; o que flutua: a sombra difusa.
  ...para('--cc-fio-topo', '--wb-shadow', '--wb-shadow-btn', '--shadow', '--hi', '--shadow-sm', '--shadow-md'),
  ...para('--cc-sombra-pop', '--shadow-lg'),
  // O anel dos controles antigos é o anel da Sala (§3.4).
  ...para('--cc-foco', '--wb-focus', '--accent-glow'),
};

/** O que a §9.2 manda sair: fica com o valor neutro, sem cor nenhuma. */
const SAI: Record<string, string> = { '--glass': 'none' };

function para(token: string, ...antigas: string[]): Record<string, string> {
  return Object.fromEntries(antigas.map((a) => [a, token]));
}

// Mesma régua da catraca `corLiteralCss`: `oklch(from var(--cc-…) l c h)` não é literal.
const corLiteral = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch)\(\s*[\d.]/i;

/** Segue os `var()` até os `--cc-*`; reprova cor literal e variável sem declaração. */
function destino(nome: string, mapa: Map<string, string>, caminho: string[] = []): string[] {
  const valor = mapa.get(nome) ?? raiz.get(nome);
  if (valor === undefined) throw new Error(`${[...caminho, nome].join(' → ')} não está declarada`);
  if (corLiteral.test(valor)) throw new Error(`${[...caminho, nome].join(' → ')} tem cor literal: ${valor}`);
  if (caminho.includes(nome)) throw new Error(`ciclo: ${[...caminho, nome].join(' → ')}`);
  return [...valor.matchAll(/var\((--[\w-]+)/g)].flatMap(([, ref]) =>
    ref.startsWith('--cc-') ? [ref] : destino(ref, mapa, [...caminho, nome]),
  );
}

describe('cada variável antiga resolve para o --cc-* da tabela de-para', () => {
  it('as listas foram lidas', () => {
    expect(raiz.size).toBeGreaterThan(60);
    expect(ap.size).toBeGreaterThan(80);
  });

  it('nenhuma variável antiga declarada fica fora da tabela', () => {
    const declaradas = new Set([...raiz.keys(), ...ap.keys()]);
    const semDestino = [...declaradas].filter((nome) => !(nome in DE_PARA) && !(nome in SAI));
    expect(semDestino).toEqual([]);
  });

  it.each(Object.entries(DE_PARA))('%s → %s, no :root e na casca', (antiga, token) => {
    if (raiz.has(antiga)) expect(new Set(destino(antiga, raiz))).toEqual(new Set([token]));
    expect(new Set(destino(antiga, ap))).toEqual(new Set([token]));
  });

  it.each(Object.entries(DE_PARA))('%s: o destino %s existe nos dois temas', (_antiga, token) => {
    expect(ccEscuro.has(token)).toBe(true);
    expect(ccClaro.has(token)).toBe(true);
  });

  // Uma variável se resolve onde é declarada (D-841): a que só existisse no :root
  // congelaria o tema do <html> dentro da casca.
  it('toda variável antiga do :root também é declarada na casca', () => {
    expect([...raiz.keys()].filter((nome) => !ap.has(nome))).toEqual([]);
  });

  // Medido no Chrome 157 (18/11): `color-mix(in oklch, …)` e `oklch(from … l c h)` sobre
  // um hex quase neutro, como `--cc-painel-solido` (#0c0e13), perdem o matiz
  // (`oklch(0.164 0.011 none)`) e pintam com matiz 0: o pixel sai 18,12,14 em vez de
  // 12,14,19 — o cinza azulado vira marrom avermelhado. Em oklab, sai 12,14,19.
  it('a ponte não mistura nem recalcula cor em oklch', () => {
    const semComentario = index + casca;
    expect(semComentario.match(/color-mix\(in oklch|oklch\(from/g) ?? []).toEqual([]);
  });

  it.each(Object.entries(SAI))('%s sai: vale %s', (nome, valor) => {
    expect(ap.get(nome)).toBe(valor);
  });
});

describe('o tema vem dos --cc-*', () => {
  const variantes = [...blocos(index), ...blocos(casca)].filter((b) =>
    /\[data-theme|\[data-wb-theme|\[data-glass|wb-palette/.test(b.seletor),
  );

  it('nenhum bloco de tema, vidro ou paleta redeclara cor antiga', () => {
    const comCor = variantes.filter((b) => [...b.decl.keys()].some((nome) => !naoECor.test(nome)));
    expect(comCor.map((b) => b.seletor)).toEqual([]);
  });

  it('tokens.css não tem :has: o tema vem do <html>', () => {
    expect(seletorClaro).not.toMatch(/:has\(|\.ap:is\(/);
  });

  it('o <html> nasce sem tema de paleta antiga', () => {
    const html = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');
    expect(html.match(/<html[^>]*data-theme="([^"]+)"/)?.[1]).toBe('dark');
  });

  it('o fundo da casca é sólido: sem degradê, na cor do fundo', () => {
    const corpo = casca.slice(casca.indexOf('.ap {'), casca.indexOf('}', casca.indexOf('.ap {')));
    expect(corpo).not.toMatch(/background-image/);
    expect(corpo).toMatch(/background-color:\s*var\(--bg\)/);
    expect(destino('--panel', ap)).toEqual(['--cc-painel-solido']);
  });
});
