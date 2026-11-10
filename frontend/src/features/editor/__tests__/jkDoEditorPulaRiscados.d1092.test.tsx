import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { useEditorPage } from '../useEditorPage';
import { assentar, montar } from './domMinimo';

// D-1092: o J e o K do editor (os atalhos da tela, `bruto.corteAnterior` e
// `bruto.proximoCorte`) pulam os cortes riscados, como a lista "Cortes da live".
// Antes o K parava num riscado (a auditoria da D-1088 apontou).

const h = vi.hoisted(() => {
  const corteDe = (id: string, numero: number, status: string) => ({
    id,
    numero,
    projeto_id: 'p1',
    status,
    titulo_proposto: id,
    inicio_seg: 0,
    fim_seg: 600,
    desvios: [],
  });
  return {
    cortes: [corteDe('a', 1, 'aprovado'), corteDe('b', 2, 'rejeitado'), corteDe('c', 3, 'proposto'), corteDe('d', 4, 'rejeitado')],
    mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useAbrirPasta: h.mutacao,
  useExportStatus: () => ({ data: { cortes: [] } }),
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
}));
vi.mock('@/features/settings', () => ({
  useContextoCorte: () => ({ antesSeg: 0, depoisSeg: 0 }),
  useVelocidadePlayerPadrao: () => 1,
}));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosVisiveis: () => [] }));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAdicionarDesvio: h.mutacao,
  useAtualizarCorte: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCorte: (id: string) => ({ data: h.cortes.find((c) => c.id === id), isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: h.cortes, isLoading: false, isError: false }),
  useDeletarCorte: h.mutacao,
  useDividirCorte: h.mutacao,
  useJuntarCortes: h.mutacao,
  useSincronizarTranscricao: h.mutacao,
  useToggleFire: h.mutacao,
  useToggleLeitura: h.mutacao,
}));
vi.mock('@/features/editor/useBruto', () => ({
  avisarSeBrutoOcupado: () => false,
  useGerarBruto: h.mutacao,
  useStatusBruto: () => ({ data: undefined, dataUpdatedAt: 0 }),
}));
vi.mock('@/features/editor/useGeracoesDaIa', () => ({
  useGerarMetadadosClaude: h.mutacao,
  useGerarTrechosClaude: h.mutacao,
  useStatusMetadadosClaude: () => undefined,
  useTrechosClaudeEmAndamento: () => false,
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn(), dismiss: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirmacao: () => ({ pedir: vi.fn() }) }));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({ useTrechosRiscados: () => ({ riscar: vi.fn() }) }));

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1092 · o J/K do editor pula os riscados', () => {
  let tela: ReturnType<typeof useEditorPage>;
  function Sonda() {
    tela = useEditorPage();
    return null;
  }
  const abrir = async (corteId: string) => {
    const roteador = createMemoryRouter(
      [{ path: '/projetos/:id/cortes/:corteId', element: <UmaTelaPorCorte><Sonda /></UmaTelaPorCorte> }],
      { initialEntries: [`/projetos/p1/cortes/${corteId}`] },
    );
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
    return roteador;
  };
  const tecla = async (descricao: 'Próximo corte' | 'Corte anterior') => {
    tela.bindings.find((b) => b.description === descricao)!.action();
    await assentar();
  };
  const corteAberto = (r: { state: { location: { pathname: string } } }) =>
    r.state.location.pathname.split('/').pop();

  it('K vai do #1 ao #3, por cima do #2 riscado', async () => {
    const roteador = await abrir('a');
    await tecla('Próximo corte');
    expect(corteAberto(roteador)).toBe('c');
  });

  it('J vai do #3 ao #1, e o K volta em roda sem parar no #4 riscado', async () => {
    const roteador = await abrir('c');
    await tecla('Corte anterior');
    expect(corteAberto(roteador)).toBe('a');
    await limpar();
    const outro = await abrir('c');
    await tecla('Próximo corte');
    expect(corteAberto(outro)).toBe('a');
  });

  it('aberto num riscado, o K leva ao próximo vivo', async () => {
    const roteador = await abrir('b');
    await tecla('Próximo corte');
    expect(corteAberto(roteador)).toBe('c');
  });
});
