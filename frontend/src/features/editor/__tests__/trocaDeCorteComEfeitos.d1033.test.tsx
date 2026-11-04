import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PipelineStatusResponse } from '@/types/models';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { useEditorPage } from '../useEditorPage';
import { pipelineStatusKey, useRenderFinal } from '../useRender';
import { assentar, montar } from './domMinimo';

// D-1033: o que acontece com uma tela viva quando o trabalho acaba ou o corte
// troca, com os efeitos rodando de verdade. Os saltos só valem para quem viu o
// trabalho rodar, o ajuste pendente é salvo antes de sair, e a recusa de um pedido
// em andamento não some quando a tela já foi desmontada.

const h = vi.hoisted(() => {
  const desvio = (inicio: string, fim: string) => ({ inicio_hms: inicio, fim_hms: fim, motivo: 'teste', origem: 'claude' });
  const corteDe = (id: string, numero: number, inicio: string, fim: string) => ({
    id,
    numero,
    projeto_id: 'p1',
    status: 'aprovado',
    titulo_proposto: id,
    inicio_seg: 0,
    fim_seg: 600,
    desvios: [desvio(inicio, fim)],
  });
  return {
    cortes: [corteDe('c5', 5, '00:04:50.000', '00:04:56.000'), corteDe('c6', 6, '00:05:50.000', '00:05:55.000')],
    mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
    salvar: vi.fn(),
    bruto: { data: undefined as { status: string } | undefined, dataUpdatedAt: 0 },
    redesenhar: (): void => undefined,
    obterStatus: vi.fn(),
    renderizar: vi.fn(),
  };
});

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useAbrirPasta: h.mutacao,
  useExportStatus: () => ({ data: { cortes: [] } }),
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
}));
vi.mock('@/features/settings', () => ({
  useContextoCorte: () => ({ antesSeg: 0, depoisSeg: 0 }),
  useVelocidadePlayerPadrao: () => 1,
}));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosVisiveis: () => [] }));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAdicionarDesvio: h.mutacao,
  useAtualizarCorte: () => ({ mutate: h.salvar, mutateAsync: vi.fn(), isPending: false }),
  useCorte: (id: string) => ({ data: h.cortes.find((c) => c.id === id), isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: h.cortes, isLoading: false, isError: false }),
  useDeletarCorte: h.mutacao,
  useDividirCorte: h.mutacao,
  useJuntarCortes: h.mutacao,
  useSincronizarTranscricao: h.mutacao,
  useToggleFire: h.mutacao,
  useToggleLeitura: h.mutacao,
}));
vi.mock('@/features/editor/useBruto', () => ({
  avisarSeBrutoOcupado: () => false,
  useGerarBruto: h.mutacao,
  useStatusBruto: () => h.bruto,
}));
vi.mock('@/features/editor/useGeracoesDaIa', () => ({
  useGerarMetadadosClaude: h.mutacao,
  useGerarTrechosClaude: h.mutacao,
  useStatusMetadadosClaude: () => undefined,
  useTrechosClaudeEmAndamento: () => false,
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirmacao: () => ({ pedir: vi.fn() }) }));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({ useTrechosRiscados: () => ({ riscar: vi.fn() }) }));
vi.mock('../api/render', () => ({
  renderApi: { obterPipelineStatus: h.obterStatus, renderizarRemotion: h.renderizar },
}));

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1033 · o editor com o bruto e com o ajuste pendente', () => {
  let tela: ReturnType<typeof useEditorPage>;
  function Sonda() {
    const [, setVolta] = useState(0);
    h.redesenhar = () => setVolta((n) => n + 1);
    tela = useEditorPage();
    return null;
  }
  const abrir = async () => {
    const roteador = createMemoryRouter(
      [
        { path: '/projetos/:id/cortes/:corteId', element: <UmaTelaPorCorte><Sonda /></UmaTelaPorCorte> },
        { path: '/projetos/:id/post-production', element: null },
      ],
      { initialEntries: ['/projetos/p1/cortes/c5'] },
    );
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
    return roteador;
  };
  const rota = (r: { state: { location: { pathname: string; search: string } } }) =>
    r.state.location.pathname + r.state.location.search;
  const proximoCorte = () => tela.bindings.find((b) => b.description === 'Próximo corte')!.action();

  beforeEach(() => {
    h.salvar.mockReset();
    h.bruto = { data: undefined, dataUpdatedAt: 0 };
  });

  it('bruto visto rodando com a tela aberta leva à Pós quando fica pronto', async () => {
    h.bruto = { data: { status: 'cortando' }, dataUpdatedAt: Date.now() + 60_000 };
    const roteador = await abrir();
    h.bruto = { data: { status: 'pronto' }, dataUpdatedAt: Date.now() + 120_000 };
    h.redesenhar();
    await assentar();
    expect(rota(roteador)).toBe('/projetos/p1/post-production?corte=c5&fase=2');
  });

  it('voltar a um corte cujo bruto terminou longe dali não salta', async () => {
    // "cortando" é do cache, lido antes de esta tela abrir; "pronto" chega agora.
    h.bruto = { data: { status: 'cortando' }, dataUpdatedAt: 1 };
    const roteador = await abrir();
    h.bruto = { data: { status: 'pronto' }, dataUpdatedAt: Date.now() + 60_000 };
    h.redesenhar();
    await assentar();
    expect(rota(roteador)).toBe('/projetos/p1/cortes/c5');
  });

  it('com ajuste pendente, o K salva antes e abre o corte seguinte limpo', async () => {
    h.salvar.mockImplementation((_patch, { onSuccess }) => onSuccess());
    const roteador = await abrir();
    tela.patchDirty({ inicio_seg: 10 });
    await assentar();
    expect(tela.isDirty).toBe(true);

    proximoCorte();
    await assentar();
    expect(h.salvar).toHaveBeenCalledWith({ inicio_seg: 10 }, expect.anything());
    expect(rota(roteador)).toBe('/projetos/p1/cortes/c6?fase=1');
    expect(tela.corteId).toBe('c6');
    expect(tela.isDirty).toBe(false);
  });

  it('se salvar falhar, o K não sai do corte e o ajuste continua', async () => {
    h.salvar.mockImplementation((_patch, { onError }) => onError(new Error('sem rede')));
    const roteador = await abrir();
    tela.patchDirty({ inicio_seg: 10 });
    await assentar();

    proximoCorte();
    await assentar();
    expect(rota(roteador)).toBe('/projetos/p1/cortes/c5');
    expect(tela.isDirty).toBe(true);
  });
});

