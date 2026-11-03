import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErroDaApi } from '@/shared/api';
import { DEFAULT_YOUTUBE_LAYOUT } from '@/shared/palco/youtubeLayout';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { useYoutubeLayoutPanel } from '../fase2/useYoutubeLayoutPanel';
import { useSalvarAoSair } from '../useSalvarAoSair';
import { assentar, montar } from './domMinimo';

// D-1036: a Pós trocava de corte (J, K, setas, lista) com cena ou layout sem
// salvar e perdia o ajuste em silêncio — a troca só muda `?corte=`, e a tela
// nova nasce zerada (D-1033). O editor já salvava na saída; o gancho é o mesmo.

const h = vi.hoisted(() => ({
  gravar: vi.fn(),
  avisos: [] as string[],
}));

vi.mock('@/components/ui/toaster', () => ({
  useToast: () => ({ notify: (texto: string) => h.avisos.push(texto) }),
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAtualizarCorte: () => ({ mutate: vi.fn(), mutateAsync: h.gravar, isPending: false }),
}));
vi.mock('@/features/projetos/api', () => ({ projetosApi: { obterProjeto: async () => ({}) } }));
vi.mock('@/features/settings/api', () => ({ settingsApi: { obterSettings: async () => ({}) } }));
vi.mock('../fase2/useSegmentosDetectados', () => ({
  useSegmentosDetectados: () => ({ segmentos: [], detectar: vi.fn(), detectando: false }),
}));
vi.mock('@/features/channels/palcoDoEscopo', () => ({ useLayoutPresetsDoEstilo: () => ({ data: [] }) }));
vi.mock('@/features/channels/usePalcoDoModal', () => ({ useAplicarPalcoDoPreset: () => vi.fn() }));

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

const rota = (r: { state: { location: { pathname: string; search: string } } }) =>
  r.state.location.pathname + r.state.location.search;
const POS = '/projetos/p1/post-production';

async function abrir(Sonda: () => null) {
  const roteador = createMemoryRouter(
    [{ path: POS, element: <UmaTelaPorCorte><Sonda /></UmaTelaPorCorte> }, { path: '/projetos', element: null }],
    { initialEntries: [`${POS}?corte=c5`] },
  );
  ({ limpar } = montar(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  ));
  await assentar();
  return roteador;
}

describe('D-1036 · salvar ao sair da Pós', () => {
  let salvar = vi.fn();
  function SondaGenerica({ sujo }: { sujo: boolean }) {
    useSalvarAoSair({ sujo, salvar: () => salvar(), avisoDeSucesso: 'salvo' });
    return null;
  }
  const sonda = (sujo: boolean) => () => <SondaGenerica sujo={sujo} /> as unknown as null;

  beforeEach(() => {
    salvar = vi.fn().mockResolvedValue(undefined);
    h.gravar.mockReset().mockResolvedValue(undefined);
    h.avisos.length = 0;
  });

  it('com ajuste pendente, trocar de corte salva antes e só então sai', async () => {
    const roteador = await abrir(sonda(true));
    await roteador.navigate(`${POS}?corte=c6`);
    await assentar();
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(rota(roteador)).toBe(`${POS}?corte=c6`);
    expect(h.avisos).toContain('salvo');
  });

  it('sem ajuste pendente, a troca não salva nada', async () => {
    const roteador = await abrir(sonda(false));
    await roteador.navigate(`${POS}?corte=c6`);
    await assentar();
    expect(salvar).not.toHaveBeenCalled();
    expect(rota(roteador)).toBe(`${POS}?corte=c6`);
  });

  it('se o salvamento falha, fica no corte e diz por quê', async () => {
    salvar.mockRejectedValue(new Error('backend fora'));
    const roteador = await abrir(sonda(true));
    await roteador.navigate(`${POS}?corte=c6`);
    await assentar();
    expect(rota(roteador)).toBe(`${POS}?corte=c5`);
    expect(h.avisos.join(' ')).toMatch(/backend fora/);
  });

  it('corte que não existe mais (404) descarta o ajuste e sai', async () => {
    salvar.mockRejectedValue(new ErroDaApi(404, '', 'Not Found'));
    const roteador = await abrir(sonda(true));
    await roteador.navigate(`${POS}?corte=c6`);
    await assentar();
    expect(rota(roteador)).toBe(`${POS}?corte=c6`);
  });

  it('sair da Pós para outra rota também salva', async () => {
    const roteador = await abrir(sonda(true));
    await roteador.navigate('/projetos');
    await assentar();
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(rota(roteador)).toBe('/projetos');
  });

  it('mexer só em outro parâmetro da busca não é trocar de corte', async () => {
    const roteador = await abrir(sonda(true));
    await roteador.navigate(`${POS}?corte=c5&fase=2`);
    await assentar();
    expect(salvar).not.toHaveBeenCalled();
    expect(rota(roteador)).toBe(`${POS}?corte=c5&fase=2`);
  });

  describe('o painel de layout, de verdade', () => {
    let painel: ReturnType<typeof useYoutubeLayoutPanel>;
    function Painel() {
      painel = useYoutubeLayoutPanel(
        { corteId: 'c5', projetoId: 'p1', layout: DEFAULT_YOUTUBE_LAYOUT, currentTime: 0, duration: 60 } as never,
        null,
      );
      return null;
    }

    it('layout alterado e não salvo é gravado ao trocar de corte', async () => {
      const roteador = await abrir(() => <Painel /> as unknown as null);
      painel.handleDefault('compartilhada');
      await assentar();
      expect(painel.dirty).toBe(true);
      await roteador.navigate(`${POS}?corte=c6`);
      await assentar();
      expect(h.gravar).toHaveBeenCalledTimes(1);
      expect(h.gravar.mock.calls[0][0]).toEqual({ layout_youtube: { modo_padrao: 'compartilhada' } });
      expect(rota(roteador)).toBe(`${POS}?corte=c6`);
    });

    it('layout sem alteração troca de corte sem gravar', async () => {
      const roteador = await abrir(() => <Painel /> as unknown as null);
      await roteador.navigate(`${POS}?corte=c6`);
      await assentar();
      expect(h.gravar).not.toHaveBeenCalled();
      expect(rota(roteador)).toBe(`${POS}?corte=c6`);
    });
  });
});
