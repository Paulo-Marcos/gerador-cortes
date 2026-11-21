import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { FireComBruto, ShortSugerido } from '../shortsApi';

// D-1051: "Finalizar" queria dizer três coisas. Na linha do corte já diz o próximo passo
// (D-1041, com teste próprio). Na Prateleira, o botão renderiza; no cartão do Fire, é a
// declaração da RN-17 e fica. E as migalhas chegam à casca pelas duas telas.

const h = vi.hoisted(() => ({
  chrome: undefined as undefined | { rotulos?: unknown },
  fire: undefined as unknown,
  shorts: [] as unknown[],
  renderizar: vi.fn(),
  escrever: vi.fn(),
}));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: { rotulos?: unknown }) => {
    h.chrome = chrome;
  },
}));
vi.mock('../useFires', async (original) => ({
  ...(await original<typeof import('../useFires')>()),
  useFires: () => ({ data: { fires: [h.fire] }, isLoading: false, isError: false }),
}));
vi.mock('../useShortsDoCorte', async (original) => ({
  ...(await original<typeof import('../useShortsDoCorte')>()),
  useShortsDoCorte: () => ({ data: { shorts: h.shorts }, isLoading: false, isError: false }),
  useRenderizarShort: () => ({ mutate: h.renderizar, isPending: false }),
  useProgressoRender: () => null,
  useCapaDoShort: () => ({ data: undefined }),
}));
vi.mock('../useLotePublicacao', async (original) => ({
  ...(await original<typeof import('../useLotePublicacao')>()),
  usePublicacoesDoCorte: () => ({ data: { publicacoes: [] } }),
}));
vi.mock('../useFechoDoShort', () => ({
  useFechoDoShort: () => ({
    finalizar: (disparar: () => void) => {
      disparar();
      h.escrever();
    },
  }),
}));
vi.mock('../PainelPublicacao', () => ({ PainelPublicacao: () => null }));
vi.mock('../PublicarEmLoteModal', () => ({ PublicarEmLoteModal: () => null }));

const { itensDoMenuDoFire } = await import('../acoesDoFire');
const { default: WorkspaceDoFirePage } = await import('../WorkspaceDoFirePage');
const { FireChrome } = await import('../FireDetalhePage');

const ACOES_DA_LINHA = { editar: () => undefined, alternarFinalizado: () => undefined, gerar: () => undefined, liveRodando: false, marcando: false };
const FIRE = {
  corte_id: 'c9',
  numero: 9,
  titulo: 'Fire',
  projeto_id: 'p1',
  projeto_titulo: 'Live',
  duracao_seg: 60,
  finalizado_em: null,
  shorts: { sugerido: 0, aprovado: 1, renderizado: 0, rejeitado: 0, total: 1 },
  redes: [],
} as unknown as FireComBruto;
const APROVADO = {
  id: 's1',
  numero: 1,
  titulo: 'Short',
  status: 'aprovado',
  inicio_seg: 0,
  duracao_seg: 30,
  arquivo_short_path: '',
} as unknown as ShortSugerido;

function comProvedores(arvore: ReactNode, rota = '/shorts/c9/workspace') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, enabled: false } } });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[rota]}>
            <Routes>
              <Route path="/shorts/:corteId/workspace" element={arvore} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.fire = FIRE;
  h.shorts = [APROVADO];
  h.chrome = undefined;
});

describe('D-1051 · um nome para cada "Finalizar"', () => {
  it('na Prateleira, o botão do aprovado diz o que faz', () => {
    const html = comProvedores(<WorkspaceDoFirePage />);
    expect(html).toContain('Renderizar');
    expect(html).not.toContain('Finalizar');
  });

  it('no cartão do Fire, "Finalizar" fica: é a declaração da RN-17', () => {
    // O rodapé virou o ⋯ da linha (D-1168, §7.6): o teste lê as mesmas ações em `acoesDoFire`.
    const rotulos = itensDoMenuDoFire(FIRE, ACOES_DA_LINHA).map((i) => i.label);
    expect(rotulos).toContain('Finalizar');
    expect(rotulos).not.toContain('Renderizar');
  });

  it('com o Fire finalizado, o cartão oferece reabrir', () => {
    const rotulos = itensDoMenuDoFire({ ...FIRE, finalizado_em: '2026-11-05' } as FireComBruto, ACOES_DA_LINHA).map((i) => i.label);
    expect(rotulos).toContain('Reabrir');
  });
});

const MIGALHAS = [
  { texto: 'Live', to: '/projetos/p1' },
  { texto: 'Corte #9', to: '/projetos/p1?corte=c9' },
];

describe('D-1051 · as duas telas do Fire chegam à linha do corte', () => {
  it('a Prateleira leva à live e ao corte de origem', () => {
    comProvedores(<WorkspaceDoFirePage />);
    expect(h.chrome?.rotulos).toEqual(MIGALHAS);
  });

  it('a Curadoria também', () => {
    comProvedores(<FireChrome corteId="c9" fire={FIRE} estado="parado" />);
    expect(h.chrome?.rotulos).toEqual(MIGALHAS);
  });
});
