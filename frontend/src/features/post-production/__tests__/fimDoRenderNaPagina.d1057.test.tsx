import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ReacoesDoRenderFinal } from '@/features/editor/useRender';
import type { Corte, PipelineStatusResponse } from '@/types/models';
import { avisoDoFimDoRender } from '../renderEtapas';

// D-1057: a página da Pós de verdade recebendo o fim do render. Só o `done` leva à
// Revisão; quem não refez o vídeo fica aqui e diz por quê, porque o vídeo na tela
// continua sendo o anterior.

const h = vi.hoisted(() => ({
  navegar: vi.fn(),
  avisar: vi.fn(),
  reacoes: null as ReacoesDoRenderFinal | null,
  corte: {} as unknown as Corte,
}));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => h.navegar,
}));
vi.mock('@/components/ui/toaster', async (original) => ({
  ...(await original<typeof import('@/components/ui/toaster')>()),
  useToast: () => ({ notify: h.avisar, dismiss: vi.fn() }),
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live', arquivos_limpos: false } }),
  useExportStatus: () => ({ data: { cortes: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({
  useRenderFinal: (_corteId: string, reacoes: ReacoesDoRenderFinal) => {
    h.reacoes = reacoes;
    return {
      renderFinal: { isPending: false },
      pipelineStatus: { data: { fases: { raw: true, encode: true } } },
      marcado: false,
      rodando: false,
      progresso: 0,
      pedir: vi.fn(),
      iniciar: vi.fn(),
    };
  },
  useStudioUrl: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/editor/useBruto', () => ({
  useGerarBruto: () => ({ mutate: vi.fn(), isPending: false }),
  useStatusBruto: () => ({ data: undefined }),
}));
vi.mock('@/features/editor/useCortes', () => ({
  useCorte: () => ({ data: h.corte, isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: [h.corte], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleFire: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/settings', () => ({ useVelocidadePlayerPadrao: () => 1 }));
vi.mock('@/features/editor/fase2/EditorFase2', () => ({ EditorFase2: () => null }));
vi.mock('@/features/metadata/MetadadosDoCorteModal', () => ({
  MetadadosDoCorteModal: () => null,
  statusMinimo: () => ({}),
}));
vi.mock('@/features/editor/BancadaChrome', () => ({ BancadaChrome: () => null }));

const { ScenesPostProductionPage } = await import('../ScenesPostProductionPage');

function statusNoFim(campos: Partial<PipelineStatusResponse>): PipelineStatusResponse {
  return {
    // O vídeo do render anterior no disco: é ele que não pode valer como pronto.
    fases: { raw: true, grade: true, overlays: true, compose: true, render_final: true, encode: true },
    overlays_count: 1,
    tem_etapas_concluidas: true,
    state: 'done',
    progress: 100,
    stage: 'Render final concluído',
    running: false,
    elapsed_seconds: 0,
    error: '',
    ...campos,
  };
}

function abrirAPos() {
  h.corte = {
    id: 'c1',
    projeto_id: 'p1',
    numero: 1,
    titulo_proposto: 'Corte',
    status: 'aprovado',
    inicio_seg: 0,
    fim_seg: 60,
    desvios: [],
    is_pos_producao: 1,
    arquivo_clip_path: 'clip_raw.mkv',
    cenas_remotion: [],
  } as unknown as Corte;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}>
      <TooltipProvider>
        <MemoryRouter initialEntries={['/projetos/p1/post-production?corte=c1']}>
          <Routes>
            <Route path="/projetos/:id/post-production" element={<ScenesPostProductionPage />} />
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return h.reacoes!;
}

describe('D-1057 · o fim do render na Pós', () => {
  beforeEach(() => {
    h.navegar.mockClear();
    h.avisar.mockClear();
    h.reacoes = null;
  });

  it('render concluído que a tela assistiu vai à Revisão, sem aviso', () => {
    const status = statusNoFim({});
    abrirAPos().aoAcabar!({ concluiu: true, falhou: false, status, assistiu: true });
    expect(h.navegar).toHaveBeenCalledWith('/projetos/p1/final-review?corte=c1', { replace: true });
    expect(h.avisar).not.toHaveBeenCalled();
  });

  it('render parcial fica na Pós e diz até onde foi', () => {
    const status = statusNoFim({ state: 'parcial', stage: 'Render parcial concluído (parou em grade)' });
    abrirAPos().aoAcabar!({ concluiu: false, falhou: false, status, assistiu: true });
    expect(h.navegar).not.toHaveBeenCalled();
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar.mock.calls[0][0]).toContain('parou em grade');
    expect(h.avisar.mock.calls[0][1]).toEqual({ tone: 'success' });
  });

  // `idle` só diz que o backend não conhece o render: ele pode ter terminado bem antes
  // do reinício, e aí o vídeo é o novo. O aviso não afirma que o render se perdeu.
  it.each([true, false])('backend sem o render (assistiu: %s) fica na Pós e não afirma o que não sabe', (assistiu) => {
    const status = statusNoFim({ state: 'idle', progress: 0, stage: 'Aguardando render final' });
    abrirAPos().aoAcabar!({ concluiu: false, falhou: false, status, assistiu });
    expect(h.navegar).not.toHaveBeenCalled();
    expect(h.avisar).toHaveBeenCalledTimes(1);
    expect(h.avisar.mock.calls[0][0]).toContain('não sabe como este render terminou');
    expect(h.avisar.mock.calls[0][0]).toContain('pode ser o anterior');
    expect(h.avisar.mock.calls[0][0]).not.toContain('perdeu');
    expect(h.avisar.mock.calls[0][0]).not.toContain('reiniciou');
    expect(h.avisar.mock.calls[0][1]).toEqual({ tone: 'warning' });
  });

  it('falha fica na Pós e mostra o motivo do backend', () => {
    const status = statusNoFim({ state: 'error', error: 'ffmpeg morreu' });
    abrirAPos().aoAcabar!({ concluiu: false, falhou: true, status, assistiu: true });
    expect(h.navegar).not.toHaveBeenCalled();
    expect(h.avisar).toHaveBeenCalledWith('O render final falhou: ffmpeg morreu.', { tone: 'error' });
  });

  it('cancelamento fica na Pós em silêncio: foi o operador quem mandou parar', () => {
    const status = statusNoFim({ state: 'cancelled' });
    abrirAPos().aoAcabar!({ concluiu: false, falhou: false, status, assistiu: true });
    expect(h.navegar).not.toHaveBeenCalled();
    expect(h.avisar).not.toHaveBeenCalled();
  });
});

describe('D-1057 · avisoDoFimDoRender', () => {
  it('falha sem motivo do backend ainda diz que falhou', () => {
    expect(avisoDoFimDoRender(statusNoFim({ state: 'error', error: '' }))).toEqual({
      texto: 'O render final falhou: o backend não disse por quê.',
      tom: 'error',
    });
  });

  it.each(['done', 'cancelled', 'running'] as const)('%s não pede aviso', (state) => {
    expect(avisoDoFimDoRender(statusNoFim({ state }))).toBeNull();
  });
});
