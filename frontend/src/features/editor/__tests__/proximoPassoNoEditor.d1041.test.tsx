import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { useEditorPage } from '../useEditorPage';
import { assentar, montar } from './domMinimo';

// D-1041: o principal do editor com o hook de verdade. "Ir para a Pós" chega à Pós,
// "Gerar bruto" não reescreve metadados que já existem e não corta o trecho antigo
// quando há ajuste por salvar.

const h = vi.hoisted(() => ({
  corte: {
    id: 'c5',
    numero: 5,
    projeto_id: 'p1',
    status: 'aprovado',
    titulo_proposto: 'c5',
    inicio_seg: 0,
    fim_seg: 600,
    desvios: [],
    arquivo_clip_path: '',
  },
  mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  salvar: vi.fn(),
  gerarBruto: vi.fn(),
  gerarMetadados: vi.fn(),
  avisar: vi.fn(),
  tituloNoExport: '' as string,
}));

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useAbrirPasta: h.mutacao,
  useExportStatus: () => ({ data: { cortes: [{ corte_id: 'c5', titulo_youtube: h.tituloNoExport }] } }),
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
  useAtualizarCorte: () => ({ mutate: h.salvar, mutateAsync: vi.fn(), isPending: false }),
  useCorte: () => ({ data: h.corte, isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: [h.corte], isLoading: false, isError: false }),
  useDeletarCorte: h.mutacao,
  useDividirCorte: h.mutacao,
  useJuntarCortes: h.mutacao,
  useSincronizarTranscricao: h.mutacao,
  useToggleFire: h.mutacao,
  useToggleLeitura: h.mutacao,
}));
vi.mock('@/features/editor/useBruto', () => ({
  avisarSeBrutoOcupado: () => false,
  useGerarBruto: () => ({ mutate: h.gerarBruto, isPending: false }),
  useStatusBruto: () => ({ data: undefined, dataUpdatedAt: 0 }),
}));
vi.mock('@/features/editor/useGeracoesDaIa', () => ({
  useGerarMetadadosClaude: () => ({ mutate: h.gerarMetadados }),
  useGerarTrechosClaude: h.mutacao,
  useStatusMetadadosClaude: () => undefined,
  useTrechosClaudeEmAndamento: () => false,
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.avisar }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirmacao: () => ({ executarOuPedir: vi.fn() }) }));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({ useTrechosRiscados: () => ({ riscar: vi.fn() }) }));

let tela: ReturnType<typeof useEditorPage>;
function Sonda() {
  tela = useEditorPage();
  return null;
}

let limpar: () => Promise<void>;
const abrir = async () => {
  const roteador = createMemoryRouter(
    [
      { path: '/projetos/:id/cortes/:corteId', element: <UmaTelaPorCorte><Sonda /></UmaTelaPorCorte> },
      { path: '/projetos/:id/post-production', element: null },
    ],
    { initialEntries: ['/projetos/p1/cortes/c5'] },
  );
  ({ limpar } = montar(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  ));
  await assentar();
  return roteador;
};

beforeEach(() => {
  vi.clearAllMocks();
  h.salvar.mockReset();
  h.tituloNoExport = '';
});

afterEach(async () => {
  await limpar();
});

describe('D-1041 · o principal do editor, com o hook real', () => {
  it('"Ir para a Pós" abre a Pós deste corte, e o corte continua aprovado', async () => {
    const roteador = await abrir();
    tela.irParaPos();
    await assentar();
    expect(roteador.state.location.pathname + roteador.state.location.search).toBe(
      '/projetos/p1/post-production?corte=c5',
    );
    expect(h.salvar).not.toHaveBeenCalled();
  });

  it('1ª geração sem metadados: gera o bruto e pede os metadados', async () => {
    await abrir();
    tela.handleGerarBrutoPrincipal();
    expect(h.gerarBruto).toHaveBeenCalledOnce();
    expect(h.gerarMetadados).toHaveBeenCalledWith('claude');
  });

  it('1ª geração com título já escrito: gera o bruto sem reescrever os metadados', async () => {
    h.tituloNoExport = 'Título que já foi revisado';
    await abrir();
    tela.handleGerarBrutoPrincipal();
    expect(h.gerarBruto).toHaveBeenCalledOnce();
    expect(h.gerarMetadados).not.toHaveBeenCalled();
  });

  it('com ajuste por salvar: salva primeiro e só então gera', async () => {
    let concluir = () => undefined as void;
    h.salvar.mockImplementation((_patch, { onSuccess }) => {
      concluir = onSuccess;
    });
    await abrir();
    tela.patchDirty({ inicio_seg: 10 });
    await assentar();

    tela.handleGerarBrutoPrincipal();
    expect(h.salvar).toHaveBeenCalledWith({ inicio_seg: 10 }, expect.anything());
    expect(h.gerarBruto).not.toHaveBeenCalled();

    concluir();
    await assentar();
    expect(h.gerarBruto).toHaveBeenCalledOnce();
    expect(tela.isDirty).toBe(false);
  });

  it('se salvar falhar, avisa, não gera e o ajuste continua', async () => {
    h.salvar.mockImplementation((_patch, { onError }) => onError(new Error('sem rede')));
    await abrir();
    tela.patchDirty({ inicio_seg: 10 });
    await assentar();

    tela.handleGerarBrutoPrincipal();
    await assentar();
    expect(h.gerarBruto).not.toHaveBeenCalled();
    expect(h.avisar).toHaveBeenCalledWith(expect.stringContaining('sem rede'), { tone: 'error' });
    expect(tela.isDirty).toBe(true);
  });
});
