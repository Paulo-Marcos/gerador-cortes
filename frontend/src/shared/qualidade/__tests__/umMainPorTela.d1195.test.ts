import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { arquivosRastreados } from './catraca';

// D-1195 (E-069 H-25; DIRECAO §8.2 Semântica): a casca já desenha o `<main id="conteudo">`,
// alvo do "Pular para o conteúdo". A auditoria achou cinco telas (Configurações, Metadados,
// Curadoria, Prateleira e Prontos) com um segundo `<main>` dentro dele: dois marcos
// "principal" aninhados, e o leitor de tela não sabe qual é o conteúdo.
// Só a casca e o kit (que vive fora da casca, em /upgrade/kit) desenham `<main>`.

const DONOS = new Set(['src/upgrade/UpgradeShell.tsx', 'src/upgrade/UpgradeKitPage.tsx']);

describe('um <main> por tela', () => {
  it('nenhuma tela dentro da casca desenha outro <main>', () => {
    const intrusos = arquivosRastreados()
      .filter((c) => c.endsWith('.tsx') && !DONOS.has(c))
      .filter((c) => /<main[\s>]/.test(readFileSync(c, 'utf8')));
    expect(intrusos).toEqual([]);
  });

  it('a casca continua com o seu <main id="conteudo">', () => {
    expect(readFileSync('src/upgrade/UpgradeShell.tsx', 'utf8')).toMatch(/<main id="conteudo"/);
  });
});
