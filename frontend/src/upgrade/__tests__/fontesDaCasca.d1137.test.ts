import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D-1137 (E-069 H-13, com a H-05): a casca usa as fontes da Sala. O `index.html`
// deixou de carregar o Geist; se o `upgrade.css` ainda o citasse, a casca cairia
// em system-ui sem ninguém notar.
const css = readFileSync(resolve(__dirname, '../upgrade.css'), 'utf8');

describe('fontes da casca', () => {
  it('o upgrade.css não cita o Geist', () => {
    expect(css).not.toMatch(/Geist/i);
  });

  it('--sans e --mono leem as fontes do index.css, com a pilha do sistema de reserva', () => {
    expect(css).toMatch(/--sans: var\(--font-sans, [^;]*system-ui[^;]*\);/);
    expect(css).toMatch(/--mono: var\(--font-mono, [^;]*monospace\);/);
  });

  it('a casca não redefine --font-sans nem --font-mono (seriam um ciclo com --sans e --mono)', () => {
    expect(css).not.toMatch(/--font-sans:\s*var\(--sans\)/);
    expect(css).not.toMatch(/--font-mono:\s*var\(--mono\)/);
  });
});
