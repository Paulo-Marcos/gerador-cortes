import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FireComBruto, ShortSugerido } from '../shortsApi';

// D-1051 · achado da segunda auditoria: estar na tela não basta, o botão tem de abrir. Sem
// isto, as portas de publicar podiam ficar inertes com tudo verde.

const h = vi.hoisted(() => ({
  ligarEstado: false,
  mudancas: [] as unknown[],
  loteAberto: undefined as boolean | undefined,
  chrome: undefined as undefined | { barra?: { primario?: { onClick?: () => void } } },
  botoes: [] as { children?: unknown; onClick?: () => void }[],
  publicar: vi.fn(),
  shorts: [] as unknown[],
  prontos: [] as unknown[],
}));

vi.mock('react', async (original) => {
  const react = await original<typeof import('react')>();
  return {
    ...react,
    useState: (inicial: unknown) => {
      const [valor, trocar] = react.useState(inicial === false && h.ligarEstado ? true : inicial);
      return [
        valor,
        (novo: unknown) => {
          h.mudancas.push(novo);
          trocar(novo as never);
        },
      ];
    },
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
vi.mock('../PublicarEmLoteModal', () => ({
  PublicarEmLoteModal: ({ open }: { open: boolean }) => {
    h.loteAberto = open;
    return null;
  },
}));
vi.mock('../AcoesRapidasDoShort', () => ({ AcoesRapidasDoShort: () => null, GerarCapaComIA: () => null }));
vi.mock('../ProgressoRenderPanel', () => ({ ProgressoRenderPanel: () => null }));
vi.mock('../KitDoShortModal', () => ({ KitDoShortModal: () => null }));
vi.mock('../useFires', async (original) => ({
  ...(await original<typeof import('../useFires')>()),
  useFires: () => ({ data: { fires: [] as FireComBruto[] } }),
}));
vi.mock('../useShortsProntos', async (original) => ({
  ...(await original<typeof import('../useShortsProntos')>()),
  useShortsProntos: () => ({ data: { shorts: h.prontos }, isLoading: false, isError: false }),
}));
vi.mock('../useLotePublicacao', async (original) => ({
  ...(await original<typeof import('../useLotePublicacao')>()),
  usePublicacoesDoCorte: () => ({ data: { publicacoes: [] } }),
  useLoteAtual: () => ({ data: undefined }),
  useConfirmarPublicacao: () => ({ mutate: vi.fn(), isPending: false }),
  usePublicarEAtualizar: () => ({ mutate: h.publicar, isPending: false, isSuccess: false, isError: false }),
}));
vi.mock('../useShortsDoCorte', async (original) => ({
  ...(await original<typeof import('../useShortsDoCorte')>()),
  useShortsDoCorte: () => ({ data: { shorts: h.shorts }, isLoading: false, isError: false }),
  useRenderizarShort: () => ({ mutate: vi.fn(), isPending: false }),
  useProgressoRender: () => null,
  useCapaDoShort: () => ({ data: undefined }),
  usePostDoShort: () => ({ data: undefined }),
  usePreviaPublicacao: () => ({
    data: { pacotes: [{ plataforma: 'tiktok', rotulo: 'TikTok', modo: 'api', avisos: [], titulo: 'Short', titulo_visivel: 'Short', hashtags: [], tags: [], descricao: '' }] },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock('../useFechoDoShort', () => ({
  useFechoDoShort: () => ({ abrirPost: vi.fn(), abrirCapa: vi.fn(), finalizar: vi.fn(), modais: null }),
}));

const { default: WorkspaceDoFirePage } = await import('../WorkspaceDoFirePage');
const { default: ShortsProntosPage } = await import('../ShortsProntosPage');
const { PainelPublicacao } = await import('../PainelPublicacao');
const { RodapeDoFire } = await import('../RodapeDoFire');

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

const SHORT = {
  id: 's1',
  numero: 1,
  titulo: 'Short',
  status: 'renderizado',
  arquivo_short_path: 'a.mp4',
  inicio_seg: 0,
  duracao_seg: 30,
} as unknown as ShortSugerido;
const PRONTO = {
  id: 's1',
  titulo: 'Short',
  numero: 1,
  duracao_seg: 30,
  publicadas: [],
  pendentes: ['tiktok'],
  post: { gerado: false, titulo: '', hashtags: 0 },
  capa: { tem: false },
};

beforeEach(() => {
  h.ligarEstado = false;
  h.mudancas = [];
  h.loteAberto = undefined;
  h.chrome = undefined;
  h.botoes = [];
  h.publicar.mockClear();
  h.shorts = [SHORT];
  h.prontos = [PRONTO];
});

describe.each([
  ['Prateleira', () => <WorkspaceDoFirePage />],
  ['Prontos', () => <ShortsProntosPage />],
])('D-1051 · o lote de %s abre', (_nome, tela) => {
  it('o botão da barra pede para abrir', () => {
    comProvedores(tela());
    h.mudancas = [];
    h.chrome?.barra?.primario?.onClick?.();
    expect(h.mudancas).toContain(true);
  });

  it('pedido aberto chega ao modal; fechado, não', () => {
    comProvedores(tela());
    expect(h.loteAberto).toBe(false);
    h.ligarEstado = true;
    comProvedores(tela());
    expect(h.loteAberto).toBe(true);
  });
});

describe('D-1051 · o painel publica', () => {
  it('"publicar" sobe aquele short naquela rede', () => {
    comProvedores(<PainelPublicacao short={SHORT} corteId="c9" onEscreverPost={vi.fn()} onEscolherCapa={vi.fn()} />);
    const botao = h.botoes.find((b) => [b.children].flat().includes('publicar'));
    expect(botao).toBeDefined();
    botao!.onClick!();
    expect(h.publicar).toHaveBeenCalledWith({ shortId: 's1', plataforma: 'tiktok' });
  });
});

describe('D-1051 · o último "finalizado" no sentido de renderizado', () => {
  it('a dica do rodapé fala em renderizado, ao lado do "Finalizar" da RN-17', () => {
    const fire = {
      corte_id: 'c9',
      finalizado_em: null,
      shorts: { renderizado: 0 },
    } as unknown as FireComBruto;
    const html = comProvedores(<RodapeDoFire fire={fire} />);
    expect(html).toContain('Ainda não há short renderizado neste corte');
    expect(html).toContain('Finalizar');
  });
});
