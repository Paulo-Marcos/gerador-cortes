import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FAMILIAS_DO_RENDER } from '../fontesDoRender';

// D-1139: a interface fala Plus Jakarta Sans e JetBrains Mono; o vídeo pede as suas só quando precisa.
const raiz = join(__dirname, '..', '..', '..');
const html = readFileSync(join(raiz, 'index.html'), 'utf8');
const css = readFileSync(join(raiz, 'src', 'index.css'), 'utf8');

describe('fontes da interface', () => {
  it('o index.html não carrega nenhuma fonte do vídeo', () => {
    for (const familia of FAMILIAS_DO_RENDER) {
      expect(html, familia).not.toContain(familia.replace(/ /g, '+'));
    }
  });

  it('o index.html pede Plus Jakarta Sans 300 a 800 e JetBrains Mono 400 e 500', () => {
    expect(html).toContain('family=Plus+Jakarta+Sans:wght@300..800');
    expect(html).toContain('family=JetBrains+Mono:wght@400;500');
  });

  it('--font-sans e --font-mono apontam para elas, sem a paleta antiga', () => {
    expect(css).toMatch(/--font-sans:\s*'Plus Jakarta Sans'/);
    expect(css).toMatch(/--font-mono:\s*'JetBrains Mono'/);
    expect(css).not.toMatch(/--font-sans:[^;]*(DM Sans|Inter|Geist)/);
  });
});
