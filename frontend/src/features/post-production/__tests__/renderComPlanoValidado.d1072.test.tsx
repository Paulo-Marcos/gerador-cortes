import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte } from '@/types/models';
import type { BancadaChromeProps } from '@/features/editor/BancadaChrome';
import { corteKey } from '@/features/editor/useCortes';
import { MOTIVO_PLANO_NAO_VALIDADO, montarPrimarioDaPos } from '../postProductionNavigation';

// D-1072 (RN-38): "Renderizar final" só libera com o plano de cenas validado.
// O backend recusa o mesmo pedido; aqui se fixa a tela: travado com o motivo ao
// lado, e liberado na hora em que o plano é validado, sem recarregar.

function primario(p: Partial<Parameters<typeof montarPrimarioDaPos>[0]> = {}) {
  return montarPrimarioDaPos({
    rodando: false,
    progresso: 0,
    videoPronto: false,
    brutoAusente: false,
    arquivosLimpos: false,
    nuncaGerou: false,
    gerandoBruto: false,
    planoValidado: false,
    onRenderizar: vi.fn(),
    onIrAoEditor: vi.fn(),
    ...p,
  });
}

describe('D-1072 · o principal da Pós e o plano de cenas', () => {
  it('sem o plano validado, o render final fica travado e diz por quê', () => {
    expect(primario()).toMatchObject({
      texto: 'Renderizar final',
      desabilitado: true,
      motivo: 'Renderizar libera quando o plano estiver validado',
    });
  });

  it('com o plano validado, libera', () => {
    const p = primario({ planoValidado: true });
    expect(p).toMatchObject({ texto: 'Renderizar final', desabilitado: false });
    expect('motivo' in p && p.motivo).toBeFalsy();
  });

  it('renderizar de novo também espera o plano validado', () => {
    expect(primario({ videoPronto: true })).toMatchObject({
      texto: 'Renderizar de novo',
      desabilitado: true,
      motivo: MOTIVO_PLANO_NAO_VALIDADO,
    });
  });

  it('sem o bruto, o motivo é o bruto: sem ele, validar não adianta', () => {
    const p = primario({ brutoAusente: true });
    expect(p.desabilitado).toBe(true);
    expect('motivo' in p && p.motivo).toContain('regere o bruto');
  });

  it('rodando, mostra o progresso sem o motivo do plano', () => {
    const p = primario({ rodando: true, progresso: 40 });
    expect(p).toMatchObject({ texto: 'Renderizando 40%', desabilitado: true });
    expect('motivo' in p && p.motivo).toBeFalsy();
  });
});

// ── A página de verdade, com o corte lido do cache do TanStack Query ──

const h = vi.hoisted(() => ({ bancada: null as BancadaChromeProps | null }));

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live', arquivos_limpos: false } }),
  useExportStatus: () => ({ data: { cortes: [] }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({
  useRenderFinal: () => ({
    renderFinal: { isPending: false },
    pipelineStatus: { data: { fases: { raw: true, grade: false, overlays: false, compose: false, encode: false } } },
    marcado: false,
    rodando: false,
    progresso: 0,
    pedir: vi.fn(),
    iniciar: vi.fn(),
  }),
  useStudioUrl: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/features/editor/useBruto', () => ({
  useGerarBruto: () => ({ mutate: vi.fn(), isPending: false }),
  useStatusBruto: () => ({ data: undefined }),
}));
// O `useCorte` é o de verdade: é o cache dele que a validação do plano reescreve.
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCortesProjeto: () => ({ data: [], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleFire: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/settings', () => ({ useVelocidadePlayerPadrao: () => 1 }));
vi.mock('@/features/editor/fase2/EditorFase2', () => ({ EditorFase2: () => null }));
vi.mock('@/features/metadata/MetadadosDoCorteModal', () => ({
  MetadadosDoCorteModal: () => null,
  statusMinimo: () => ({}),
}));
vi.mock('@/features/editor/BancadaChrome', () => ({
  BancadaChrome: (props: BancadaChromeProps & { children?: ReactNode }) => {
    h.bancada = props;
    return null;
  },
}));

const { ScenesPostProductionPage } = await import('../ScenesPostProductionPage');

const CORTE = {
  id: 'c1',
  projeto_id: 'p1',
  numero: 1,
  titulo_proposto: 'Corte',
  status: 'aprovado',
  inicio_seg: 0,
  fim_seg: 60,
  desvios: [],
  is_pos_producao: 0,
  arquivo_clip_path: 'clip_raw.mkv',
  cenas_remotion: [{ tipo: 'tela_cheia', inicio: 0, fim: 5 }],
  cenas_validadas: 0,
} as unknown as Corte;

function desenhar(qc: QueryClient) {
  renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/projetos/p1/post-production?corte=c1']}>
            <Routes>
              <Route path="/projetos/:id/post-production" element={<ScenesPostProductionPage />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return h.bancada!.barra!.primario!;
}

describe('D-1072 · a Pós na página', () => {
  beforeEach(() => {
    h.bancada = null;
  });

  it('trava sem o plano validado e libera quando a validação grava o corte no cache', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    qc.setQueryData(corteKey('c1'), CORTE);

    expect(desenhar(qc)).toMatchObject({ desabilitado: true, motivo: MOTIVO_PLANO_NAO_VALIDADO });

    // É o que `useValidarCenasRemotion` faz no sucesso: o corte da resposta vai
    // para `corteKey`, e a tela relê dali, sem buscar nada de novo.
    qc.setQueryData(corteKey('c1'), { ...CORTE, cenas_validadas: 1 });
    const liberado = desenhar(qc);
    expect(liberado).toMatchObject({ texto: 'Renderizar final', desabilitado: false });
    expect(liberado.motivo).toBeUndefined();
  });

  it('desfazer a validação volta a travar', () => {
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false } } });
    qc.setQueryData(corteKey('c1'), { ...CORTE, cenas_validadas: 1 });
    expect(desenhar(qc).desabilitado).toBe(false);

    qc.setQueryData(corteKey('c1'), { ...CORTE, cenas_validadas: 0 });
    expect(desenhar(qc).desabilitado).toBe(true);
  });
});
