import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { mensagemDoRiscado } from '../riscarCorte';
import { useRiscarCorte } from '../useRiscarCorte';
import { assentar, montar } from './domMinimo';

// D-1088, rodada 1 da auditoria: o aviso não diz só "X MB liberados" quando um
// arquivo em uso (Windows) ficou no disco.

const h = vi.hoisted(() => ({ riscarCorte: vi.fn(), notify: vi.fn() }));

vi.mock('../api/cortes', async (original) => {
  const real = await original<typeof import('../api/cortes')>();
  return { ...real, cortesApi: { ...real.cortesApi, riscarCorte: h.riscarCorte } };
});
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: vi.fn() }) }));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosVisiveis: () => [] }));

const corte = (id: string) =>
  ({ id, numero: Number(id.slice(1)), titulo_proposto: `Corte ${id}`, status: 'aprovado', youtube_video_id: '' }) as Corte;

describe('mensagemDoRiscado com arquivo em uso', () => {
  it('diz quantos arquivos ficaram no disco', () => {
    expect(mensagemDoRiscado(corte('c3'), 80, 1)).toBe('#3 · Corte c3 · 80 MB liberados · 1 arquivo em uso ficou no disco');
    expect(mensagemDoRiscado(corte('c3'), 0, 2)).toBe('#3 · Corte c3 · 2 arquivos em uso ficaram no disco');
  });

  it('sem arquivo em uso, a linha é a de sempre', () => {
    expect(mensagemDoRiscado(corte('c3'), 80, 0)).toBe('#3 · Corte c3 · 80 MB liberados');
  });
});

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

describe('o aviso do riscar recebe o que ficou no disco', () => {
  let riscar: ReturnType<typeof useRiscarCorte>;

  beforeEach(() => {
    h.riscarCorte.mockReset();
    h.notify.mockReset();
  });

  it('leva o nao_removidos da resposta para a linha do aviso', async () => {
    h.riscarCorte.mockResolvedValue({
      corte_id: 'c1',
      status_anterior: 'aprovado',
      liberado_mb: 80,
      retido_mb: 0,
      nao_removidos: ['p1/cortes/c1/clip_raw.mkv: arquivo em uso'],
    });
    const cortes = [corte('c1'), corte('c2')];
    function Sonda() {
      const navigate = useNavigate();
      riscar = useRiscarCorte(cortes[0], cortes, 'p1', (i) => navigate(`/projetos/p1/cortes/${cortes[i].id}`));
      return null;
    }
    const roteador = createMemoryRouter([{ path: '/projetos/:id/cortes/:corteId', element: <Sonda /> }], {
      initialEntries: ['/projetos/p1/cortes/c1'],
    });
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={roteador} />
      </QueryClientProvider>,
    ));
    await assentar();

    riscar.riscarCorte();
    await assentar();

    const [mensagem] = h.notify.mock.calls.find(([, opcoes]) => opcoes?.title === 'Corte riscado.')!;
    expect(mensagem).toBe('#1 · Corte c1 · 80 MB liberados · 1 arquivo em uso ficou no disco');
  });
});
