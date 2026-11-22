// D-1113 (E-069 H-02): os tokens da Sala escura (D-1111 §4.1 e §8.1).
// Dois contratos: (1) escuro e claro declaram o MESMO conjunto de nomes — um token
// que existe só num tema deixaria o outro herdar valor nenhum; (2) os pares de texto
// e fundo da tabela de contraste da §8.1 passam o piso do WCAG AA, medidos sobre os
// valores que de fato estão no CSS (não sobre números copiados da tabela).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config';

const css = readFileSync(resolve(__dirname, '../tokens.css'), 'utf-8');

type Tema = Record<string, string>;

function bloco(seletor: string): Tema {
  const i = css.indexOf(seletor);
  if (i < 0) throw new Error(`bloco ausente: ${seletor}`);
  const corpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  const tema: Tema = {};
  for (const m of corpo.matchAll(/(--cc-[\w-]+)\s*:\s*([^;]+);/g)) tema[m[1]] = m[2].trim();
  return tema;
}

const escuro = bloco(":root[data-theme='dark']");
const claro = bloco(":root[data-theme='light']");

type Rgba = [number, number, number, number];

function cor(valor: string): Rgba {
  const hex = valor.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = valor.match(/^rgba?\(([^)]+)\)$/);
  if (!rgba) throw new Error(`cor não suportada: ${valor}`);
  const [r, g, b, a = '1'] = rgba[1].split(',').map((p) => p.trim());
  return [Number(r), Number(g), Number(b), Number(a)];
}

// Composição de `frente` sobre `fundo` opaco.
function sobre(frente: Rgba, fundo: Rgba): Rgba {
  const a = frente[3];
  return [0, 1, 2].map((k) => frente[k] * a + fundo[k] * (1 - a)).concat(1) as Rgba;
}

function luminancia([r, g, b]: Rgba): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contraste(a: Rgba, b: Rgba): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('tokens da Sala escura', () => {
  it('os dois temas declaram o mesmo conjunto de tokens', () => {
    expect(Object.keys(claro).sort()).toEqual(Object.keys(escuro).sort());
  });

  it('declara os tokens que o Tailwind e a §4.1 citam', () => {
    for (const nome of ['--cc-bg', '--cc-painel', '--cc-painel-solido', '--cc-fg', '--cc-iris', '--cc-feixe-a', '--cc-foco', '--cc-sombra-pop']) {
      expect(escuro[nome], nome).toBeTruthy();
    }
  });

  it('não declara fonte (mudaria a tela atual; é da H-05)', () => {
    expect(css).not.toMatch(/--font-[\w-]+\s*:/);
  });
});

// Fundos de referência da §8.1. "aurora forte" é o pior caso real, medido na direção.
const AURORA_FORTE = { escuro: '#221f2b', claro: '#d9d6ea' };

function medir(nome: 'escuro' | 'claro') {
  const t = nome === 'escuro' ? escuro : claro;
  const v = (k: string) => cor(t[`--cc-${k}`]);
  const bg = v('bg');
  const painel = sobre(v('painel'), bg);
  const vidro2 = sobre(v('vidro-2'), painel);
  const vidro3 = sobre(v('vidro-3'), painel);
  const pop = sobre(v('pop'), bg);
  const aurora = cor(AURORA_FORTE[nome]);
  const seloSobre = (token: string) => sobre([...v(token).slice(0, 3), 0.13] as Rgba, painel);
  return { v, bg, painel, vidro2, vidro3, pop, aurora, seloSobre };
}

describe.each(['escuro', 'claro'] as const)('contraste AA (§8.1) — tema %s', (nome) => {
  const m = medir(nome);
  const AA = 4.5;
  const exige = (frente: Rgba, fundo: Rgba, piso: number, rotulo: string) =>
    expect(contraste(frente, fundo), rotulo).toBeGreaterThanOrEqual(piso);

  it('fg, fg-2 e fg-3 sobre bg, painel e aurora forte', () => {
    for (const t of ['fg', 'fg-2', 'fg-3']) {
      for (const [n, f] of [['bg', m.bg], ['painel', m.painel], ['aurora', m.aurora]] as const) {
        exige(sobre(m.v(t), f), f, AA, `${t}/${n}`);
      }
    }
  });

  it('fg, fg-2 e fg-3 sobre vidro-3; fg e fg-3 sobre pop (escuro)', () => {
    if (nome === 'claro') return; // a §8.1 só mede estes pares no escuro
    for (const t of ['fg', 'fg-2', 'fg-3']) exige(m.v(t), m.vidro3, AA, `${t}/vidro-3`);
    for (const t of ['fg', 'fg-3']) exige(m.v(t), m.pop, AA, `${t}/pop`);
  });

  it('íris sobre painel e aurora forte; sobre vidro-2 no escuro', () => {
    exige(m.v('iris'), m.painel, AA, 'iris/painel');
    exige(m.v('iris'), m.aurora, AA, 'iris/aurora');
    if (nome === 'escuro') exige(m.v('iris'), m.vidro2, AA, 'iris/vidro-2');
  });

  it('texto sobre o feixe, a íris e o erro cheio', () => {
    for (const c of ['a', 'b', 'c']) exige(m.v('sobre-feixe'), m.v(`feixe-${c}`), AA, `sobre-feixe/${c}`);
    exige(m.v('sobre-iris'), m.v('iris'), AA, 'sobre-iris/iris');
    exige(m.v('sobre-erro'), m.v('erro-cheio'), AA, 'sobre-erro/erro-cheio');
  });

  it('cores de estado sobre o painel e dentro do selo (cor a 13%)', () => {
    for (const e of ['ok', 'aviso', 'erro', 'info']) {
      exige(m.v(e), m.painel, AA, `${e}/painel`);
      exige(m.v(e), m.seloSobre(e), AA, `${e}/selo`);
    }
  });

  it('fire é glifo (piso 3:1) e a borda de controle também', () => {
    exige(m.v('fire'), m.painel, 3, 'fire/painel');
    exige(sobre(m.v('fio-campo'), m.painel), m.painel, 3, 'fio-campo/painel');
    exige(sobre(m.v('fio-campo'), m.bg), m.bg, 3, 'fio-campo/bg');
  });

  it('painel-solido é o painel composto sobre o bg', () => {
    const solido = m.v('painel-solido');
    const esperado = m.painel.map(Math.round);
    const real = solido.slice(0, 3);
    real.forEach((c, k) => expect(Math.abs(c - esperado[k]), `canal ${k}`).toBeLessThanOrEqual(1));
  });
});

describe('o número escuro no corte pronto (fg a 88%)', () => {
  it('passa AA sobre o painel escuro', () => {
    const m = medir('escuro');
    const num = m.bg; // número escuro = bg sobre a pílula fg a 88%
    const pilula = sobre([...m.v('fg').slice(0, 3), 0.88] as Rgba, m.painel);
    expect(contraste(num, pilula)).toBeGreaterThanOrEqual(4.5);
  });
});

describe('chaves do Tailwind', () => {
  // `shadow-<nome>` aceita sombra E cor: se a chave existe nos dois mapas, o Tailwind
  // gera duas regras e a de cor vence, apagando o fio de luz da sombra.
  it('nenhuma chave de sombra repete uma chave de cor', () => {
    const ext = config.theme?.extend as Record<string, Record<string, unknown>>;
    const cores = new Set(Object.keys(config.theme?.colors as Record<string, unknown>));
    const colisoes = Object.keys(ext.boxShadow).filter((k) => cores.has(k));
    expect(colisoes).toEqual([]);
  });
});
