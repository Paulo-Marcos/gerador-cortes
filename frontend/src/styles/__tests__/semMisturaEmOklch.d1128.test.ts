// D-1128 (E-069 H-03): nenhuma cor do app se mistura nem se recalcula em oklch.
// Medido no Chrome 157 (18/11), na máquina do operador: sobre um hex quase neutro, como
// `--cc-painel-solido` (#0c0e13), `color-mix(in oklch, …)` e `oklch(from … l c h)` perdem
// o matiz (`oklch(0.164 0.011 none)`) e pintam com matiz 0. O pixel sai 18,12,14 em vez de
// 12,14,19: o cartão de Metadados no escuro ficava marrom avermelhado. `in oklab` sai
// 12,14,19. Com a ponte, toda superfície antiga é um desses neutros, então a regra vale
// para o `src` inteiro, e não só para os cinzas: zero exceções.
import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const raiz = resolve(__dirname, '../..');

function fontes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const caminho = resolve(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : fontes(caminho);
    return /\.(tsx?|css)$/.test(e.name) ? [caminho] : [];
  });
}

/** `color-mix(in oklch` (CSS ou classe do Tailwind, com `_`) e `oklch(from`. */
const MISTURA_EM_OKLCH = /color-mix\(\s*in[_\s]+oklch\b|oklch\(\s*from\b/g;

// Na montagem da suíte, como as outras varreduras (D-875): dentro do `it` ela concorria
// com o limite de 5 s num disco frio.
const achados = fontes(raiz).flatMap((arquivo) => {
  const texto = readFileSync(arquivo, 'utf-8');
  return [...texto.matchAll(MISTURA_EM_OKLCH)].map(
    (m) => `${relative(raiz, arquivo).replace(/\\/g, '/')}:${texto.slice(0, m.index).split('\n').length}`,
  );
});

describe('cor não se mistura em oklch', () => {
  it('a regra reconhece as três formas', () => {
    const exemplos = [
      'bg-[color-mix(in_oklch,var(--wb-bg-card)_88%,var(--wb-bg-panel))]',
      "background: 'color-mix(in oklch, var(--wb-warn) 20%, transparent)'",
      '--bg: oklch(from var(--cc-bg) l c h);',
    ];
    expect(exemplos.map((e) => (e.match(MISTURA_EM_OKLCH) ?? []).length)).toEqual([1, 1, 1]);
    expect('color-mix(in oklab, var(--accent) 30%, transparent)'.match(MISTURA_EM_OKLCH)).toBeNull();
  });

  it('nenhum arquivo de frontend/src mistura cor em oklch', () => {
    expect(achados).toEqual([]);
  });
});
