import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte } from '@/types/models';
import type { BancadaChromeProps } from '@/features/editor/BancadaChrome';

// D-1041: a página da Pós de verdade, com o bruto ausente do disco. A regra pura tem
// o seu teste; este fixa os fios: o que a página entrega à regra e o que faz com a
// resposta. Sem ele, entregar `false` no lugar do rastro do corte passava em branco.

const h = vi.hoisted(() => ({
  navegar: vi.fn(),
  corte: {} as unknown as Corte,
  arquivosLimpos: false,
  statusBruto: undefined as string | undefined,
  fases: { raw: false, grade: false, overlays: false, compose: false, encode: false },
  bancada: null as BancadaChromeProps | null,
  videoSrc: null as string | null,
  export: [] as { corte_id: string; video_pronto?: boolean }[],
}));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => h.navegar,
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: { titulo_live: 'Live', arquivos_limpos: h.arquivosLimpos } }),
  useExportStatus: () => ({ data: { cortes: h.export }, isLoading: false, isError: false, refetch: vi.fn() }),
  useAbrirPasta: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/editor/useRender', () => ({
  useRenderFinal: () => ({
    renderFinal: { isPending: false },
    pipelineStatus: { data: { fases: h.fases } },
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
  useStatusBruto: () => ({ data: h.statusBruto ? { status: h.statusBruto } : undefined }),
}));
vi.mock('@/features/editor/useCortes', () => ({
  useCorte: () => ({ data: h.corte, isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: [h.corte], isLoading: false, isError: false }),
  useAtualizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  useToggleFire: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/features/settings', () => ({ useVelocidadePlayerPadrao: () => 1 }));
vi.mock('@/features/editor/fase2/EditorFase2', () => ({
  EditorFase2: (props: { videoSrc: string }) => {
    h.videoSrc = props.videoSrc;
    return null;
  },
}));
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

function abrir(corte: Partial<Corte> = {}) {
  h.corte = {
    id: 'c1',
    projeto_id: 'p1',
    numero: 1,
    titulo_proposto: 'Corte',
    status: 'aprovado',
    inicio_seg: 0,
    fim_seg: 60,
    desvios: [],
    is_pos_producao: 0,
    arquivo_clip_path: '',
    cenas_remotion: [],
    ...corte,
  } as unknown as Corte;
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { enabled: false } } })}>
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
  return { primario: h.bancada!.barra!.primario!, onGerarBruto: h.bancada!.onGerarBruto };
}

describe('D-1041 · a Pós sem bruto, na página', () => {
  beforeEach(() => {
    h.navegar.mockClear();
    h.arquivosLimpos = false;
    h.statusBruto = undefined;
    h.bancada = null;
    h.videoSrc = null;
    h.export = [];
  });

  it('corte que nunca gerou: o principal leva ao editor dele e o Mais não oferece gerar', () => {
    const { primario, onGerarBruto } = abrir();
    expect(primario.texto).toBe('Gerar bruto no editor');
    expect(onGerarBruto).toBeUndefined();
    primario.onClick!();
    expect(h.navegar).toHaveBeenCalledWith('/projetos/p1/cortes/c1?fase=1');
  });

  it.each<[string, Partial<Corte>]>([
    ['cenas', { cenas_remotion: [{ tipo: 'tela_cheia', inicio: 0, fim: 5 }] } as unknown as Partial<Corte>],
    ['ponteiro do arquivo', { arquivo_clip_path: 'clip_raw.mkv' }],
    ['render', { is_pos_producao: 1 }],
  ])('corte devolvido, fora do export, com %s: fica na Pós, com regerar à mão', (_rastro, corte) => {
    const { primario, onGerarBruto } = abrir(corte);
    expect(primario.texto).not.toBe('Gerar bruto no editor');
    expect(primario.desabilitado).toBe(true);
    expect(primario.motivo).not.toContain('limpeza');
    expect(onGerarBruto).toBeDefined();
  });

  it('o export dizendo que o vídeo está pronto também segura o corte na Pós', () => {
    h.export = [{ corte_id: 'c1', video_pronto: true }];
    expect(abrir().primario.texto).toBe('Renderizar de novo');
  });

  it('depois da limpeza completa, o texto a nomeia', () => {
    h.arquivosLimpos = true;
    const { primario } = abrir();
    expect(primario.texto).toBe('Renderizar final');
    expect(primario.motivo).toContain('a limpeza apagou');
  });

  it('com o bruto sendo gerado, o principal diz isso', () => {
    h.statusBruto = 'cortando';
    expect(abrir().primario).toMatchObject({ texto: 'Gerando bruto…', desabilitado: true });
  });

  it('sem nenhuma fonte no disco, o player não pede arquivo', () => {
    abrir();
    expect(h.videoSrc).toBe('');
  });

  it('com vídeo final, o player continua pedindo a fonte', () => {
    h.export = [{ corte_id: 'c1', video_pronto: true }];
    abrir();
    expect(h.videoSrc).toContain('c1');
  });
});
