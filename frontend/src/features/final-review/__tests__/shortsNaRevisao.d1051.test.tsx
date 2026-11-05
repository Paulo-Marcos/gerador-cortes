import type { ReactNode, RefObject } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusExportPendente } from '@/features/publicacao/statusExport';

// D-1051: a Revisão é onde o corte se fecha, e dali não havia caminho para os shorts dele.
// O teste passa pela tela inteira: a ligação é o que quebraria em silêncio.

const h = vi.hoisted(() => ({
  isFire: true,
  videoPronto: true,
  boletim: vi.fn(),
}));

vi.mock('../BoletimTecnicoCard', () => ({
  BoletimTecnicoPainel: (p: { corteId: string; player?: RefObject<HTMLVideoElement | null> }) => {
    h.boletim(p);
    return null;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
  useExportStatus: () => ({
    data: {
      cortes: [statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'Corte 1', video_pronto: h.videoPronto })],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
const corteDaTela = () => ({
  id: 'c1',
  projeto_id: 'p1',
  numero: 1,
  titulo_proposto: 'Corte 1',
  inicio_seg: 0,
  fim_seg: 10,
  desvios: [],
  status: 'aprovado',
  is_pos_producao: 0,
  is_fire: h.isFire,
});
vi.mock('@/features/editor/useRender', () => ({ useRenderFinal: vi.fn() }));
vi.mock('@/features/editor/useCortes', () => ({
  useCorte: () => ({ data: corteDaTela(), isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: [corteDaTela()], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn() }),
  useToggleFire: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/editor/fase2/SceneTimeline', () => ({ SceneTimeline: () => null }));
vi.mock('@/features/metadata/MetadataModal', () => ({ MetadataModal: () => null }));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const { FinalReviewPage } = await import('../FinalReviewPage');

function revisao() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(
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
}

beforeEach(() => {
  h.isFire = true;
  h.videoPronto = true;
  h.boletim.mockClear();
});

describe('D-1051 · da Revisão para os shorts do corte', () => {
  it('corte com Fire: o caminho está lá', () => {
    const html = revisao();
    expect(html).toContain('Shorts deste corte');
    expect(html).toContain('href="/shorts/c1"');
  });

  it('corte com Fire e sem render: o caminho não depende do vídeo', () => {
    h.videoPronto = false;
    expect(revisao()).toContain('Shorts deste corte');
  });

  it('corte sem Fire: sem o caminho', () => {
    h.isFire = false;
    expect(revisao()).not.toContain('Shorts deste corte');
  });

  it('o boletim continua só com o vídeo pronto, e no mesmo corte', () => {
    revisao();
    expect(h.boletim).toHaveBeenCalledWith(expect.objectContaining({ corteId: 'c1' }));
    h.boletim.mockClear();
    h.videoPronto = false;
    revisao();
    expect(h.boletim).not.toHaveBeenCalled();
  });
});
