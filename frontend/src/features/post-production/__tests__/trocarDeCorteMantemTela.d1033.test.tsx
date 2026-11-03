import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { brutoAcabouDeFicarPronto } from '@/features/editor/editorEditState';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
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
  beforeEach(() => vi.stubGlobal('window', { localStorage: { getItem: () => null } }));

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

// Ficando no editor, o status do bruto passa de um corte para o outro no mesmo
// efeito. "cortando" do 5 seguido de "pronto" do 6 não é o bruto terminando.
describe('D-1033 · só o bruto do próprio corte leva à Pós', () => {
  it('o salto continua quando o bruto DESTE corte fica pronto', () => {
    expect(
      brutoAcabouDeFicarPronto({ corteId: 'a', status: 'cortando' }, { corteId: 'a', status: 'pronto' }),
    ).toBe(true);
    expect(
      brutoAcabouDeFicarPronto({ corteId: 'a', status: 'processando' }, { corteId: 'a', status: 'pronto' }),
    ).toBe(true);
  });

  it('trocar para um corte de bruto pronto, com outro gerando, não salta', () => {
    expect(
      brutoAcabouDeFicarPronto({ corteId: 'a', status: 'cortando' }, { corteId: 'b', status: 'pronto' }),
    ).toBe(false);
  });

  it('abrir um corte que já estava pronto não salta', () => {
    expect(
      brutoAcabouDeFicarPronto({ corteId: 'a', status: 'pronto' }, { corteId: 'a', status: 'pronto' }),
    ).toBe(false);
  });

  it('o editor decide pelo par corte e status, e a ida à Pós continua lá', () => {
    const hook = fonte('../../editor/useEditorPage.tsx');
    expect(hook).toContain('brutoAcabouDeFicarPronto(anterior, { corteId, status: atual })');
    expect(hook).toContain('navigate(postProductionPath(projetoId, corteId, true));');
  });
});

// Na Pós, a marca "render rodando" é estado e chega um render atrasada na troca
// de corte. Sem conferir a marca do corte aberto, o render antigo do corte novo
// contava como concluído, e o aoAcabar levava à Revisão dele. O efeito não roda
// em renderToStaticMarkup; a ligação se confere na fonte.
describe('D-1033 · a marca de render é do corte aberto', () => {
  it('o desfecho só vale para o corte que tem a marca', () => {
    expect(fonte('../../editor/useRender.ts')).toContain(
      'if (!corteId || !marcado || !renderFinalMarcado(corteId)) return;',
    );
  });

  it('o render concluído continua levando à Revisão', () => {
    expect(fonte('../ScenesPostProductionPage.tsx')).toContain(
      'const renderTarget = resolveRenderCompletionPath({ projetoId, corteId, finished: concluiu });',
    );
  });
});

function fonte(caminho: string): string {
  return readFileSync(resolve(__dirname, caminho), 'utf8');
}
