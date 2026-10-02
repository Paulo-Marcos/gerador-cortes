import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';

// D-861: o checklist da revisão final dá a cada item um ícone, por NOME desde
// a D-856 (antes, `const Icon = item.icon` escondia o Icon da escala). O
// checklist só existe dentro da página: os dados vêm por hooks mockados e os
// painéis pesados (timeline, modal de metadados, casca) viram stubs.

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

let status: StatusExportCorte = statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'Corte 1' });

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
  useExportStatus: () => ({
    data: { cortes: [status] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({ useRenderFinal: vi.fn() }));
vi.mock('@/features/editor/useCortes', () => ({
  useCorte: () => ({ data: corte, isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: [corte], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn() }),
  useToggleFire: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/editor/fase2/SceneTimeline', () => ({ SceneTimeline: () => null }));
vi.mock('@/features/metadata/MetadataModal', () => ({ MetadataModal: () => null }));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const { FinalReviewPage } = await import('../FinalReviewPage');

function render(): string {
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

/** Cada linha do checklist: [rótulo, classe do glifo do item, tem check?]. */
function linhasDoChecklist(html: string): [string, string, boolean][] {
  const card = html.slice(html.indexOf('Checklist'));
  // Cada linha termina no próprio </div>: sem o corte, a última engoliria o
  // cartão da capa logo abaixo (e o ícone de editar dele).
  const linhas = card
    .split(/<div class="flex items-center gap-2\.5/)
    .slice(1, 7)
    .map((linha) => linha.slice(0, linha.indexOf('</div>')));
  return linhas.map((linha) => {
    const svgs = linha.match(/<svg[^>]*>/g) ?? [];
    const rotulo = linha.match(/<span class="text-\[12\.5px\][^>]*>([^<]*)</)?.[1] ?? '';
    const glifo = svgs.at(-1)?.match(/lucide-([\w-]+)/)?.[1] ?? '';
    return [rotulo, glifo, svgs.length === 2];
  });
}

describe('FinalReviewPage — checklist', () => {
  it('cada item tem o seu ícone, na ordem do checklist', () => {
    expect(linhasDoChecklist(render()).map(([rotulo, glifo]) => [rotulo, glifo])).toEqual([
      ['Render final concluído', 'check'],
      ['Overlays aplicados', 'sparkles'],
      ['Color grade aplicado', 'palette'],
      ['Metadados preenchidos', 'file-text'],
      ['Capa renderizada', 'pen-line'],
      ['Áudio normalizado (-14 LUFS)', 'volume-x'],
    ]);
  });

  it('o ícone do item sai a 14 px, no tom de aviso quando pendente', () => {
    const html = render();
    const card = html.slice(html.indexOf('Checklist'));
    const iconeDoRender = card.match(/<svg[^>]*lucide-sparkles[^>]*>/)?.[0] ?? '';
    expect(iconeDoRender).toContain('width="14"');
    expect(iconeDoRender).toContain('text-[var(--wb-warn)]');
  });

  it('só o item feito ganha o check na bolinha, e o contador acompanha', () => {
    status = statusExportPendente({
      corte_id: 'c1',
      numero: 1,
      titulo: 'Corte 1',
      grade_pronta: true,
      metadados_completos: true,
    });
    const html = render();
    const feitos = linhasDoChecklist(html)
      .filter(([, , check]) => check)
      .map(([rotulo]) => rotulo);
    expect(feitos).toEqual(['Color grade aplicado', 'Metadados preenchidos']);
    expect(html).toContain('2/6');
  });
});
