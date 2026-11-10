import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { corteKey } from '@/shared/chavesDeCache';

// D-1089: depois do 200 do "Voltar à borda da IA", a tela lê o corte que voltou.
// Sem gravar a resposta no cache, o trecho seguiria "Manual · você ajustou" até
// a próxima busca; e as legendas, que leem os desvios, ficariam velhas.

const respostas = vi.hoisted(() => ({
  corte: { id: 'c1', desvios: [{ inicio_hms: '00:00:12.000', fim_hms: '00:00:15.000', rodada: 1 }] },
  pedidos: [] as [string, number][],
  legendas: [] as string[],
}));

vi.mock('../api/cortes', async (importOriginal) => {
  const original = await importOriginal<typeof import('../api/cortes')>();
  return {
    ...original,
    cortesApi: {
      ...original.cortesApi,
      voltarABordaDaIa: async (corteId: string, indice: number) => {
        respostas.pedidos.push([corteId, indice]);
        return respostas.corte;
      },
    },
  };
});
vi.mock('@/features/shorts/legendasDoCorte', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/shorts/legendasDoCorte')>()),
  atualizarLegendasDoCorte: (_qc: unknown, corteId: string) => {
    respostas.legendas.push(corteId);
  },
}));

const { useVoltarABordaDaIa } = await import('../useCortes');

describe('useVoltarABordaDaIa', () => {
  it('grava no cache o corte que o servidor devolveu e atualiza as legendas', async () => {
    const qc = new QueryClient();
    qc.setQueryData(corteKey('c1'), { id: 'c1', desvios: [{ inicio_hms: '00:00:11.000', fim_hms: '00:00:16.000' }] });
    let mutacao: ReturnType<typeof useVoltarABordaDaIa> | undefined;
    function Sonda() {
      mutacao = useVoltarABordaDaIa('c1');
      return null;
    }
    renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
    );

    await mutacao!.mutateAsync(0);

    expect(respostas.pedidos).toEqual([['c1', 0]]);
    expect(qc.getQueryData(corteKey('c1'))).toEqual(respostas.corte);
    expect(respostas.legendas).toEqual(['c1']);
  });
});
