// D-1181: o Tailwind só gera a classe com modificador de opacidade que está na
// escala (a padrão mais o `extend.opacity` do config). Um `/13` fora dela não
// gera CSS e o fundo some em silêncio, sem erro de build. Esta catraca varre os
// fontes pelo git (como as outras) e reprova qualquer `/N` que o config não conhece.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import config from '../../../../tailwind.config';

const RAIZ_DO_FRONTEND = fileURLToPath(new URL('../../../../', import.meta.url));

// Utilitários de cor que aceitam modificador `/N`. Só o prefixo de classe conta:
// `RN-12/13` em comentário não é classe.
const CLASSE_COM_MODIFICADOR =
  /(?<=[\s"'`])(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline|shadow|placeholder|decoration|accent|caret|fg)(?:-[a-z0-9]+)+\/(\d+)(?![\d\]])/g;

function escalaDeOpacidade(): Set<string> {
  // Escala padrão do Tailwind 3: 0, 5, 10 … 100.
  const padrao = Array.from({ length: 21 }, (_, i) => String(i * 5));
  const extend = (config.theme?.extend ?? {}) as { opacity?: Record<string, unknown> };
  return new Set([...padrao, ...Object.keys(extend.opacity ?? {})]);
}

function fontesTs(): string[] {
  return execFileSync('git', ['ls-files', '--', 'src'], { cwd: RAIZ_DO_FRONTEND, encoding: 'utf8' })
    .split('\n')
    .filter((arquivo) => /\.(ts|tsx)$/.test(arquivo))
    .filter((arquivo) => !arquivo.endsWith('opacidadeArbitraria.test.ts'));
}

function usosDeOpacidade(): { arquivo: string; linha: number; classe: string; n: string }[] {
  const usos: { arquivo: string; linha: number; classe: string; n: string }[] = [];
  for (const arquivo of fontesTs()) {
    readFileSync(RAIZ_DO_FRONTEND + arquivo, 'utf8')
      .split('\n')
      .forEach((texto, indice) => {
        for (const m of texto.matchAll(CLASSE_COM_MODIFICADOR)) {
          usos.push({ arquivo, linha: indice + 1, classe: m[0], n: m[1] });
        }
      });
  }
  return usos;
}

describe('modificador de opacidade está na escala do Tailwind (D-1181)', () => {
  it('encontra os usos de opacidade do fonte (a varredura enxerga o código)', () => {
    expect(usosDeOpacidade().length).toBeGreaterThan(0);
  });

  it('nenhum /N de classe fica fora da escala padrão mais o extend', () => {
    const escala = escalaDeOpacidade();
    const fora = usosDeOpacidade().filter((u) => !escala.has(u.n));
    expect(fora).toEqual([]);
  });
});
