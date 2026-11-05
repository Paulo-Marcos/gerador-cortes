import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { useMarcarAlertaConferido, useRemoverDesvio } from '@/features/editor/useCortes';
import type { EtapaDaTrilha } from '../trilhaDaLive';
import { useTrilhaDaLive } from '../useTrilhaDaLive';

// D-1044: riscar e conferir só gravam no corte aberto, não na lista da live, e a lista
// não se relê sozinha. Lendo a lista, a casa seguia dizendo "sai 6 s" ao lado de uma
// barra que já dizia o contrário.

const h = vi.hoisted(() => ({
  obterCorte: vi.fn(),
  listarCortes: vi.fn(),
  removerDesvio: vi.fn(),
  marcarAlertaConferido: vi.fn(),
}));

vi.mock('@/features/editor/api/cortes', () => ({ cortesApi: h }));
vi.mock('@/features/shorts/legendasDoCorte', () => ({ atualizarLegendasDoCorte: vi.fn() }));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useProjeto: () => ({ data: undefined }),
  useExportStatus: () => ({ data: undefined }),
}));

const DESVIO = { inicio_hms: '00:00:10.000', fim_hms: '00:00:16.000', motivo: 'x' };
const corte = (mudancas: object = {}) => ({
  id: 'c1',
  numero: 1,
  status: 'aprovado',
  inicio_seg: 0,
  fim_seg: 100,
  desvios: [DESVIO],
  alertas_conferir: [{ id: 'a1', conferido: false }],
  cenas_remotion: [],
  cenas_validadas: 0,
  ...mudancas,
});

let trilha: EtapaDaTrilha[] = [];
let remover: ReturnType<typeof useRemoverDesvio>;
let conferir: ReturnType<typeof useMarcarAlertaConferido>;
function Sonda() {
  trilha = useTrilhaDaLive('cortes', 'p1');
  remover = useRemoverDesvio('c1');
  conferir = useMarcarAlertaConferido('c1');
  return null;
}

const casaDosCortes = () => trilha.find((e) => e.id === 'cortes')?.doCorte;

let limpar: () => Promise<void> = async () => undefined;
const abrir = async (rota = '/projetos/p1/cortes/c1') => {
  ({ limpar } = montar(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[rota]}>
        <Sonda />
      </MemoryRouter>
    </QueryClientProvider>,
  ));
  await assentar();
};

beforeEach(() => {
  h.listarCortes.mockResolvedValue([corte()]);
  h.obterCorte.mockResolvedValue(corte());
});
afterEach(async () => {
  await limpar();
  vi.resetAllMocks();
});

describe('D-1044 · a trilha segue o corte aberto', () => {
  it('com um corte aberto, a casa resume ele', async () => {
    await abrir();
    expect(casaDosCortes()).toBe('sai 6 s, 1 conferir');
  });

  it('riscar o trecho muda a casa, sem a lista da live se reler', async () => {
    await abrir();
    h.removerDesvio.mockResolvedValue(corte({ desvios: [] }));
    remover.mutate(0);
    await assentar();
    expect(casaDosCortes()).toBe('sem trechos, 1 conferir');
    expect(h.listarCortes).toHaveBeenCalledTimes(1);
  });

  it('marcar o conferir muda a casa', async () => {
    await abrir();
    h.marcarAlertaConferido.mockResolvedValue(corte({ alertas_conferir: [{ id: 'a1', conferido: true }] }));
    conferir.mutate('a1');
    await assentar();
    expect(casaDosCortes()).toBe('sai 6 s');
  });

  it('enquanto o corte aberto carrega, a lista da live responde', async () => {
    h.obterCorte.mockReturnValue(new Promise(() => undefined));
    await abrir();
    expect(casaDosCortes()).toBe('sai 6 s, 1 conferir');
  });

  it('sem corte aberto na rota, não busca corte nenhum', async () => {
    await abrir('/projetos/p1');
    expect(h.obterCorte).not.toHaveBeenCalled();
    expect(casaDosCortes()).toBeUndefined();
  });
});
