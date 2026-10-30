import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D-999: o voto do corte (D-419) e o da live (D-372) saíram. Gerar o bruto não
// abre mais pergunta nenhuma, e o cliente gerado não conhece as rotas do voto.
const SRC = resolve(__dirname, '../../..');
const ler = (caminho: string) => readFileSync(resolve(SRC, caminho), 'utf-8');

function fontes(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return nome === '__tests__' ? [] : fontes(caminho);
    return /\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

describe('o voto saiu do fluxo', () => {
  it('a 1ª geração do bruto não abre avaliação', () => {
    const editor = ler('features/editor/useEditorPage.tsx');
    const inicio = editor.indexOf('const handleGerarBrutoInicial');
    const corpo = editor.slice(inicio, editor.indexOf('};', inicio));
    expect(inicio).toBeGreaterThan(-1);
    expect(corpo).toContain('dispararBruto(undefined)');
    expect(corpo).not.toMatch(/avalia/i);
  });

  it('nenhuma tela usa o modal ou o cliente do voto', () => {
    const usam = fontes(SRC).filter((arquivo) =>
      /AvaliacaoCorteModal|avaliacaoCorteApi|voto-qualidade|avaliacao-cortes/.test(
        readFileSync(arquivo, 'utf-8'),
      ),
    );
    expect(usam).toEqual([]);
  });
});
