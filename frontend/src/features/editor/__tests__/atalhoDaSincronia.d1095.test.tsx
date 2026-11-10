import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { useEditorPage } from '../useEditorPage';
import { assentar, montar } from './domMinimo';

// D-1095 (auditoria r1, C1): Ctrl+, e Ctrl+. continuam andando a sincronia do
// áudio 10 ms, agora que o controle mora na pergunta 3 da aba Decisões. O teste
// aperta o atalho de verdade (o binding do useEditorPage) e lê o offset que a
// pergunta e a faixa mostram (`corteUI.audio_offset_ms`).

const h = vi.hoisted(() => {
  const corteDe = (id: string, audio_offset_ms: number) => ({
    id,
    numero: 1,
    projeto_id: 'p1',
    status: 'proposto',
    titulo_proposto: id,
    inicio_seg: 0,
    fim_seg: 600,
    desvios: [],
    audio_offset_ms,
  });
  return {
    cortes: [corteDe('zero', 0), corteDe('quase-no-teto', 1995), corteDe('quase-no-piso', -1995)],
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

describe('D-1095 · Ctrl+, e Ctrl+. andam a sincronia do áudio', () => {
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
  };
  const tecla = async (descricao: string) => {
    tela.bindings.find((b) => b.description === descricao)!.action();
    await assentar();
  };
  const offset = () => tela.corteUI?.audio_offset_ms;
  const ATRASAR = 'Sincronia do áudio: atrasar 10ms';
  const ADIANTAR = 'Sincronia do áudio: adiantar 10ms';

  it('as teclas são Ctrl+. (atrasar) e Ctrl+, (adiantar)', async () => {
    await abrir('zero');
    expect(tela.bindings.find((b) => b.description === ATRASAR)).toMatchObject({ key: '.', mod: 'ctrl' });
    expect(tela.bindings.find((b) => b.description === ADIANTAR)).toMatchObject({ key: ',', mod: 'ctrl' });
  });

  it('Ctrl+. atrasa 10 ms a cada toque, e Ctrl+, adianta', async () => {
    await abrir('zero');
    expect(offset()).toBe(0);
    await tecla(ATRASAR);
    expect(offset()).toBe(10);
    await tecla(ATRASAR);
    expect(offset()).toBe(20);
    await tecla(ADIANTAR);
    await tecla(ADIANTAR);
    await tecla(ADIANTAR);
    expect(offset()).toBe(-10);
  });

  it('para no teto e no piso de ±2000 ms, como os passos da pergunta', async () => {
    await abrir('quase-no-teto');
    await tecla(ATRASAR);
    expect(offset()).toBe(2000);
    await tecla(ATRASAR);
    expect(offset()).toBe(2000);
    await limpar();
    await abrir('quase-no-piso');
    await tecla(ADIANTAR);
    expect(offset()).toBe(-2000);
  });
});
