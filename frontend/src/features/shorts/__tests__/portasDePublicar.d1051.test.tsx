import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ShortSugerido } from '../shortsApi';

// D-1051: a jornada nova não tira nenhuma das portas de publicar: curadoria, Prateleira e
// Prontos. Nenhum teste as segurava, e cada uma podia sumir com o CI verde. O gesto da
// Prateleira também fica aqui: o botão renderiza E manda a IA escrever o post.

const h = vi.hoisted(() => ({
  abrirPainel: false,
  chrome: undefined as undefined | { barra?: { primario?: { texto: string; onClick?: () => void } } },
  shorts: [] as unknown[],
  prontos: [] as unknown[],
  botoes: [] as { children?: unknown; onClick?: () => void }[],
  renderizar: vi.fn(),
  escrever: vi.fn(),
}));

vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    // O cartão da Prateleira abre o painel por um clique, que o render de servidor não dá.
    useState: (inicial: unknown) => react.useState(inicial === null && h.abrirPainel ? 's1' : inicial),
  };
});
vi.mock('@/components/ui/button', () => ({
  Button: (p: { children?: ReactNode; onClick?: () => void }) => {
    h.botoes.push(p);
    return <button type="button">{p.children}</button>;
  },
}));
vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: typeof h.chrome) => {
    h.chrome = chrome;
  },
}));
vi.mock('../PainelPublicacao', () => ({ PainelPublicacao: () => <i>painel de publicar</i> }));
vi.mock('../PublicarEmLoteModal', () => ({
  PublicarEmLoteModal: ({ shorts }: { shorts: unknown[] }) => <i>lote de publicar: {shorts.length}</i>,
}));
vi.mock('../AcoesRapidasDoShort', () => ({ AcoesRapidasDoShort: () => null, GerarCapaComIA: () => null }));
vi.mock('../LinhaDeAjuste', () => ({ LinhaDeAjuste: () => null }));
vi.mock('../ListaDeSegmentos', () => ({ ListaDeSegmentos: () => null }));
vi.mock('../ProgressoRenderPanel', () => ({ ProgressoRenderPanel: () => null }));
vi.mock('../useFires', async (original) => ({
  ...(await original<typeof import('../useFires')>()),
  useFires: () => ({ data: { fires: [] } }),
}));
vi.mock('../useShortsProntos', async (original) => ({
  ...(await original<typeof import('../useShortsProntos')>()),
  useShortsProntos: () => ({ data: { shorts: h.prontos }, isLoading: false, isError: false }),
}));
vi.mock('../useLotePublicacao', async (original) => ({
  ...(await original<typeof import('../useLotePublicacao')>()),
  usePublicacoesDoCorte: () => ({ data: { publicacoes: [] } }),
  useLoteAtual: () => ({ data: undefined }),
}));
vi.mock('../useShortsDoCorte', async (original) => ({
  ...(await original<typeof import('../useShortsDoCorte')>()),
  useShortsDoCorte: () => ({ data: { shorts: h.shorts }, isLoading: false, isError: false }),
  useRenderizarShort: () => ({ mutate: h.renderizar, isPending: false }),
  useProgressoRender: () => null,
  useCapaDoShort: () => ({ data: undefined }),
  usePalcoPadrao: () => ({ data: undefined }),
  useGanchoPadrao: () => ({ data: undefined }),
}));
vi.mock('../useFechoDoShort', () => ({
  useFechoDoShort: () => ({
    abrirPost: vi.fn(),
    abrirCapa: vi.fn(),
    finalizar: (disparar: () => void) => {
      h.escrever();
      disparar();
    },
    modais: null,
  }),
}));

const { CandidatoCard } = await import('../CandidatoCard');
const { default: WorkspaceDoFirePage } = await import('../WorkspaceDoFirePage');
const { default: ShortsProntosPage } = await import('../ShortsProntosPage');

const short = (mudancas: object = {}) =>
  ({
    id: 's1',
    numero: 1,
    titulo: 'Short',
    status: 'renderizado',
    arquivo_short_path: 'a.mp4',
    arquivo_previa_path: '',
    inicio_seg: 0,
    fim_seg: 30,
    duracao_seg: 30,
    score: 8,
    origem: 'claude',
    segmentos: [],
    cenas: [],
    ...mudancas,
  }) as unknown as ShortSugerido;

