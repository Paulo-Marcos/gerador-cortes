import { isValidElement, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { useRiscarCorte } from '../useRiscarCorte';
import { assentar, montar } from './domMinimo';

// D-1088: o R risca direto, sem diálogo, e o editor segue para o próximo corte.
// O aviso que fica leva o motivo (opcional) e o Desfazer.

const h = vi.hoisted(() => ({
  riscarCorte: vi.fn(),
  trazerDeVolta: vi.fn(),
  notify: vi.fn(),
  dismiss: vi.fn(),
}));

vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return { ...real, cortesApi: { ...real.cortesApi, riscarCorte: h.riscarCorte, trazerDeVolta: h.trazerDeVolta } };
});
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: h.dismiss }) }));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({
  useMotivosVisiveis: () => [{ slug: 'repetido', rotulo: 'Repete outro corte' }],
}));

const corte = (id: string, extra: Partial<Corte> = {}) =>
  ({
    id,
    numero: Number(id.slice(1)),
    titulo_proposto: `Corte ${id}`,
    status: 'aprovado',
    youtube_video_id: '',
    origem_analise: 'claude',
    ...extra,
  }) as Corte;

type Aviso = ReactElement<{
  motivos: { slug: string }[];
  onMotivos: (slugs: string[]) => void;
  onDesfazer?: () => void;
}>;

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('D-1088 · riscar o corte pelo editor', () => {
  let riscar: ReturnType<typeof useRiscarCorte>;
  let roteador: ReturnType<typeof createMemoryRouter>;

  const abrir = async (atual: Corte, cortes: Corte[]) => {
    // Segue como o editor segue (useEditorPage): o próximo corte ou a live.
    function Sonda() {
      const navigate = useNavigate();
      riscar = useRiscarCorte(atual, cortes, 'p1', (proximo) =>
        navigate(proximo < 0 ? '/projetos/p1' : `/projetos/p1/cortes/${cortes[proximo].id}`),
      );
      return null;
    }
    roteador = createMemoryRouter(
      [{ path: '/projetos/:id/cortes/:corteId', element: <Sonda /> }, { path: '/projetos/:id', element: null }],
      { initialEntries: [`/projetos/p1/cortes/${atual.id}`] },
    );
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();
  };
  const caminho = () => roteador.state.location.pathname;
  const avisoDoRiscado = () => {
    const chamada = h.notify.mock.calls.find(([, opcoes]) => opcoes?.title === 'Corte riscado.');
    return chamada as [string, { conteudo: Aviso; duracaoMs: number; tone: string }] | undefined;
  };

  beforeEach(() => {
    for (const fn of Object.values(h)) fn.mockReset();
    h.riscarCorte.mockResolvedValue({ corte_id: 'c1', status_anterior: 'aprovado', liberado_mb: 80, retido_mb: 0 });
    h.trazerDeVolta.mockResolvedValue({ corte_id: 'c1', status: 'aprovado', gerando_bruto: true });
    h.notify.mockReturnValue('aviso-1');
  });

  it('risca sem perguntar e segue para o próximo corte', async () => {
    await abrir(corte('c1'), [corte('c1'), corte('c2')]);

    riscar.riscarCorte();
    await assentar();

    expect(h.riscarCorte).toHaveBeenCalledWith('c1');
    expect(caminho()).toBe('/projetos/p1/cortes/c2');
  });

  it('sem outro corte vivo, volta para a live', async () => {
    await abrir(corte('c1'), [corte('c1'), corte('c2', { status: 'rejeitado' })]);

    riscar.riscarCorte();
    await assentar();

    expect(caminho()).toBe('/projetos/p1');
  });

  it('o aviso fica o bastante para escolher o motivo, que grava riscando de novo', async () => {
    await abrir(corte('c1'), [corte('c1'), corte('c2')]);
    riscar.riscarCorte();
    await assentar();

    const [mensagem, opcoes] = avisoDoRiscado()!;
    expect(mensagem).toBe('#1 · Corte c1 · 80 MB liberados');
    expect(opcoes.duracaoMs).toBeGreaterThanOrEqual(8000);
    expect(isValidElement(opcoes.conteudo)).toBe(true);
    expect(opcoes.conteudo.props.motivos.map((m) => m.slug)).toEqual(['repetido']);

    opcoes.conteudo.props.onMotivos(['repetido']);
    expect(h.riscarCorte).toHaveBeenLastCalledWith('c1', ['repetido']);
  });

  it('corte feito na mão não pergunta o motivo', async () => {
    await abrir(corte('c1', { origem_analise: '' }), [corte('c1'), corte('c2')]);
    riscar.riscarCorte();
    await assentar();

    expect(avisoDoRiscado()![1].conteudo.props.motivos).toEqual([]);
  });

  it('Desfazer é o Trazer de volta: chama a mesma rota e volta ao corte', async () => {
    await abrir(corte('c1'), [corte('c1'), corte('c2')]);
    riscar.riscarCorte();
    await assentar();

    avisoDoRiscado()![1].conteudo.props.onDesfazer!();
    await assentar();

    expect(h.dismiss).toHaveBeenCalledWith('aviso-1');
    expect(h.trazerDeVolta).toHaveBeenCalledWith('c1');
    expect(caminho()).toBe('/projetos/p1/cortes/c1');
  });

  it('corte que já estava riscado não oferece Desfazer', async () => {
    h.riscarCorte.mockResolvedValue({ corte_id: 'c1', status_anterior: 'rejeitado', liberado_mb: 0, retido_mb: 0 });
    await abrir(corte('c1', { status: 'rejeitado' }), [corte('c1'), corte('c2')]);
    riscar.riscarCorte();
    await assentar();

    expect(avisoDoRiscado()![1].conteudo.props.onDesfazer).toBeUndefined();
  });

  it('corte no YouTube: o R não risca e avisa por quê', async () => {
    await abrir(corte('c1', { youtube_video_id: 'abc' }), [corte('c1'), corte('c2')]);

    expect(riscar.bloqueio).toBe('Já está no YouTube');
    riscar.riscarCorte();
    await assentar();

    expect(h.riscarCorte).not.toHaveBeenCalled();
    expect(h.notify).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ tone: 'warning' }));
    expect(caminho()).toBe('/projetos/p1/cortes/c1');
  });

  it('o Desfazer que falha avisa', async () => {
    h.trazerDeVolta.mockRejectedValue(new Error('O corte não está riscado.'));
    await abrir(corte('c1'), [corte('c1'), corte('c2')]);
    riscar.riscarCorte();
    await assentar();

    avisoDoRiscado()![1].conteudo.props.onDesfazer!();
    await assentar();

    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining('não está riscado'), { tone: 'error' });
    expect(caminho()).toBe('/projetos/p1/cortes/c2');
  });

  it('a falha avisa e o editor fica no corte', async () => {
    h.riscarCorte.mockRejectedValue(new Error('Já está no YouTube: um corte publicado não se risca.'));
    await abrir(corte('c1'), [corte('c1'), corte('c2')]);

    riscar.riscarCorte();
    await assentar();

    expect(h.notify).toHaveBeenCalledWith(expect.stringContaining('YouTube'), { tone: 'error' });
    expect(caminho()).toBe('/projetos/p1/cortes/c1');
  });
});
