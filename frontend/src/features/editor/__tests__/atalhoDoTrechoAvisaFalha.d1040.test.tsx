import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorPage } from '../useEditorPage';
import { assentar, montar } from './domMinimo';

// D-1040: o atalho do bruto grava o trecho com a tela real e a mutação real. Antes
// ele chamava a API com `void`: a falha não aparecia, a lista não recarregava e o
// operador apertava de novo, gravando o mesmo trecho duas vezes.

const h = vi.hoisted(() => {
  const trecho = { inicio_hms: '00:00:00.000', fim_hms: '00:00:05.000', motivo: 'Trecho manual', origem: 'manual' };
  const corteDe = (desvios: unknown[]) => ({
    id: 'c1',
    numero: 1,
    projeto_id: 'p1',
    status: 'aprovado',
    titulo_proposto: 'c1',
    inicio_seg: 0,
    fim_seg: 600,
    desvios,
  });
  return {
    trecho,
    corteDe,
    mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    notify: vi.fn(),
    adicionarDesvio: vi.fn(),
    obterCorte: vi.fn(),
  };
});

vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return {
    ...real,
    cortesApi: { ...real.cortesApi, adicionarDesvio: h.adicionarDesvio, obterCorte: h.obterCorte },
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
  useAtualizarCorte: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useCortesProjeto: () => ({ data: [], isLoading: false, isError: false }),
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
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirmacao: () => ({ pedir: vi.fn() }) }));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({ useTrechosRiscados: () => ({ riscar: vi.fn() }) }));

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1040 · o atalho do trecho no bruto', () => {
  let tela: ReturnType<typeof useEditorPage>;
  function Sonda() {
    tela = useEditorPage();
    return null;
  }
  const abrir = async () => {
    const roteador = createMemoryRouter(
      [{ path: '/projetos/:id/cortes/:corteId', element: <Sonda /> }],
      { initialEntries: ['/projetos/p1/cortes/c1'] },
    );
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
  };
  const avisos = (tom: string) => h.notify.mock.calls.filter(([, opcoes]) => opcoes?.tone === tom).map(([texto]) => texto);

  beforeEach(() => {
    h.notify.mockReset();
    h.adicionarDesvio.mockReset();
    h.obterCorte.mockReset();
    h.obterCorte.mockResolvedValue(h.corteDe([]));
  });

  it('trecho gravado sem a sincronia: avisa e mostra o trecho', async () => {
    h.adicionarDesvio.mockResolvedValue({ ...h.corteDe([h.trecho]), sincronia_falhou: true });
    await abrir();

    tela.adicionarTrechoAqui();
    await assentar();

    expect(avisos('warning')).toEqual([expect.stringContaining('transcrição')]);
    expect(tela.corte?.desvios).toEqual([h.trecho]);
  });

  it('pedido que falha com o trecho já gravado: avisa e recarrega a lista', async () => {
    h.adicionarDesvio.mockImplementation(async () => {
      h.obterCorte.mockResolvedValue(h.corteDe([h.trecho]));
      throw new Error('Internal Server Error');
    });
    await abrir();

    tela.adicionarTrechoAqui();
    await assentar();

    expect(avisos('error')).toEqual([expect.stringContaining('confirmar')]);
    expect(tela.corte?.desvios).toEqual([h.trecho]);
  });

  it('trecho e sincronia em dia: mostra o trecho sem aviso', async () => {
    h.adicionarDesvio.mockResolvedValue({ ...h.corteDe([h.trecho]), sincronia_falhou: false });
    await abrir();

    tela.adicionarTrechoAqui();
    await assentar();

    expect(h.adicionarDesvio).toHaveBeenCalledWith('c1', {
      inicio_hms: expect.any(String),
      fim_hms: expect.any(String),
      motivo: 'Trecho manual',
    });
    expect(h.notify).not.toHaveBeenCalled();
    expect(tela.corte?.desvios).toEqual([h.trecho]);
  });
});
