import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { transcricaoDoCorteKey } from '../legendasDoCorte';

// D-973: a D-972 descartava a legenda guardada do short só no "Refazer
// transcrição". Toda ação que ressincroniza a transcrição do corte no backend
// (CorteService._exec_sincronia) reescreve as mesmas palavras — e a prévia
// seguia com a legenda velha até recarregar a página. Cada mutação aqui roda
// de verdade (o observador nasce no primeiro render), contra a API simulada.

const corte = (id: string) => ({ id });
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/features/editor/api/cortes', () => ({
  cortesApi: {
    sincronizarTranscricao: vi.fn(async (id: string) => corte(id)),
    atualizarCorte: vi.fn(async (id: string) => corte(id)),
    dividirCorte: vi.fn(async (id: string) => [corte(id), corte('novo')]),
    // Quem começa antes sobrevive: aqui o sobrevivente é o OUTRO corte.
    juntarCortes: vi.fn(async () => corte('c2')),
    importarDesvios: vi.fn(async (id: string) => corte(id)),
    analisarDesviosCorte: vi.fn(async (id: string) => corte(id)),
    analisarDesviosTodos: vi.fn(async () => ({})),
  },
}));
vi.mock('@/features/editor/api/arranjo', () => ({
  arranjoApi: { moverBloco: vi.fn(async () => ({ blocos: [] })) },
}));
vi.mock('@/features/editor/api/bruto', () => ({
  brutoApi: {
    cortarClipBruto: vi.fn(async () => ({})),
    statusClipBruto: vi.fn(async (id: string) => ({ corte_id: id, status: 'pronto' })),
  },
}));
vi.mock('@/features/ia', () => ({
  geracaoIaApi: {
    gerarTrechosClaude: vi.fn(async () => ({ novos: 1, total_desvios: 1 })),
    analisarViaClaude: vi.fn(async () => ({ total_cortes: 2 })),
  },
}));
vi.mock('@/features/diarizacao/api', () => ({
  diarizacaoApi: { diarizarCorte: vi.fn(async () => ({ ok: true, falantes: {} })) },
}));

const { useSincronizarTranscricao, useAtualizarCorte, useDividirCorte, useJuntarCortes } =
  await import('@/features/editor/useCortes');
const { useImportarDesvios, useAnalisarDesvios } = await import('@/features/editor/useCortes');
const { useArranjoOps } = await import('@/features/editor/useArranjo');
const { useGerarBruto, buscarStatusBruto, statusBrutoKey } = await import(
  '@/features/editor/useBruto'
);
const { useGerarTrechosClaude } = await import('@/features/editor/useGeracoesDaIa');
const { useDiarizarCorte, useAnalisarComDiarizacao } = await import(
  '@/features/diarizacao/useDiarizacao'
);
const { useAnalisarViaClaude, useAnalisarDesviosTodos } = await import(
  '@/features/projeto-detalhe/useProjetoDetalhe'
);
const { aoGerarShortsDoFire, aoDispararLive } = await import('../aposGerarShorts');

function comLegendas() {
  const qc = new QueryClient();
  for (const id of ['c1', 'c2']) {
    qc.setQueryData(transcricaoDoCorteKey(id), { fonte: 'auto_legenda', palavras: [] });
  }
  return qc;
}

const descartadas = (qc: QueryClient) =>
  ['c1', 'c2'].filter((id) => qc.getQueryState(transcricaoDoCorteKey(id))?.isInvalidated);

/** Renderiza o hook uma vez e devolve o que ele expõe, ligado ao `qc`. */
function sondar<T>(qc: QueryClient, usar: () => T): T {
  let exposto: T | undefined;
  function Sonda(): ReactNode {
    exposto = usar();
    return null;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <Sonda />
    </QueryClientProvider>,
  );
  return exposto!;
}

/** Roda a mutação até o fim (onSuccess incluso) e diz que legendas caíram. */
async function aposMutar<V>(
  usar: () => { mutateAsync: (v: V) => Promise<unknown> },
  variaveis: V,
) {
  const qc = comLegendas();
  await sondar(qc, usar).mutateAsync(variaveis);
  return descartadas(qc);
}

