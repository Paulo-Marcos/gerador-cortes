import type { ReactNode, RefObject } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusExportPendente } from '@/features/publicacao/statusExport';

// D-1044: o painel do boletim precisa receber o MESMO ref do <video> da tela; outro
// objeto qualquer deixaria os links sem efeito, com tudo mais verde. O render de servidor
// não preenche ref, então a sonda guarda o que a tela passou para cada elemento.

const h = vi.hoisted(() => ({
  player: undefined as unknown,
  refDoVideo: undefined as unknown,
  corte: {
    id: 'c1',
    projeto_id: 'p1',
    numero: 1,
    titulo_proposto: 'Corte 1',
    inicio_seg: 0,
    fim_seg: 10,
    desvios: [],
    status: 'aprovado',
    is_pos_producao: 0,
    cenas_validadas: 1,
  },
}));

vi.mock('react/jsx-dev-runtime', async (original) => {
  const runtime = await original<typeof import('react/jsx-dev-runtime')>();
  return {
    ...runtime,
    jsxDEV: (tipo: unknown, props: { ref?: unknown }, ...resto: unknown[]) => {
      if (tipo === 'video') h.refDoVideo = props.ref;
      return (runtime.jsxDEV as (...args: unknown[]) => unknown)(tipo, props, ...resto);
    },
  };
});

vi.mock('../BoletimTecnicoCard', () => ({
  BoletimTecnicoPainel: ({ player }: { player?: RefObject<HTMLVideoElement | null> }) => {
    h.player = player;
    return null;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
  useExportStatus: () => ({
    data: {
      cortes: [statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'Corte 1', video_pronto: true })],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({ useRenderFinal: vi.fn() }));
vi.mock('@/features/editor/useCortes', () => ({
  useCorte: () => ({ data: h.corte, isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: [h.corte], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn() }),
  useToggleFire: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/editor/fase2/SceneTimeline', () => ({ SceneTimeline: () => null }));
vi.mock('@/features/metadata/MetadataModal', () => ({ MetadataModal: () => null }));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const { FinalReviewPage } = await import('../FinalReviewPage');

describe('D-1044 · a Revisão entrega o vídeo dela ao boletim', () => {
  it('o painel recebe o mesmo ref do <video> da tela', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <TooltipProvider>
            <MemoryRouter initialEntries={['/projetos/p1/final-review?corte=c1']}>
              <Routes>
                <Route path="/projetos/:id/final-review" element={<FinalReviewPage />} />
              </Routes>
            </MemoryRouter>
          </TooltipProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(html).toContain('<video');
    expect(h.refDoVideo).toBeDefined();
    expect(h.player).toBe(h.refDoVideo);
  });
});
