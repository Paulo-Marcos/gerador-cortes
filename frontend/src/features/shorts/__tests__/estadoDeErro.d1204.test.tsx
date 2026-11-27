import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EstadoDeErroProps } from '@/components/ui/estado-de-erro';
import { esperarEstadoDeErro, quedaDeRede } from '@/shared/qualidade/__tests__/estadoDeErroNaTela';

const h = vi.hoisted(() => ({
  erros: [] as unknown[],
  subs: [] as string[],
  refetch: null as unknown as () => void,
}));

vi.mock('@/components/ui/estado-de-erro', async (original) => {
  const real = await original<typeof import('@/components/ui/estado-de-erro')>();
  return {
    EstadoDeErro: (props: EstadoDeErroProps) => {
      h.erros.push(props);
      return createElement(real.EstadoDeErro, props);
    },
  };
});
vi.mock('@/upgrade/UpgradeChrome', () => ({
  useDefinirChrome: (chrome: { sub: string }) => h.subs.push(chrome.sub),
}));
const caida = () => ({
  isLoading: false, isError: true, data: undefined, error: quedaDeRede(), refetch: h.refetch,
});
vi.mock('../useFires', async (original) => ({
  ...(await original<typeof import('../useFires')>()),
  useFires: () => caida(),
  useAndamentoDasLives: () => ({ data: undefined }),
}));
vi.mock('../useShortsProntos', () => ({ PRONTOS_KEY: ['p'], useShortsProntos: () => caida() }));
vi.mock('../useLotePublicacao', async (original) => ({
  ...(await original<typeof import('../useLotePublicacao')>()),
  useLoteAtual: () => ({ data: undefined }),
}));
vi.mock('../PublicarEmLoteModal', () => ({ PublicarEmLoteModal: () => null }));

import ShortsPage from '../ShortsPage';
import ShortsProntosPage from '../ShortsProntosPage';

const montar = (no: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <QueryClientProvider client={new QueryClient()}>{no}</QueryClientProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  h.erros = [];
  h.subs = [];
  h.refetch = vi.fn();
});

describe('D-1204 · Shorts e Prontos com o backend fora', () => {
  it.each([
    ['Shorts', <ShortsPage />, 'Não consegui carregar os Fires', 'fire com bruto'],
    ['Prontos', <ShortsProntosPage />, 'Não consegui carregar os shorts prontos', 'faltando em alguma rede'],
  ])('%s: avisa, tentar refaz a consulta e não conta zero', (_tela, no, titulo, contagem) => {
    const html = montar(no);
    esperarEstadoDeErro(html, h.erros as EstadoDeErroProps[], titulo).aoTentar?.();
    expect(h.refetch).toHaveBeenCalledTimes(1);
    expect(html).not.toContain('Nada esperando publicação');
    expect(html).not.toContain('Nenhum corte na fábrica');
    expect(h.subs.at(-1)).not.toContain(contagem);
  });
});
