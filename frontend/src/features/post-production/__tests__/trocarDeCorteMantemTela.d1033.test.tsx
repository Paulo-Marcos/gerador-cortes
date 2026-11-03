import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { viuRodarNestaVisita } from '@/features/editor/editorEditState';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { corteDaLive, telaDaRota } from '@/upgrade/upgradeRoutes';

// D-1033: J, K e a lista levavam o corte seguinte à etapa em que ELE estava: K
// no editor do corte 5 abria a Revisão do 6. Quem está numa tela trabalha nela;
// andar de corte em corte é só trocar o corte. Os saltos que seguem o trabalho
// (bruto pronto → Pós, render pronto → Revisão) não passam por aqui e ficam.

const corteDe = (id: string, patch: Partial<Corte> = {}) =>
  ({
    id,
    projeto_id: 'p1',
    numero: 1,
    titulo_proposto: id,
    inicio_seg: 0,
    fim_seg: 10,
    desvios: [],
    status: 'aprovado',
    is_pos_producao: 0,
    arquivo_clip_path: '',
    ...patch,
  }) as unknown as Corte;

// Um corte em cada etapa: é o estágio de cada um que antes decidia o destino.
const SEM_BRUTO = corteDe('sem-bruto');
const COM_BRUTO = corteDe('com-bruto', { arquivo_clip_path: 'clip_raw.mkv' });
const COM_FINAL = corteDe('com-final', { arquivo_clip_path: 'clip_raw.mkv', is_pos_producao: 1 });
const CORTES = [SEM_BRUTO, COM_BRUTO, COM_FINAL];

const statusDe = (corte: Corte, patch: Partial<StatusExportCorte>) => ({
  ...statusExportPendente({ corte_id: corte.id, numero: 1, titulo: corte.id }),
  ...patch,
});
const STATUS = [
  statusDe(SEM_BRUTO, {}),
  statusDe(COM_BRUTO, { raw_pronto: true }),
  statusDe(COM_FINAL, { raw_pronto: true, video_pronto: true }),
];

let caminhoDoCorte: ((corte: Corte) => string) | null = null;

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
  useExportStatus: () => ({ data: { cortes: STATUS }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({
  useRenderFinal: () => ({ renderFinal: {}, pipelineStatus: {}, pedir: vi.fn(), iniciar: vi.fn() }),
  useStudioUrl: () => '',
}));
vi.mock('@/features/editor/useBruto', () => ({
  useGerarBruto: () => ({ mutate: vi.fn(), isPending: false }),
  useStatusBruto: () => ({ data: undefined }),
}));
vi.mock('@/features/editor/useCortes', () => ({
  useCorte: () => ({ data: COM_BRUTO, isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: CORTES, isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn() }),
  useToggleFire: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/editor/fase2/SceneTimeline', () => ({ SceneTimeline: () => null }));
vi.mock('@/features/editor/fase2/EditorFase2', () => ({ EditorFase2: () => null }));
vi.mock('@/features/metadata/MetadataModal', () => ({ MetadataModal: () => null }));
vi.mock('@/features/metadata/MetadadosDoCorteModal', () => ({
  MetadadosDoCorteModal: () => null,
  statusMinimo: () => ({}),
}));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: (props: { caminhoDoCorte: (corte: Corte) => string; children?: ReactNode }) => {
    caminhoDoCorte = props.caminhoDoCorte;
    return <>{props.children}</>;
  },
}));

const { FinalReviewPage } = await import('@/features/final-review/FinalReviewPage');
const { ScenesPostProductionPage } = await import('../ScenesPostProductionPage');

function destinosAPartirDe(rota: string, caminho: string, pagina: ReactNode) {
  caminhoDoCorte = null;
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[rota]}>
            <Routes>
              <Route path={caminho} element={pagina} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  expect(caminhoDoCorte).not.toBeNull();
  return CORTES.map((corte) => caminhoDoCorte!(corte));
}

describe('D-1033 · trocar de corte não troca de tela', () => {
  it('na Revisão, qualquer corte abre na Revisão, esteja ele em que etapa estiver', () => {
    const destinos = destinosAPartirDe(
      '/projetos/p1/final-review?corte=com-bruto',
      '/projetos/:id/final-review',
      <FinalReviewPage />,
    );
    expect(destinos).toEqual([
      '/projetos/p1/final-review?corte=sem-bruto',
      '/projetos/p1/final-review?corte=com-bruto',
      '/projetos/p1/final-review?corte=com-final',
    ]);
  });

  it('na Pós, qualquer corte abre na Pós, esteja ele em que etapa estiver', () => {
    const destinos = destinosAPartirDe(
      '/projetos/p1/post-production?corte=com-bruto',
      '/projetos/:id/post-production',
      <ScenesPostProductionPage />,
    );
    expect(destinos).toEqual([
      '/projetos/p1/post-production?corte=sem-bruto',
      '/projetos/p1/post-production?corte=com-bruto',
      '/projetos/p1/post-production?corte=com-final',
    ]);
  });

  it('na Pós, o ?fase=2 de quem chegou pelo bruto continua na troca', () => {
    const destinos = destinosAPartirDe(
      '/projetos/p1/post-production?corte=com-bruto&fase=2',
      '/projetos/:id/post-production',
      <ScenesPostProductionPage />,
    );
    expect(destinos[2]).toBe('/projetos/p1/post-production?corte=com-final&fase=2');
  });

  // O hook do editor depende de roteador e de uma dúzia de consultas; a ligação
  // se confere na fonte, como nos outros testes de acordo do editor.
  it('no editor, K, J, a lista e o próximo depois de excluir ficam no editor', () => {
    const pagina = fonte('../../editor/EditorPage.tsx');
    expect(pagina).toContain('caminhoDoCorte={(item) => rawEditorPath(projetoId, item.id)}');

    const hook = fonte('../../editor/useEditorPage.tsx');
    expect(hook.match(/navigate\(rawEditorPath\(projetoId, cortes\[next\]\.id\)\);/g)).toHaveLength(2);
    expect(hook).not.toContain('resolveCorteStagePath');
  });

  // A URL continua sendo a que a casca sabe ler: o menu e a trilha acendem a
  // etapa certa e levam ao corte aberto (D-798).
  it.each([
    ['/projetos/p1/cortes/c9', '', 'cortes'],
    ['/projetos/p1/post-production', '?corte=c9', 'pos'],
    ['/projetos/p1/final-review', '?corte=c9', 'revisao'],
  ])('a casca reconhece a tela e o corte em %s%s', (caminho, busca, tela) => {
    expect(telaDaRota(caminho)).toBe(tela);
    expect(corteDaLive(caminho, busca)).toBe('c9');
  });
});

