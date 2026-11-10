import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { useRiscarCorte } from '../useRiscarCorte';
import { assentar, montar } from './domMinimo';

// D-1096: a linha do Workspace usa o riscar do editor (D-1088) do jeito dela:
// sem lista para escolher o próximo, e o Desfazer fica no Workspace em vez de
// abrir o editor. A regra e o texto do "Já está no YouTube" são os mesmos.

const h = vi.hoisted(() => ({
  riscarCorte: vi.fn(),
  trazerDeVolta: vi.fn(),
  notify: vi.fn(),
  dismiss: vi.fn(),
  // Os motivos que o canal deixou visíveis (D-1006): o "Polêmico" escondido não vem.
  motivos: [
    { slug: 'tema_fraco', rotulo: 'Tema não rende' },
    { slug: 'repetido', rotulo: 'Repete outro corte' },
  ],
}));

vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return { ...real, cortesApi: { ...real.cortesApi, riscarCorte: h.riscarCorte, trazerDeVolta: h.trazerDeVolta } };
});
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: h.dismiss }) }));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosVisiveis: () => h.motivos }));

const corte = (extra: Partial<Corte> = {}) =>
  ({
    id: 'c7',
    numero: 7,
    titulo_proposto: 'Pedro II e a Igreja',
    status: 'aprovado',
    youtube_video_id: '',
    origem_analise: 'claude',
    ...extra,
  }) as Corte;

type Aviso = ReactElement<{ motivos: { slug: string }[]; onDesfazer?: () => void }>;

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1096 · o riscar na linha do Workspace', () => {
  let riscar: ReturnType<typeof useRiscarCorte>;
  let roteador: ReturnType<typeof createMemoryRouter>;
  const seguir = vi.fn();
  const aoDesfazer = vi.fn();

  const abrir = async (alvo: Corte) => {
    function Sonda() {
      riscar = useRiscarCorte(alvo, [], 'p1', seguir, aoDesfazer);
      return null;
    }
    roteador = createMemoryRouter([{ path: '/projetos/:id', element: <Sonda /> }], {
      initialEntries: ['/projetos/p1'],
    });
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
  };
  const aviso = () =>
    h.notify.mock.calls.find(([, opcoes]) => opcoes?.title === 'Corte riscado.')?.[1] as { conteudo: Aviso } | undefined;

  beforeEach(() => {
    for (const fn of [h.riscarCorte, h.trazerDeVolta, h.notify, h.dismiss, seguir, aoDesfazer]) fn.mockReset();
    h.motivos = [
      { slug: 'tema_fraco', rotulo: 'Tema não rende' },
      { slug: 'repetido', rotulo: 'Repete outro corte' },
    ];
    h.riscarCorte.mockResolvedValue({ corte_id: 'c7', status_anterior: 'aprovado', liberado_mb: 12, retido_mb: 0 });
    h.trazerDeVolta.mockResolvedValue({ corte_id: 'c7', status: 'aprovado', gerando_bruto: true });
    h.notify.mockReturnValue('aviso-7');
  });

  it('risca e segue sem índice da lista: a linha escolhe a vizinha', async () => {
    await abrir(corte());

    riscar.riscarCorte();
    await assentar();

    expect(h.riscarCorte).toHaveBeenCalledWith('c7');
    expect(seguir).toHaveBeenCalledWith(-1);
  });

  it('o aviso oferece os motivos visíveis do canal, na ordem dele', async () => {
    await abrir(corte());
    riscar.riscarCorte();
    await assentar();

    expect(aviso()!.conteudo.props.motivos.map((m) => m.slug)).toEqual(['tema_fraco', 'repetido']);
  });

  it('canal que escondeu todos os motivos não pergunta', async () => {
    h.motivos = [];
    await abrir(corte());
    riscar.riscarCorte();
    await assentar();

    expect(aviso()!.conteudo.props.motivos).toEqual([]);
  });

  it('o Desfazer traz de volta e fica no Workspace', async () => {
    await abrir(corte());
    riscar.riscarCorte();
    await assentar();

    aviso()!.conteudo.props.onDesfazer!();
    await assentar();

    expect(h.trazerDeVolta).toHaveBeenCalledWith('c7');
    expect(aoDesfazer).toHaveBeenCalledWith(expect.objectContaining({ id: 'c7' }));
    expect(roteador.state.location.pathname).toBe('/projetos/p1');
  });

  it('corte no YouTube: não risca, avisa "Já está no YouTube" e o foco fica', async () => {
    await abrir(corte({ youtube_video_id: 'abc' }));

    expect(riscar.bloqueio).toBe('Já está no YouTube');
    riscar.riscarCorte();
    await assentar();

    expect(h.riscarCorte).not.toHaveBeenCalled();
    expect(seguir).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ title: 'Já está no YouTube.', tone: 'warning' }),
    );
  });
});
