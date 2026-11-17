import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D-1122 (E-069 H-11b) · DIRECAO §3.6: o desfoque é da casca. O que flutua abre em
// qualquer tela, inclusive sobre o vídeo tocando, e tem fundo quase sólido (`bg-pop`).
const ARQUIVOS = [
  'dialog.tsx',
  'menu.tsx',
  'popover.tsx',
  'tooltip.tsx',
  'toaster.tsx',
  'modal.tsx',
  'confirm-dialog.tsx',
  'overflow-menu.tsx',
  'superficie-flutuante.ts',
];

describe('o que flutua não usa backdrop-filter', () => {
  it.each(ARQUIVOS)('%s', (arquivo) => {
    const codigo = readFileSync(resolve(__dirname, '..', arquivo), 'utf8');
    expect(codigo.replace(/\/\/[^\n]*/g, '')).not.toMatch(/backdrop-?(filter|blur)/i);
  });
});