// O estado de um corte não pode gravar no outro: a seleção do corte 5 riscava um
// trecho do 6 no Ctrl+Delete. A instância nova zera tudo de uma vez.
describe('D-1033 · cada corte abre numa instância nova da tela', () => {
  function chaveEm(rota: string): string | null {
    let chave: string | null = null;
    function Sonda() {
      chave = UmaTelaPorCorte({ children: null }).key;
      return null;
    }
    renderToStaticMarkup(
      <MemoryRouter initialEntries={[rota]}>
        <Sonda />
      </MemoryRouter>,
    );
    return chave;
  }

  it.each([
    ['/projetos/p1/cortes/a?fase=1', '/projetos/p1/cortes/b?fase=1'],
    ['/projetos/p1/post-production?corte=a', '/projetos/p1/post-production?corte=b'],
    ['/projetos/p1/final-review?corte=a', '/projetos/p1/final-review?corte=b'],
  ])('%s e %s são instâncias diferentes', (deA, deB) => {
    expect(chaveEm(deA)).toBe('a');
    expect(chaveEm(deB)).toBe('b');
  });

  it('o ?fase=2 do mesmo corte não troca a instância', () => {
    expect(chaveEm('/projetos/p1/post-production?corte=a&fase=2')).toBe('a');
  });

  it('as três telas do corte passam por ela nas rotas', () => {
    const rotas = fonte('../../../routes.tsx');
    expect(rotas).toContain("'projetos/:id/cortes/:corteId', element: <UmaTelaPorCorte><EditorPage /></UmaTelaPorCorte>");
    expect(rotas).toMatch(/'projetos\/:id\/post-production', element: <UmaTelaPorCorte>.*<ScenesPostProductionPage \/>.*<\/UmaTelaPorCorte>/);
    expect(rotas).toContain("'projetos/:id/final-review', element: <UmaTelaPorCorte><FinalReviewPage /></UmaTelaPorCorte>");
  });
});

// Bruto pronto vai à Pós e render pronto vai à Revisão quando a tela acompanhava
// o trabalho. Voltar com J a um corte que terminou longe dali é só trocar de corte.
describe('D-1033 · só salta quem viu o trabalho rodar', () => {
  const ABRIU = 1_000;

  it('status rodando lido depois de a tela abrir conta', () => {
    expect(viuRodarNestaVisita(false, true, ABRIU + 1, ABRIU)).toBe(true);
    expect(viuRodarNestaVisita(false, true, ABRIU, ABRIU)).toBe(true);
  });

  it('status rodando que veio do cache, de antes de abrir, não conta', () => {
    expect(viuRodarNestaVisita(false, true, ABRIU - 1, ABRIU)).toBe(false);
  });

  it('status parado não conta', () => {
    expect(viuRodarNestaVisita(false, false, ABRIU + 1, ABRIU)).toBe(false);
  });

  it('quem já viu rodar continua tendo visto quando o trabalho acaba', () => {
    expect(viuRodarNestaVisita(true, false, ABRIU + 5, ABRIU)).toBe(true);
  });

  // Os efeitos não rodam em renderToStaticMarkup; a ligação se confere na fonte.
  it('o editor só vai à Pós se viu o bruto rodar, com o status lido na hora', () => {
    const hook = fonte('../../editor/useEditorPage.tsx');
    expect(hook).toContain('viuRodarNestaVisita(viuBrutoRodarRef.current, processando, brutoLidoEm, visitaDesde)');
    expect(hook).toContain('if (viuBrutoRodarRef.current) navigate(postProductionPath(projetoId, corteId, true));');
  });

  it('a Pós só vai à Revisão se viu o render rodar, e pedir o render conta como ver', () => {
    const render = fonte('../../editor/useRender.ts');
    expect(render).toContain('viuRodarNestaVisita(assistiuRef.current, status.running, statusLidoEm, visitaDesde)');
    expect(render).toMatch(/function iniciar\([^)]*\) \{\s+if \(!corteId\) return;\s+assistiuRef\.current = true;/);
    expect(fonte('../ScenesPostProductionPage.tsx')).toContain(
      'resolveRenderCompletionPath({ projetoId, corteId, finished: concluiu && assistiu })',
    );
  });
});

function fonte(caminho: string): string {
  return readFileSync(resolve(__dirname, caminho), 'utf8');
}
