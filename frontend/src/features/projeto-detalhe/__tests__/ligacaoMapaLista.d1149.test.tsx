import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapaDaLive } from '@/components/ui/mapa-da-live';
import type { Corte } from '@/types/models';

// D-1149 · achado da pr-audit (bloqueante 2): o aceite "clicar no mapa seleciona a linha, e o
// contrário" só era provado lendo o texto da página; tirar o `onAbrir` do MapaDosCortes não
// reprovava nada. Aqui a ligação se prova por comportamento, nos dois elos:
// (1) o cartão entrega o clique ao MapaDaLive; (2) a tela liga o clique do mapa ao
// `abrirPeloMapa` e o foco de cada linha ao `abrirPelaLinha` do mesmo corte.

const h = vi.hoisted(() => ({
  cortes: [] as unknown[],
  mapa: undefined as undefined | { abertoId?: string; onAbrir: (id: string) => void },
  linhas: [] as { status: { corte_id: string }; onAbrir?: () => void }[],
  abrirPeloMapa: vi.fn(),
  abrirPelaLinha: vi.fn(),
}));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: () => undefined,
}));
const mutacao = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({
    data: { id: 'p1', status: 'analisado', arquivos_limpos: false, titulo_live: 'Live', duracao_segundos: 3600 },
    refetch: vi.fn(),
  }),
  useExportStatus: () => ({ data: { cortes: [] }, refetch: vi.fn() }),
  useProjetoProgressoWS: () => ({}),
  useAbrirPastaProjeto: mutacao,
  useRefazerTranscricao: mutacao,
  useAnalisarDesviosTodos: () => ({ disparar: vi.fn(), disparado: false }),
  useUploadYouTube: mutacao,
  useMarcarPublicadoYouTube: mutacao,
  useLiberarPublicacao: mutacao,
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCortesProjeto: () => ({ data: h.cortes, isError: false, error: null, refetch: vi.fn() }),
  useReordenarCortes: mutacao,
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/features/diarizacao/useDiarizacao', () => ({ useAnaliseClaudeEmAndamento: () => false }));
vi.mock('@/hooks/useWarmupWaveforms', () => ({ useWarmupWaveforms: () => undefined }));
vi.mock('@/features/channels/useChannels', () => ({ useCanais: () => ({ data: { canais: [] } }) }));
vi.mock('@/features/editor/AdicionarCorteModal', () => ({ AdicionarCorteModal: () => null }));
vi.mock('@/features/projeto-detalhe/AnaliseIaModal', () => ({ AnaliseIaModal: () => null }));
vi.mock('@/features/projeto-detalhe/AuditoriaAnaliseModal', () => ({ AuditoriaAnaliseModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarMassaModal', () => ({ PublicarMassaModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarTiktokModal', () => ({ PublicarTiktokModal: () => null }));
// As duas pontas da ligação: o que a tela entrega ao mapa e a cada linha fica anotado.
vi.mock('../useCorteAberto', () => ({
  useCorteAberto: () => ({ abertoId: 'c2', abrirPeloMapa: h.abrirPeloMapa, abrirPelaLinha: h.abrirPelaLinha }),
}));
vi.mock('../MapaDosCortes', () => ({
  MapaDosCortes: (props: NonNullable<typeof h.mapa>) => {
    h.mapa = props;
    return null;
  },
}));
vi.mock('../CorteLinhaAp', () => ({
  CorteLinhaAp: (props: (typeof h.linhas)[number]) => {
    h.linhas.push(props);
    return null;
  },
}));

const { default: WorkspaceProjetoPage } = await import('../WorkspaceProjetoPage');
// O cartão de verdade (a tela recebe o dublê dele, acima).
const { MapaDosCortes } = await vi.importActual<typeof import('../MapaDosCortes')>('../MapaDosCortes');

afterEach(() => {
  vi.clearAllMocks();
  h.mapa = undefined;
  h.linhas = [];
});

const corte = (id: string, numero: number) =>
  ({ id, numero, status: 'proposto', inicio_seg: numero * 600, fim_seg: numero * 600 + 300 }) as unknown as Corte;

function tela() {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/projetos/p1']}>
        <Routes>
          <Route path="/projetos/:id" element={<WorkspaceProjetoPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('D-1149 · o cartão do mapa entrega o clique ao MapaDaLive', () => {
  it('clicar num corte do mapa chama o onAbrir que a tela passou, com o id do corte', () => {
    const onAbrir = vi.fn();
    const cartao = MapaDosCortes({ duracaoSeg: 3600, cortes: [], abertoId: 'c2', onAbrir, prontos: 0, fires: 0 });
    const filhos = [(cartao as ReactElement<{ children: unknown }>).props.children].flat(2) as ReactElement<{
      onAbrir: (id: string) => void;
      abertoId?: string;
    }>[];
    const mapa = filhos.find((f) => f?.type === MapaDaLive)!;
    expect(mapa.props.abertoId).toBe('c2');
    mapa.props.onAbrir('c5');
    expect(onAbrir).toHaveBeenCalledWith('c5');
  });
});

describe('D-1149 · a tela liga o mapa e a lista ao mesmo corte aberto', () => {
  it('o clique no mapa vai ao abrirPeloMapa, com o id que o mapa deu', () => {
    h.cortes = [corte('c1', 1), corte('c2', 2), corte('c3', 3)];
    tela();
    expect(h.mapa!.abertoId).toBe('c2');
    h.mapa!.onAbrir('c3');
    expect(h.abrirPeloMapa).toHaveBeenCalledWith('c3');
    expect(h.abrirPelaLinha).not.toHaveBeenCalled();
  });

  it('o foco de cada linha vai ao abrirPelaLinha com o corte DAQUELA linha', () => {
    h.cortes = [corte('c1', 1), corte('c2', 2), corte('c3', 3)];
    tela();
    expect(h.linhas.map((l) => l.status.corte_id)).toEqual(['c1', 'c2', 'c3']);
    h.linhas[2].onAbrir!();
    expect(h.abrirPelaLinha).toHaveBeenCalledWith('c3');
    h.linhas[0].onAbrir!();
    expect(h.abrirPelaLinha).toHaveBeenLastCalledWith('c1');
    expect(h.abrirPeloMapa).not.toHaveBeenCalled();
  });

  it('a linha do corte aberto é a atual da lista (aria-current); as outras não', () => {
    h.cortes = [corte('c1', 1), corte('c2', 2), corte('c3', 3)];
    const html = tela();
    expect(html.match(/<li[^>]*aria-current="true"/g)).toHaveLength(1);
  });
});