function comProvedores(tela: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/shorts/c9/workspace']}>
            <Routes>
              <Route path="/shorts/:corteId/workspace" element={tela} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function curadoria(s: ShortSugerido) {
  const nada = vi.fn();
  return comProvedores(
    <CandidatoCard
      {...({
        short: s,
        corteId: 'c9',
        emFoco: true,
        ocupado: false,
        aberto: false,
        onAlternarAjuste: nada,
        onSelecionar: nada,
        onTocar: nada,
        onStatus: nada,
        onBorda: nada,
        onEnquadrarPeloRosto: nada,
        onPalco: nada,
        onSeguirPadrao: nada,
        onDefinirPalco: nada,
        onEscreverGancho: nada,
        onPrevia: nada,
        onRenderizar: nada,
        onSegmentos: nada,
        tempoAtualSeg: 0,
        duracaoBrutoSeg: 60,
        onIr: nada,
      } as unknown as Parameters<typeof CandidatoCard>[0])}
    />,
  );
}

beforeEach(() => {
  h.abrirPainel = false;
  h.chrome = undefined;
  h.shorts = [short()];
  h.prontos = [];
  h.botoes = [];
  h.renderizar.mockClear();
  h.escrever.mockClear();
});

describe('D-1051 · as três portas de publicar continuam', () => {
  it('curadoria: o short pronto tem o painel de publicar', () => {
    expect(curadoria(short())).toContain('painel de publicar');
  });

  it('curadoria: o short ainda sem render não tem', () => {
    expect(curadoria(short({ status: 'aprovado', arquivo_short_path: '' }))).not.toContain('painel de publicar');
  });

  it('Prateleira: o cartão aberto tem o painel de publicar', () => {
    h.abrirPainel = true;
    expect(comProvedores(<WorkspaceDoFirePage />)).toContain('painel de publicar');
  });

  it('Prateleira: o lote está na tela e a barra o oferece', () => {
    expect(comProvedores(<WorkspaceDoFirePage />)).toContain('lote de publicar');
    expect(h.chrome?.barra?.primario?.texto).toMatch(/Publicar/);
  });

  it('Prontos: a central mantém o lote e o botão de publicar', () => {
    h.prontos = [
      {
        id: 's1',
        titulo: 'Short',
        numero: 1,
        duracao_seg: 30,
        publicadas: [],
        pendentes: ['tiktok'],
        post: { gerado: false, titulo: '', hashtags: 0 },
        capa: { tem: false },
      },
    ];
    const html = comProvedores(<ShortsProntosPage />);
    expect(html).toContain('lote de publicar');
    expect(h.chrome?.barra?.primario?.texto).toMatch(/Publicar/);
  });
});

describe('D-1051 · os textos que sobravam com "finalizar"', () => {
  it('Prontos vazio fala em renderizar', () => {
    const html = comProvedores(<ShortsProntosPage />);
    expect(html).toContain('você renderizar na fábrica');
    expect(html).not.toMatch(/finalizar/i);
  });

  it('a nota da prévia fala em render', () => {
    const html = curadoria(short({ status: 'aprovado', arquivo_short_path: '', arquivo_previa_path: 'p.mp4' }));
    expect(html).toContain('O filtro entra só no render');
    expect(html).not.toMatch(/só no finalizar/);
  });
});

describe('D-1051 · o gesto do "Renderizar" da Prateleira', () => {
  it('renderiza e manda a IA escrever o post', () => {
    h.shorts = [short({ status: 'aprovado', arquivo_short_path: '' })];
    comProvedores(<WorkspaceDoFirePage />);
    const botao = h.botoes.find((b) => [b.children].flat().includes('Renderizar'));
    expect(botao).toBeDefined();

    botao!.onClick!();

    expect(h.escrever).toHaveBeenCalledOnce();
    expect(h.renderizar).toHaveBeenCalledWith('s1');
  });
});
