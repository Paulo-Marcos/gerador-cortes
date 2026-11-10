import { isValidElement, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorPage } from '../useEditorPage';
import { assentar, montar } from './domMinimo';

// D-1097: juntar com o próximo não pergunta pelo confirm do navegador. O outro
// corte fica riscado, com o trabalho, e o aviso da junção oferece o "Trazer de volta".

const h = vi.hoisted(() => {
  const base = { projeto_id: 'p1', status: 'proposto', inicio_seg: 0, fim_seg: 100, desvios: [], youtube_video_id: '' };
  return {
    c1: { ...base, id: 'c1', numero: 1, titulo_proposto: 'Parte A' },
    c2: { ...base, id: 'c2', numero: 2, titulo_proposto: 'Parte B', inicio_seg: 120, fim_seg: 200 },
    mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    notify: vi.fn(),
    dismiss: vi.fn(),
    obterCorte: vi.fn(),
    juntarCortes: vi.fn(),
    trazerDeVolta: vi.fn(),
    confirm: vi.fn(),
  };
});

vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return {
    ...real,
    cortesApi: {
      ...real.cortesApi,
      obterCorte: h.obterCorte,
      juntarCortes: h.juntarCortes,
      trazerDeVolta: h.trazerDeVolta,
      sincronizarTranscricao: vi.fn(),
    },
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
  useCortesProjeto: () => ({ data: [h.c1, h.c2], isLoading: false, isError: false }),
  useDividirCorte: h.mutacao,
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
vi.mock('@/features/shorts/legendasDoCorte', async (original) => ({
  ...(await original<typeof import('@/features/shorts/legendasDoCorte')>()),
  atualizarLegendasDoCorte: vi.fn(async () => undefined),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: h.dismiss }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({
  useConfirmacao: () => ({ pedir: vi.fn(), executarOuPedir: vi.fn() }),
}));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({ useTrechosRiscados: () => ({ riscar: vi.fn() }) }));

type BotaoDoAviso = ReactElement<{ onClick: () => void; children: string }>;

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1097 · juntar com o próximo no editor', () => {
  let tela: ReturnType<typeof useEditorPage>;
  function Sonda() {
    tela = useEditorPage();
    return null;
  }
  const abrir = async () => {
    const roteador = createMemoryRouter([{ path: '/projetos/:id/cortes/:corteId', element: <Sonda /> }], {
      initialEntries: ['/projetos/p1/cortes/c1'],
    });
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
    // O `window` do domMinimo é o globalThis: o confirm do navegador mora aqui.
    vi.stubGlobal('confirm', h.confirm);
  };
  const avisoDaJuncao = () => {
    const chamada = h.notify.mock.calls.find(([, opcoes]) => opcoes?.title === 'Cortes juntados.');
    return chamada as [string, { conteudo?: BotaoDoAviso; tone: string }] | undefined;
  };

  beforeEach(() => {
    for (const fn of [h.notify, h.dismiss, h.obterCorte, h.juntarCortes, h.trazerDeVolta, h.confirm]) fn.mockReset();
    h.obterCorte.mockResolvedValue(h.c1);
    h.juntarCortes.mockResolvedValue({ ...h.c1, fim_seg: 200 });
    h.trazerDeVolta.mockResolvedValue({ corte_id: 'c2', status: 'proposto', gerando_bruto: true });
    // Se o confirm voltasse, recusar a junção faria o teste falhar.
    h.confirm.mockReturnValue(false);
  });

  it('junta sem o confirm do navegador', async () => {
    await abrir();

    tela.onJuntarProximoCorte();
    await assentar();

    expect(h.confirm).not.toHaveBeenCalled();
    expect(h.juntarCortes).toHaveBeenCalledWith('c1', { outro_corte_id: 'c2' });
  });

  it('o aviso diz que o outro ficou riscado e traz de volta o próximo corte', async () => {
    await abrir();
    tela.onJuntarProximoCorte();
    await assentar();

    const [mensagem, opcoes] = avisoDaJuncao()!;
    expect(mensagem).toContain('ficou riscado');
    expect(isValidElement(opcoes.conteudo)).toBe(true);
    expect(opcoes.conteudo!.props.children).toBe('Trazer de volta');

    opcoes.conteudo!.props.onClick();
    await assentar();

    expect(h.trazerDeVolta).toHaveBeenCalledWith('c2');
    expect(h.dismiss).toHaveBeenCalled();
  });

  it('trazer de volta que falha avisa o erro', async () => {
    h.trazerDeVolta.mockRejectedValue(new Error('caiu'));
    await abrir();
    tela.onJuntarProximoCorte();
    await assentar();

    avisoDaJuncao()![1].conteudo!.props.onClick();
    await assentar();

    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining('caiu'), expect.objectContaining({ tone: 'error' }));
  });
});