describe('D-973 · a legenda do short cai junto com a transcrição do corte', () => {
  it.each([
    ['sincronizar a transcrição', () => useSincronizarTranscricao('c1'), undefined],
    ['salvar os trechos a remover', () => useAtualizarCorte('c1', 'p1'), { desvios: [] }],
    ['mover o início do corte', () => useAtualizarCorte('c1', 'p1'), { inicio_seg: 12 }],
    ['mover o fim do corte', () => useAtualizarCorte('c1', 'p1'), { fim_seg: 90 }],
    ['dividir o corte', () => useDividirCorte('c1', 'p1'), { ponto_seg: 30 }],
    ['importar trechos', () => useImportarDesvios('c1'), []],
    ['analisar silêncios', () => useAnalisarDesvios('c1'), false],
    ['gerar trechos com a IA', () => useGerarTrechosClaude('c1', 'p1'), 'claude'],
    ['diarizar o corte', () => useDiarizarCorte('c1', 'p1'), undefined],
    ['gerar o bruto', () => useGerarBruto('c1', 'p1'), undefined],
  ] as const)('%s descarta só a legenda daquele corte', async (_acao, usar, variaveis) => {
    expect(await aposMutar(usar as never, variaveis)).toEqual(['c1']);
  });

  it('juntar descarta a legenda dos dois cortes, inclusive do sobrevivente', async () => {
    expect(await aposMutar(() => useJuntarCortes('c1', 'p1'), {})).toEqual(['c1', 'c2']);
  });

  it('reordenar os blocos descarta a legenda do corte', async () => {
    const qc = comLegendas();
    await sondar(qc, () => useArranjoOps('c1')).mover.mutateAsync({ de_indice: 0, para_indice: 1 });
    expect(descartadas(qc)).toEqual(['c1']);
  });

  it('um PATCH que não ressincroniza (status, layout) mantém a legenda guardada', async () => {
    // D-479: baixar milhares de palavras a cada aprovação seria o desperdício
    // que o cache eterno evita — só desvios, início e fim reescrevem o texto.
    expect(await aposMutar(() => useAtualizarCorte('c1', 'p1'), { status: 'aprovado' })).toEqual([]);
  });

  it.each([
    ['a análise com diarização', () => useAnalisarComDiarizacao('p1'), { usarDiarizacao: false }],
    ['a análise via Claude', () => useAnalisarViaClaude('p1'), undefined],
  ] as const)('%s da live descarta a legenda de todos os cortes', async (_acao, usar, variaveis) => {
    expect(await aposMutar(usar as never, variaveis)).toEqual(['c1', 'c2']);
  });

  it('gerar trechos de todos os cortes descarta a legenda de todos', async () => {
    const qc = comLegendas();
    sondar(qc, () => useAnalisarDesviosTodos('p1')).disparar('claude');
    await vi.waitFor(() => expect(descartadas(qc)).toEqual(['c1', 'c2']));
  });

  it('o bruto que termina de gerar descarta a legenda (a transcrição vem re-sincronizada)', async () => {
    const qc = comLegendas();
    qc.setQueryData(statusBrutoKey('c1'), { corte_id: 'c1', status: 'cortando' });
    await buscarStatusBruto(qc, 'c1');
    expect(descartadas(qc)).toEqual(['c1']);
  });

  it('consultar um bruto que já estava pronto não descarta nada', async () => {
    const qc = comLegendas();
    qc.setQueryData(statusBrutoKey('c1'), { corte_id: 'c1', status: 'pronto' });
    await buscarStatusBruto(qc, 'c1');
    expect(descartadas(qc)).toEqual([]);
  });

  it('a fábrica de shorts descarta a legenda do Fire e, pela live, a de todos', async () => {
    const doFire = comLegendas();
    await aoGerarShortsDoFire(doFire, 'c1');
    expect(descartadas(doFire)).toEqual(['c1']);

    const daLive = comLegendas();
    await aoDispararLive(daLive);
    expect(descartadas(daLive)).toEqual(['c1', 'c2']);
  });
});
