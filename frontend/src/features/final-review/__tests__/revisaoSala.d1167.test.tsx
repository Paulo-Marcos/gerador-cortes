import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { Corte, StatusExportCorte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import type { ChromeBarra } from '@/upgrade/UpgradeChrome';

// D-1167 (E-069 H-19; DIRECAO §3, §5 e §7.5): a Revisão na Sala escura. A tela inteira com o
// hook de verdade e só as fronteiras trocadas; a casca vira um stub que desenha a barra de ação
// que a página declara, para a régua contar o primário no HTML que o operador vê.

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
  useExportStatus: () => ({ data: { cortes: [status] }, isLoading: false, isError: false, refetch: vi.fn() }),
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
  BancadaChrome: ({ barra }: { barra: ChromeBarra; children?: ReactNode }) => <ActionBar barra={barra} />,
}));

const { FinalReviewPage } = await import('../FinalReviewPage');

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

const DA_PASTA = resolve(__dirname, '..');
const fontes = readdirSync(DA_PASTA)
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => [f, readFileSync(join(DA_PASTA, f), 'utf8')] as const);

describe('D-1167 · Revisão na Sala escura', () => {
  it('uma só primária, acesa: a da barra de ação', () => {
    status = statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'Corte 1', pronto_publicar: true });
    const html = tela();
    esperarPrimarios(html, 'Revisao');
    expect(html).toContain('Publicar 1 corte');
  });

  it('o botão da tela (Pasta, Editar) é da variante nova', () => {
    const html = tela();
    expect(html).toMatch(/<button[^>]*data-variant="fantasma"[^>]*>[\s\S]*?Editar/);
    expect(html).not.toMatch(/data-variant="(?:default|outline|ghost|secondary|danger)"[^>]*>[^<]*<svg[^>]*lucide-pencil/);
  });

  it('o checklist e a capa dizem o estado pelo Selo (forma além da cor)', () => {
    const html = tela();
    expect(html).toMatch(/data-tom="convite"[^>]*>[\s\S]*?0\/6/);
    expect(html).toMatch(/data-tom="convite"[^>]*>[\s\S]*?pendente/);
  });

  it.each(fontes)('%s: sem blur, sem style de aparência, sem token legado, sem caixa-alta e sem fonte solta', (_n, texto) => {
    const codigo = texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<![:\w'"`])\/\/[^\n]*/g, '');
    expect(codigo).not.toMatch(/backdrop-filter|backdropFilter|backdrop-blur/);
    expect(codigo).not.toMatch(/style=\{\{/);
    expect(codigo).not.toMatch(/var\(--wb-|\buppercase\b|text-\[\d/);
    expect(codigo).not.toMatch(/\btransition-all\b/);
  });

  it('a Revisão toca vídeo: o painel do player é sólido, sem vidro por trás', () => {
    status = statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'Corte 1', video_pronto: true });
    // A barra de ação é da casca (vidro é dela); o que se mede é o conteúdo da tela.
    const html = tela();
    const conteudo = html.slice(html.indexOf('Vídeo final') - 200);
    expect(conteudo).toContain('<video');
    expect(conteudo).toContain('bg-painel-solido');
    expect(conteudo).not.toMatch(/backdrop|cc-vidro-casca/);
  });
});
