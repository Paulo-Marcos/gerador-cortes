import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorPage } from '../useEditorPage';
import { assentar, montar } from './domMinimo';

// D-1088: no editor, o R risca o corte direto. Antes ele abria o diálogo do
// "Excluir o corte de vez" (D-842), e confirmar apagava a proposta e o trabalho.

const h = vi.hoisted(() => ({
  corte: { id: 'c1', numero: 1, projeto_id: 'p1', status: 'aprovado', titulo_proposto: 'c1', inicio_seg: 0, fim_seg: 600, desvios: [], youtube_video_id: '' },
  mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  notify: vi.fn(),
  pedir: vi.fn(),
  obterCorte: vi.fn(),
  riscarCorte: vi.fn(),
  deletarCorte: vi.fn(),
  salvar: vi.fn(),
}));

vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return {
    ...real,
    cortesApi: { ...real.cortesApi, obterCorte: h.obterCorte, riscarCorte: h.riscarCorte, deletarCorte: h.deletarCorte },
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
  useAtualizarCorte: () => ({ mutate: h.salvar, mutateAsync: vi.fn(), isPending: false }),
  useCortesProjeto: () => ({ data: [], isLoading: false, isError: false }),
  useDeletarCorte: h.mutacao,
  useDividirCorte: h.mutacao,
  useJuntarCortes: h.mutacao,
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
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirmacao: () => ({ pedir: h.pedir, executarOuPedir: h.pedir }),
}));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({ useTrechosRiscados: () => ({ riscar: vi.fn() }) }));


let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1088 · o R do editor', () => {
  let tela: ReturnType<typeof useEditorPage>;
  function Sonda() {
    tela = useEditorPage();
    return null;
  }
  let roteador: ReturnType<typeof createMemoryRouter>;
  const abrir = async () => {
    roteador = createMemoryRouter(
      [
        { path: '/projetos/:id/cortes/:corteId', element: <Sonda /> },
        { path: '/projetos/:id', element: null },
      ],
      { initialEntries: ['/projetos/p1/cortes/c1'] },
    );
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
  };
  const apertarR = () => tela.bindings.find((b) => b.key === 'r' && b.description === 'Riscar corte')!.action();

  beforeEach(() => {
    for (const fn of [h.notify, h.pedir, h.obterCorte, h.riscarCorte, h.deletarCorte, h.salvar]) fn.mockReset();
    h.salvar.mockImplementation((_patch, opcoes?: { onSuccess?: () => void }) => opcoes?.onSuccess?.());
    h.obterCorte.mockResolvedValue(h.corte);
    h.riscarCorte.mockResolvedValue({ corte_id: 'c1', status_anterior: 'aprovado', liberado_mb: 0, retido_mb: 0 });
  });

  it('risca sem abrir diálogo e não exclui', async () => {
    await abrir();

    apertarR();
    await assentar();

    expect(h.riscarCorte).toHaveBeenCalledWith('c1');
    expect(h.pedir).not.toHaveBeenCalled();
    expect(h.deletarCorte).not.toHaveBeenCalled();
  });

  // D-883 descartava o ajuste ao excluir: salvá-lo no corte apagado dava 404. O
  // riscado continua no banco e guarda o trabalho do operador: a saída salva o
  // ajuste nele, como em qualquer troca de corte, e segue.
  it('ajuste pendente: risca, salva o ajuste no corte riscado e segue', async () => {
    await abrir();
    tela.patchDirty({ inicio_seg: 5 });
    await assentar();

    apertarR();
    await assentar();

    expect(h.riscarCorte).toHaveBeenCalledWith('c1');
    expect(h.salvar).toHaveBeenCalledWith(expect.objectContaining({ inicio_seg: 5 }), expect.anything());
    expect(h.riscarCorte.mock.invocationCallOrder[0]).toBeLessThan(h.salvar.mock.invocationCallOrder[0]);
    expect(roteador.state.location.pathname).toBe('/projetos/p1');
  });

  it('a tela entrega à barra o riscar e o bloqueio do YouTube', async () => {
    h.obterCorte.mockResolvedValue({ ...h.corte, youtube_video_id: 'abc' });
    await abrir();

    expect(tela.riscar.bloqueio).toBe('Já está no YouTube');
    apertarR();
    await assentar();

    expect(h.riscarCorte).not.toHaveBeenCalled();
  });
});
