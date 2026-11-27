import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LOTE_KEY } from '@/features/shorts/useLotePublicacao';
import {
  SEM_BACKEND,
  esperarEstadoDeErro,
  type ErroDesenhado,
} from '@/shared/qualidade/__tests__/estadoDeErroNaTela';
import { filaDoTrilho } from '../cartaoDaFila';

const h = vi.hoisted(() => ({ erros: [] as unknown[], tentarDeNovo: null as unknown as () => void }));

vi.mock('@/components/ui/estado-de-erro', async (original) => {
  const real = await original<typeof import('@/components/ui/estado-de-erro')>();
  return {
    EstadoDeErro: (props: Parameters<typeof real.EstadoDeErro>[0]) => {
      h.erros.push(props);
      return createElement(real.EstadoDeErro, props);
    },
  };
});
vi.mock('@/shared/filaGlobal/useWorkbenchQueue', async (original) => ({
  ...(await original<typeof import('@/shared/filaGlobal/useWorkbenchQueue')>()),
  useWorkbenchQueue: () => ({
    jobs: [],
    grupos: [],
    cancelJob: vi.fn(),
    removeJob: vi.fn(),
    falha: SEM_BACKEND,
    carregando: false,
    tentarDeNovo: h.tentarDeNovo,
  }),
}));

import { GavetaDaFila } from '../GavetaDaFila';

describe('D-1204 · a fila vista pela casca, com o backend fora', () => {
  it('a gaveta avisa e deixa tentar de novo, sem dizer que não há nada', () => {
    h.tentarDeNovo = vi.fn();
    const cliente = new QueryClient();
    cliente.setQueryData(LOTE_KEY, { lote: null });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={cliente}>
        <GavetaDaFila aberta aoFechar={() => {}} aoAbrirTelaCheia={() => {}} />
      </QueryClientProvider>,
    );
    expect(html).not.toContain('Nada rodando');
    expect(html).not.toContain('nada na fila');
    esperarEstadoDeErro(html, h.erros as ErroDesenhado[], 'Não consegui consultar a fila').aoTentar?.();
    expect(h.tentarDeNovo).toHaveBeenCalledTimes(1);
  });

  it('o cartão do trilho na tela da Fila diz "sem resposta", não "vazia"', () => {
    expect(filaDoTrilho([], true, undefined, null, true)?.sub).toBe('sem resposta');
    expect(filaDoTrilho([], true)?.sub).toBe('vazia');
  });
});
