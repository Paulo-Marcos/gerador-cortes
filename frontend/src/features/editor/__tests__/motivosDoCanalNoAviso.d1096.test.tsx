import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { MOTIVOS_APAGADO } from '../motivoApagado';
import { useRiscarCorte } from '../useRiscarCorte';
import { assentar, montar } from './domMinimo';

// D-1096 (rodada 1 da auditoria): os chips do aviso do riscado vêm da lista do
// canal (D-1006) pela busca de verdade — `useMotivosVisiveis` sem dublê, só a API
// dublada. Era o que os testes do diálogo de excluir protegiam: só os visíveis,
// na ordem do canal, e o padrão enquanto a lista do canal não chega.

const h = vi.hoisted(() => ({
  ler: vi.fn(),
  riscarCorte: vi.fn(),
  notify: vi.fn(),
}));

vi.mock('@/features/channels/api/motivosDeExclusao', () => ({ motivosDeExclusaoApi: { ler: h.ler } }));
vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return { ...real, cortesApi: { ...real.cortesApi, riscarCorte: h.riscarCorte } };
});
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: vi.fn() }) }));

/** Um escondido no meio: a ordem do canal tem de sobreviver ao filtro. */
const LISTA_DO_CANAL = {
  personalizado: true,
  motivos: [
    { slug: 'polemico', rotulo: 'Polêmico', ativo: true },
    { slug: 'repetido', rotulo: 'Repete outro corte', ativo: false },
    { slug: 'tema_fraco', rotulo: 'Tema não rende', ativo: true },
  ],
};

const CORTE = {
  id: 'c7',
  numero: 7,
  titulo_proposto: 'Pedro II e a Igreja',
  status: 'aprovado',
  youtube_video_id: '',
  origem_analise: 'claude',
} as Corte;

type Aviso = ReactElement<{ motivos: { slug: string; rotulo: string }[] }>;

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1096 · os motivos do canal no aviso do riscado', () => {
  let riscar: ReturnType<typeof useRiscarCorte>;

  const abrir = async () => {
    function Sonda() {
      riscar = useRiscarCorte(CORTE, [], 'p1', vi.fn(), vi.fn());
      return null;
    }
    const roteador = createMemoryRouter([{ path: '/projetos/:id', element: <Sonda /> }], {
      initialEntries: ['/projetos/p1'],
    });
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
  };
  const motivosDoAviso = async () => {
    riscar.riscarCorte();
    await assentar();
    const opcoes = h.notify.mock.calls.find(([, o]) => o?.title === 'Corte riscado.')?.[1] as
      | { conteudo: Aviso }
      | undefined;
    return opcoes!.conteudo.props.motivos;
  };

  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset();
    h.riscarCorte.mockResolvedValue({ corte_id: 'c7', status_anterior: 'aprovado', liberado_mb: 0, retido_mb: 0 });
  });

  it('só os motivos ativos viram chip, na ordem do canal', async () => {
    h.ler.mockResolvedValue(LISTA_DO_CANAL);
    await abrir();

    expect(h.ler).toHaveBeenCalled();
    expect(await motivosDoAviso()).toEqual([
      { slug: 'polemico', rotulo: 'Polêmico' },
      { slug: 'tema_fraco', rotulo: 'Tema não rende' },
    ]);
  });

  it('enquanto a lista do canal não chega, o aviso oferece o padrão', async () => {
    h.ler.mockReturnValue(new Promise(() => undefined));
    await abrir();

    expect(h.ler).toHaveBeenCalled();
    expect(await motivosDoAviso()).toEqual(MOTIVOS_APAGADO);
  });
});
