import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { Corte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import type { Chrome } from '@/upgrade/UpgradeChrome';

// D-1165 (E-069 H-06): os cortes da live passam pela régua `esperarPrimarios` (DIRECAO §5).
// A primária é a da barra da casca ("Aprovar o proposto"); a régua lê a tela e a barra juntas.
// Os mocks são os do teste da D-1149, que segue com o contador próprio.

const h = vi.hoisted(() => ({ cortes: [] as unknown[], chrome: undefined as unknown, duracao: 3600 }));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: unknown) => {
    h.chrome = chrome;
  },
}));
const mutacao = () => ({ mutate: vi.fn(), isPending: false });
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({
    data: { id: 'p1', status: 'analisado', arquivos_limpos: false, titulo_live: 'Pedro e a Igreja no Império', duracao_segundos: h.duracao },
    refetch: vi.fn(),
  }),
  useExportStatus: () => ({ data: { cortes: [] }, refetch: vi.fn() }),
  useProjetoProgressoWS: () => ({}),
  useAbrirPastaProjeto: mutacao,
  useAbrirPasta: mutacao,
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
  useAprovar: mutacao,
  useAtualizarCorte: mutacao,
}));
vi.mock('@/features/diarizacao/useDiarizacao', () => ({ useAnaliseClaudeEmAndamento: () => false }));
vi.mock('@/hooks/useWarmupWaveforms', () => ({ useWarmupWaveforms: () => undefined }));
vi.mock('@/features/channels/useChannels', () => ({ useCanais: () => ({ data: { canais: [] } }) }));
vi.mock('@/features/editor/AdicionarCorteModal', () => ({ AdicionarCorteModal: () => null }));
vi.mock('@/features/projeto-detalhe/AnaliseIaModal', () => ({ AnaliseIaModal: () => null }));
vi.mock('@/features/projeto-detalhe/AuditoriaAnaliseModal', () => ({ AuditoriaAnaliseModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarMassaModal', () => ({ PublicarMassaModal: () => null }));
vi.mock('@/features/projeto-detalhe/PublicarTiktokModal', () => ({ PublicarTiktokModal: () => null }));

const { default: WorkspaceProjetoPage } = await import('../WorkspaceProjetoPage');

afterEach(() => {
  h.cortes = [];
  h.chrome = undefined;
  h.duracao = 3600;
});

const corte = (id: string, numero: number, status: string, inicio: number, extra: Partial<Corte> = {}) =>
  ({
    id,
    numero,
    status,
    titulo_proposto: `Corte de número ${numero}`,
    inicio_seg: inicio,
    fim_seg: inicio + 600,
    inicio_hms: '00:00:00',
    fim_hms: '00:10:00',
    is_fire: false,
    score: { hook: 8, flow: 7, value: 7 },
    ...extra,
  }) as unknown as Corte;

function tela(url = '/projetos/p1'): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <Routes>
            <Route path="/projetos/:id" element={<WorkspaceProjetoPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const barra = () => renderToStaticMarkup(<ActionBar barra={(h.chrome as Chrome).barra!} />);

const LIVE = [corte('c1', 1, 'proposto', 0), corte('c2', 2, 'aprovado', 1200), corte('c3', 3, 'rejeitado', 2400)];
const tudo = () => tela() + barra();

describe('os cortes da live na régua umPrimarioPorTela', () => {
  it('com corte proposto: uma primária acesa, a da barra', () => {
    h.cortes = LIVE;
    esperarPrimarios(tudo(), 'CortesDaLive');
  });

  it('live sem cortes: a análise é secundária, a primária segue sendo a da barra', () => {
    h.cortes = [];
    esperarPrimarios(tudo(), 'CortesDaLive');
  });
});