describe('D-1033 · o render com a tela aberta, de volta e já desmontada', () => {
  const statusDe = (running: boolean): PipelineStatusResponse => ({
    fases: { raw: true, grade: !running, overlays: !running, compose: !running, render_final: !running, encode: !running },
    overlays_count: 0,
    tem_etapas_concluidas: !running,
    state: running ? 'running' : 'done',
    progress: running ? 40 : 100,
    stage: 'x',
    running,
    elapsed_seconds: 1,
    error: '',
  });
  const reacoes = { aoMudarStatus: vi.fn(), aoAcabar: vi.fn(), aoFalharAoIniciar: vi.fn() };
  let render: ReturnType<typeof useRenderFinal>;
  function Sonda() {
    render = useRenderFinal('c1', reacoes);
    return null;
  }
  const abrir = async (guardado: Record<string, string>, qc = new QueryClient()) => {
    const montado = montar(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
      guardado,
    );
    limpar = montado.limpar;
    await assentar();
    return { qc, desmontar: montado.desmontar };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    h.renderizar.mockReset();
    h.obterStatus.mockReset();
  });

  it('render visto rodando conta como assistido quando termina', async () => {
    h.obterStatus.mockResolvedValue(statusDe(true));
    const { qc } = await abrir({ 'render-final:c1': 'running' });
    expect(reacoes.aoAcabar).not.toHaveBeenCalled();

    h.obterStatus.mockResolvedValue(statusDe(false));
    await qc.invalidateQueries({ queryKey: pipelineStatusKey('c1') });
    await assentar();
    expect(reacoes.aoAcabar).toHaveBeenCalledWith(expect.objectContaining({ concluiu: true, assistiu: true }));
  });

  it('voltar a um corte cujo render terminou longe dali não conta como assistido', async () => {
    const qc = new QueryClient();
    qc.setQueryData(pipelineStatusKey('c1'), statusDe(true), { updatedAt: 1 });
    h.obterStatus.mockResolvedValue(statusDe(false));
    const guardado = { 'render-final:c1': 'running' };
    await abrir(guardado, qc);
    expect(reacoes.aoAcabar).toHaveBeenCalledWith(expect.objectContaining({ concluiu: true, assistiu: false }));
    expect(guardado).toEqual({});
  });

  it('voltar com o render ainda rodando conta como assistido, mesmo com o status igual ao do cache', async () => {
    const qc = new QueryClient();
    qc.setQueryData(pipelineStatusKey('c1'), statusDe(true), { updatedAt: 1 });
    h.obterStatus.mockResolvedValue(statusDe(true));
    await abrir({ 'render-final:c1': 'running' }, qc);

    h.obterStatus.mockResolvedValue(statusDe(false));
    await qc.invalidateQueries({ queryKey: pipelineStatusKey('c1') });
    await assentar();
    expect(reacoes.aoAcabar).toHaveBeenCalledWith(expect.objectContaining({ assistiu: true }));
  });

  it('quem pediu o render assistiu, mesmo que ele termine antes de o status mostrar', async () => {
    h.obterStatus.mockResolvedValue(statusDe(false));
    h.renderizar.mockResolvedValue({});
    await abrir({});
    render.iniciar({ startFrom: 'grade' });
    await assentar();
    expect(reacoes.aoAcabar).toHaveBeenCalledWith(expect.objectContaining({ assistiu: true }));
  });

  it('a recusa do render chega mesmo com a tela já desmontada, e a marca sai', async () => {
    h.obterStatus.mockResolvedValue(statusDe(false));
    let recusar: (motivo: Error) => void = () => undefined;
    h.renderizar.mockReturnValue(
      new Promise((_ok, falha) => {
        recusar = falha;
      }),
    );
    const guardado: Record<string, string> = {};
    const { desmontar } = await abrir(guardado);
    render.iniciar({ startFrom: 'grade' });
    await assentar();
    expect(guardado['render-final:c1']).toBe('running');

    desmontar();
    recusar(new Error('recusado'));
    await assentar();
    expect(reacoes.aoFalharAoIniciar).toHaveBeenCalledWith(expect.objectContaining({ message: 'recusado' }));
    expect(guardado).toEqual({});
  });
});

describe('D-1033 · aprovar e salvar o layout não perdem o aviso de erro', () => {
  // A página e o painel dependem de dezenas de consultas; a ligação se confere na
  // fonte, como nos outros testes de acordo. O render acima prova o mecanismo.
  const fonte = (caminho: string) => readFileSync(resolve(__dirname, caminho), 'utf8');

  it('usam a promessa da mutação, que roda depois do desmonte', () => {
    expect(fonte('../../final-review/FinalReviewPage.tsx')).toContain(
      "atualizarCorte.mutateAsync({ status: 'aprovado' }).then(",
    );
    expect(fonte('../fase2/useGravarLayout.ts')).toContain(
      'gravarNoCorte({ layout_youtube: mudancas } as Partial<Corte>).then(',
    );
  });
});
