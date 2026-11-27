import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { Corte, StatusExportCorte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import type { ChromeBarra } from '@/upgrade/UpgradeChrome';

// D-1171 (DIRECAO §5): a primária da Revisão é "Publicar N cortes". N é o que pode ir para o
// YouTube (pronto e ainda não publicado), a mesma regra de Metadados e de Cortes da live.

const corte = {
  id: 'c1',
  projeto_id: 'p1',
  numero: 1,
  titulo_proposto: 'Corte 1',
  inicio_seg: 0,
  fim_seg: 10,
  desvios: [],
  status: 'aprovado',
  is_pos_producao: 0,
  cenas_json: null,
} as unknown as Corte;

const h = vi.hoisted(() => ({
  status: [] as StatusExportCorte[],
  navigate: vi.fn(),
  barra: undefined as ChromeBarra | undefined,
}));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => h.navigate,
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
  useExportStatus: () => ({ data: { cortes: h.status }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({ useRenderFinal: vi.fn() }));
vi.mock('@/features/editor/useCortes', () => ({
  useCorte: () => ({ data: corte, isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: [corte], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleFire: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/fase2/SceneTimeline', () => ({ SceneTimeline: () => null }));
vi.mock('@/features/metadata/MetadataModal', () => ({ MetadataModal: () => null }));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: ({ barra }: { barra: ChromeBarra; children?: ReactNode }) => {
    h.barra = barra;
    return <ActionBar barra={barra} />;
  },
}));

const { FinalReviewPage } = await import('../FinalReviewPage');

function corteDoExport(n: number, extra: Partial<StatusExportCorte> = {}): StatusExportCorte {
  return {
    ...statusExportPendente({ corte_id: `c${n}`, numero: n, titulo: `Corte ${n}` }),
    pronto_publicar: true,
    ...extra,
  };
}

function tela(): string {
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

describe('D-1171 · a primária da Revisão é "Publicar N cortes"', () => {
  beforeEach(() => {
    h.status = [];
    h.barra = undefined;
    h.navigate.mockClear();
  });

  it('com 0 prontos: "Publicar 0 cortes" desligada, com o motivo ao lado', () => {
    h.status = [
      corteDoExport(1, { pronto_publicar: false }),
      // Já no YouTube não conta: não há o que publicar de novo.
      corteDoExport(2, { youtube_url_publicado: 'https://youtu.be/sintetico' }),
    ];
    const html = tela();
    esperarPrimarios(html, 'Revisao', { primarioDesabilitado: true });
    expect(h.barra?.primario.texto).toBe('Publicar 0 cortes');
    expect(h.barra?.primario.desabilitado).toBe(true);
    expect(html).toContain('id="motivo-do-primario"');
    expect(html).toContain('Nenhum corte pronto que ainda falte no YouTube');
    expect(html).toContain('aria-describedby="motivo-do-primario"');
  });

  it.each([
    [1, 'Publicar 1 corte'],
    [3, 'Publicar 3 cortes'],
  ])('com %i prontos: "%s" acesa e leva à live', (total, texto) => {
    h.status = [
      ...Array.from({ length: total }, (_, i) => corteDoExport(i + 1)),
      corteDoExport(8, { pronto_publicar: false }),
      corteDoExport(9, { youtube_url_publicado: 'https://youtu.be/sintetico' }),
    ];
    const html = tela();
    esperarPrimarios(html, 'Revisao');
    expect(h.barra?.primario.texto).toBe(texto);
    expect(html).toContain(texto);
    expect(html).not.toContain('motivo-do-primario');
    h.barra?.primario.onClick?.();
    expect(h.navigate).toHaveBeenCalledWith('/projetos/p1');
  });
});
