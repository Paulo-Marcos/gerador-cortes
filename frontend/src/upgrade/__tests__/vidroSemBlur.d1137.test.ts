import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D-1137 (DIRECAO §3.6): o vidro da casca desfoca por variável, e a sala a apaga.
const css = readFileSync(resolve(__dirname, '../../index.css'), 'utf8');
const bloco = (seletor: string) => {
  const i = css.indexOf(`${seletor} {`);
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1);
};

describe('vidro da casca sem blur', () => {
  it('o .cc-vidro-casca lê o fundo e o desfoque de variáveis, com o vidro como padrão', () => {
    const vidro = bloco('.cc-vidro-casca');
    expect(vidro).toContain('background: var(--cc-casca-fundo, var(--cc-painel));');
    expect(vidro).toContain('backdrop-filter: var(--cc-casca-desfoque, blur(30px) saturate(1.5));');
  });

  it('data-vidro="0" troca o vidro pelo painel sólido e zera o desfoque', () => {
    const sem = bloco("[data-vidro='0']");
    expect(sem).toContain('--cc-casca-fundo: var(--cc-painel-solido);');
    expect(sem).toContain('--cc-casca-desfoque: none;');
  });

  it('a transparência reduzida do sistema também zera o desfoque', () => {
    const i = css.indexOf('@media (prefers-reduced-transparency: reduce)');
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, i + 200)).toContain('--cc-casca-desfoque: none;');
  });
});
