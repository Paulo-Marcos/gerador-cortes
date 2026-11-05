import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';

// D-1044: "Áudio normalizado" saiu do checklist porque ficava verde sempre que o vídeo
// existia, mesmo ao lado de boletim com aviso de volume. O item que entra não pode
// repetir o defeito: "Cenas validadas" lê o corte, e o render pronto não o acende.

const h = vi.hoisted(() => ({ corte: {} as unknown as Corte, status: {} as unknown as StatusExportCorte }));

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
  useExportStatus: () => ({ data: { cortes: [h.status] }, isLoading: false, isError: false, refetch: vi.fn() }),
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
vi.mock('../BoletimTecnicoCard', () => ({ BoletimTecnicoPainel: () => null }));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

const { FinalReviewPage } = await import('../FinalReviewPage');

/** A linha do checklist com este rótulo: tem o check de feita? */
function itemFeito(rotulo: string, cenasValidadas: number, videoPronto: boolean, cenas: unknown[] = [{}]): boolean {
  h.corte = {
    id: 'c1',
    projeto_id: 'p1',
    numero: 1,
    titulo_proposto: 'Corte 1',
    inicio_seg: 0,
    fim_seg: 10,
    desvios: [],
    status: 'aprovado',
    is_pos_producao: 0,
    cenas_validadas: cenasValidadas,
    cenas_remotion: cenas,
  } as unknown as Corte;
  h.status = statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'Corte 1', video_pronto: videoPronto });
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
  const linha = html
    .slice(html.indexOf('Checklist'))
    .split(/<div class="flex items-center gap-2\.5/)
    .find((l) => l.includes(rotulo));
  expect(linha).toBeDefined();
  const svgs = linha!.slice(0, linha!.indexOf('</div>')).match(/<svg[^>]*>/g) ?? [];
  return svgs.length === 2 && /lucide-check(?![\w-])/.test(svgs[0]);
}

describe('D-1044 · "Cenas validadas" lê o corte', () => {
  it('cenas validadas: o item fica feito', () => {
    expect(itemFeito('Cenas validadas', 1, false)).toBe(true);
  });

  it('cenas por validar, com o vídeo pronto: o item NÃO fica verde', () => {
    expect(itemFeito('Cenas validadas', 0, true)).toBe(false);
  });

  it('corte sem cenas fica pendente: o backend recusa validar, e nada foi validado', () => {
    expect(itemFeito('Cenas validadas', 0, true, [])).toBe(false);
  });

  it('o render pronto continua acendendo só o item do render', () => {
    expect(itemFeito('Render final concluído', 0, true)).toBe(true);
  });
});
