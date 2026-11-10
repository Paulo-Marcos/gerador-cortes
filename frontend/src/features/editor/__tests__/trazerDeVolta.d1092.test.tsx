import type { ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import { useRiscarCorte } from '../useRiscarCorte';
import { useTrazerDeVolta } from '../useTrazerDeVolta';
import { assentar, montar } from './domMinimo';

// D-1092: o "Trazer de volta" da seção Riscados usa a volta da D-1088 (a mesma
// rota do Desfazer) e a lista relê o corte; o motivo dado pelo aviso também faz
// a lista reler, para o chip aparecer na seção.

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
    status: 'rejeitado',
    youtube_video_id: '',
    origem_analise: 'claude',
    ...extra,
  }) as Corte;

let limpar: () => Promise<void> = async () => undefined;
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});
beforeEach(() => {
  vi.clearAllMocks();
});

function montarCom(qc: QueryClient, sonda: () => null) {
  const Sonda = sonda;
  ({ limpar } = montar(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Sonda />
      </MemoryRouter>
    </QueryClientProvider>,
  ));
}

const chavesRelidas = (qc: QueryClient) =>
  vi.mocked(qc.invalidateQueries).mock.calls.map(([filtro]) => JSON.stringify(filtro?.queryKey));

describe('D-1092 · Trazer de volta pela seção Riscados', () => {
  it('chama a volta da D-1088 e relê o corte e a lista do projeto', async () => {
    h.trazerDeVolta.mockResolvedValue({ corte_id: 'c2', status: 'aprovado', gerando_bruto: true });
    const qc = new QueryClient();
    vi.spyOn(qc, 'invalidateQueries');
    let trazer: ReturnType<typeof useTrazerDeVolta> | undefined;
    montarCom(qc, () => {
      trazer = useTrazerDeVolta('p1');
      return null;
    });
    await assentar();

    trazer!.trazerDeVolta(corte('c2'));
    await assentar();

    expect(h.trazerDeVolta).toHaveBeenCalledWith('c2');
    const relidas = chavesRelidas(qc);
    expect(relidas.some((chave) => chave?.includes('c2'))).toBe(true);
    expect(relidas.some((chave) => chave?.includes('p1'))).toBe(true);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('a falha avisa e não relê nada', async () => {
    h.trazerDeVolta.mockRejectedValue(new Error('boom'));
    const qc = new QueryClient();
    vi.spyOn(qc, 'invalidateQueries');
    let trazer: ReturnType<typeof useTrazerDeVolta> | undefined;
    montarCom(qc, () => {
      trazer = useTrazerDeVolta('p1');
      return null;
    });
    await assentar();

    trazer!.trazerDeVolta(corte('c2'));
    await assentar();

    expect(h.notify).toHaveBeenCalledWith(expect.any(String), { tone: 'error' });
    expect(qc.invalidateQueries).not.toHaveBeenCalled();
  });
});

describe('D-1092 · o motivo do aviso chega à seção', () => {
  it('gravar o motivo pelo aviso relê o corte riscado', async () => {
    h.riscarCorte.mockResolvedValue({ corte_id: 'c1', status_anterior: 'aprovado', liberado_mb: 0, retido_mb: 0 });
    const qc = new QueryClient();
    let riscar: ReturnType<typeof useRiscarCorte> | undefined;
    const vivo = corte('c1', { status: 'aprovado' });
    montarCom(qc, () => {
      riscar = useRiscarCorte(vivo, [vivo, corte('c2', { status: 'aprovado' })], 'p1', () => undefined);
      return null;
    });
    await assentar();
    riscar!.riscarCorte();
    await assentar();

    const [, opcoes] = h.notify.mock.calls.find(([, o]) => o?.title === 'Corte riscado.')!;
    const aviso = opcoes.conteudo as ReactElement<{ onMotivos: (slugs: string[]) => void }>;
    vi.spyOn(qc, 'invalidateQueries');
    aviso.props.onMotivos(['repetido']);
    await assentar();

    expect(h.riscarCorte).toHaveBeenLastCalledWith('c1', ['repetido']);
    expect(chavesRelidas(qc).some((chave) => chave?.includes('c1'))).toBe(true);
  });
});
