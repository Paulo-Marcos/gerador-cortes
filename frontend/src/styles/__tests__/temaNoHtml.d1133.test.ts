import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ler = (rel: string) => readFileSync(resolve(__dirname, rel), 'utf-8');
const tokens = ler('../tokens.css');
const html = ler('../../../index.html');

describe('o tema mora no <html> (D-1133)', () => {
  it('tokens.css não depende mais do data-theme da casca (sem :has)', () => {
    expect(tokens).not.toMatch(/:has\(/);
    expect(tokens).not.toMatch(/\.ap:is\(/);
  });

  it('o color-scheme acompanha cada tema', () => {
    expect(tokens).toMatch(/:root,\s*:root\[data-theme='dark'\]\s*\{\s*color-scheme:\s*dark/);
    expect(tokens).toMatch(/:root\[data-theme='light'\]\s*\{\s*color-scheme:\s*light/);
  });

  it('o <html> nasce em dark, sem resto de paleta antiga', () => {
    expect(html).toMatch(/<html[^>]*data-theme="dark"/);
  });

  it('o theme-color nasce com o fundo do escuro', () => {
    expect(html).toMatch(/<meta name="theme-color" content="#07080b"/);
  });

  it('nenhum tema antigo sobrou nas telas', () => {
    const css = ler('../../upgrade/upgrade.css') + ler('../../index.css');
    expect(css).not.toMatch(/\[data-theme='(papel|nevoa|ardosia)'\]/);
  });
});
