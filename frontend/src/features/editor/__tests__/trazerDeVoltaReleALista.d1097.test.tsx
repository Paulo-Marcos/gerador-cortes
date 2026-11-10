import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { corteKey, cortesProjetoKey } from '@/shared/chavesDeCache';
import { useJuntarCortes } from '../useCortes';
import { assentar, montar } from './domMinimo';

// D-1097, auditoria r1: o "Trazer de volta" do aviso da junção relê o corte e a
// lista do projeto. Sem a releitura, o corte trazido de volta seguia na seção
// Riscados até a próxima busca, e o operador achava que o botão não funcionou.

const h = vi.hoisted(() => ({
  juntarCortes: vi.fn(),
  trazerDeVolta: vi.fn(),
  notify: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return {
    ...real,
    cortesApi: { ...real.cortesApi, juntarCortes: h.juntarCortes, trazerDeVolta: h.trazerDeVolta },
  };
});
vi.mock('@/features/shorts/legendasDoCorte', async (original) => ({
  ...(await original<typeof import('@/features/shorts/legendasDoCorte')>()),
  atualizarLegendasDoCorte: vi.fn(async () => undefined),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: h.dismiss }) }));

type BotaoDoAviso = ReactElement<{ onClick: () => void }>;

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1097 · o Trazer de volta do aviso da junção', () => {
  let juntar: ReturnType<typeof useJuntarCortes>;
  let qc: QueryClient;

  beforeEach(async () => {
    for (const fn of [h.juntarCortes, h.trazerDeVolta, h.notify, h.dismiss]) fn.mockReset();
    h.juntarCortes.mockResolvedValue({ id: 'c1', numero: 1 });
    h.trazerDeVolta.mockResolvedValue({ corte_id: 'c2', status: 'aprovado', gerando_bruto: true });
    qc = new QueryClient();
    function Sonda() {
      juntar = useJuntarCortes('c1', 'p1');
      return null;
    }
    ({ limpar } = montar(
      <QueryClientProvider client={qc}>
        <Sonda />
      </QueryClientProvider>,
    ));
    await assentar();
  });

  it('relê o corte trazido de volta e a lista do projeto', async () => {
    await juntar.mutateAsync({ outro_corte_id: 'c2' });
    await assentar();
    const aviso = h.notify.mock.calls.find(([, opcoes]) => opcoes?.title === 'Cortes juntados.');
    const botao = (aviso![1] as { conteudo: BotaoDoAviso }).conteudo;
    // Só conta o que o clique relê, não o que a própria junção já releu.
    const invalidar = vi.spyOn(qc, 'invalidateQueries');

    botao.props.onClick();
    await assentar();

    expect(h.trazerDeVolta).toHaveBeenCalledWith('c2');
    const chaves = invalidar.mock.calls.map(([filtro]) => filtro?.queryKey);
    expect(chaves).toContainEqual(corteKey('c2'));
    expect(chaves).toContainEqual(cortesProjetoKey('p1'));
  });
});
