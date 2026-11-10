import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-1092, decisão do Paulo na auditoria: "Só em Cortes". O BancadaChrome é a
// casca da etapa Cortes (editor), da Pós e da Revisão. Nas três o riscado some da
// lista e do J/K. A seção Riscados, com o "Trazer de volta", só aparece em Cortes:
// trazer de volta é curadoria, e o corte volta sem bruto. Quem liga a seção é o
// `riscar`, que só a etapa Cortes passa.

let publicado: Chrome | null = null;
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));

const { BancadaChrome } = await import('../BancadaChrome');

const corteDe = (id: string, numero: number, status: string) =>
  ({ id, numero, titulo_proposto: id, status }) as unknown as Corte;
const CORTES = [corteDe('a', 1, 'aprovado'), corteDe('b', 2, 'rejeitado'), corteDe('c', 3, 'proposto')];

function publicar(riscar?: { onRiscar: () => void }): Chrome {
  publicado = null;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <BancadaChrome
          projetoId="p1"
          tituloLive="Live"
          cortes={CORTES}
          corte={CORTES[0]}
          exportStatus={[]}
          caminhoDoCorte={(c) => `/corte/${c.id}`}
          sub=""
          fire={false}
          sujo={false}
          salvando={false}
          brutoPronto
          brutoOcupado={false}
          onToggleFire={vi.fn()}
          onAprovar={vi.fn()}
          riscar={riscar}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return publicado!;
}

/** O bloco `<BancadaChrome ... />` de uma tela, lido na fonte. */
function bancadaDaTela(caminho: string): string {
  const texto = readFileSync(resolve(__dirname, caminho), 'utf8');
  const inicio = texto.indexOf('<BancadaChrome');
  expect(inicio).toBeGreaterThan(-1);
  return texto.slice(inicio, texto.indexOf('/>', inicio));
}

describe('a seção Riscados só na etapa Cortes', () => {
  it('com o riscar (etapa Cortes), a lista leva a seção no rodapé', () => {
    const { lista } = publicar({ onRiscar: vi.fn() });
    expect(isValidElement(lista!.rodape)).toBe(true);
    expect(lista!.itens.map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('sem o riscar (Pós e Revisão), o riscado some da lista e não há seção', () => {
    const { lista } = publicar();
    expect(lista!.rodape).toBeUndefined();
    expect(lista!.itens.map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('o editor da etapa Cortes passa o riscar', () => {
    expect(bancadaDaTela('../EditorPage.tsx')).toContain('riscar=');
  });

  it.each([
    ['a Pós', '../../post-production/ScenesPostProductionPage.tsx'],
    ['a Revisão', '../../final-review/FinalReviewPage.tsx'],
  ])('%s não passa o riscar, então fica sem a seção', (_tela, caminho) => {
    const bloco = bancadaDaTela(caminho);
    expect(bloco).toContain('cortes={cortes}');
    expect(bloco).not.toContain('riscar=');
  });
});
