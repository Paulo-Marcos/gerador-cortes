import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D-1191: as chaves antigas do Tailwind (`error`, `warning`, `success`, `warn`) saíram do
// `theme.colors`; uma classe que sobrou não gera CSS e some em silêncio (achado da pr-audit:
// `border-error/60`). A catraca `tokensLegados` não as procura, então este guarda as procura.
const RAIZ = resolve(__dirname, '../..');
const ANTIGA = /\b(?:bg|text|border|ring|fill|stroke|divide|outline|from|to|via|shadow|decoration)-(?:error|warning|success|warn)\b/g;

function fontes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = resolve(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : fontes(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const achados = fontes(RAIZ).flatMap((arquivo) => {
  const texto = readFileSync(arquivo, 'utf-8');
  return [...texto.matchAll(ANTIGA)].map((m) => `${relative(RAIZ, arquivo)}: ${m[0]}`);
});

describe('classes de cor antigas (D-1191)', () => {
  it('nenhuma classe usa as chaves error/warning/success/warn, que não geram mais CSS', () => {
    expect(achados).toEqual([]);
  });

  it('a regex acha o que procura', () => {
    expect('border-error/60 text-warn bg-success/10'.match(ANTIGA)).toHaveLength(3);
    expect('border-erro/60 text-aviso bg-ok/10'.match(ANTIGA)).toBeNull();
  });
});
