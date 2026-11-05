import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { shortsApi, type FireComBruto } from '@/features/shorts/shortsApi';
import { LOTE_KEY, publicacoesKey, usePublicarEAtualizar } from '@/features/shorts/useLotePublicacao';
import { progressoKey, useProgressoRender } from '@/features/shorts/useShortsDoCorte';
import type { trilhaDoFire } from '../trilhaDoFire';
import type { TelaId } from '../upgradeRoutes';
import { useTrilhaDaTela } from '../useTrilhaDoFire';

// D-1051 · achados da segunda auditoria: o número da faixa tinha de acompanhar cada gesto,
// passando pelo código real que relê, e não por uma invalidação feita à mão no teste.

const FIRE = {
  corte_id: 'c9',
  finalizado_em: null,
  shorts: { sugerido: 0, aprovado: 1, renderizado: 0, rejeitado: 0, total: 1 },
  redes: [],
} as unknown as FireComBruto;
const short = (status: string, arquivo = '') => ({ id: 's1', status, arquivo_short_path: arquivo });
const NO_YOUTUBE = { alvo_id: 's1', plataforma: 'youtube_shorts', publicado_em: '2026-11-05' };
const loteCom = (publicados: number, andando = 0) => ({
  lote: {
    lote_id: 'l1',
    terminou: true,
    raias: [
      {
        itens: [
          ...Array.from({ length: publicados }, () => ({ estado: 'publicado' })),
          ...Array.from({ length: andando }, () => ({ estado: 'enviando' })),
        ],
      },
    ],
  },
});

let etapas: ReturnType<typeof trilhaDoFire> = [];
let publicar: ReturnType<typeof usePublicarEAtualizar>;
let qc: ReturnType<typeof useQueryClient>;
function Sonda({ tela, painel }: { tela: TelaId; painel: boolean }) {
  etapas = useTrilhaDaTela(tela, null);
  qc = useQueryClient();
  useProgressoRender('s1', 'c9', tela === 'prateleira');
  return painel ? <Painel /> : null;
}
function Painel() {
  publicar = usePublicarEAtualizar('c9');
  return null;
}

const prateleira = () => etapas.find((e) => e.id === 'prateleira')?.contagem;

let desmontar: () => void = () => undefined;
let limpar: () => Promise<void> = async () => undefined;
async function abrir(rota: string, tela: TelaId, painel = false) {
  ({ limpar, desmontar } = montar(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[rota]}>
        <Sonda tela={tela} painel={painel} />
      </MemoryRouter>
    </QueryClientProvider>,
  ));
  await assentar();
}

beforeEach(() => {
  vi.spyOn(shortsApi, 'listarFires').mockResolvedValue({ fires: [FIRE] } as never);
  vi.spyOn(shortsApi, 'verLote').mockResolvedValue({ lote: null } as never);
  vi.spyOn(shortsApi, 'progresso').mockResolvedValue({ render: { concluido: false } } as never);
});
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
  vi.restoreAllMocks();
});

describe('D-1051 · a faixa acompanha o lote', () => {
  it('o lote subiu um short: a casa conta a rede', async () => {
    vi.spyOn(shortsApi, 'listarDoCorte').mockResolvedValue({ shorts: [short('renderizado', 'a.mp4')] } as never);
    const publicacoes = vi.spyOn(shortsApi, 'publicacoesDoCorte').mockResolvedValue({ publicacoes: [] } as never);
    await abrir('/shorts/c9/workspace', 'prateleira');
    expect(prateleira()).toBe('1 pronto, YT 0 · TT 0 · IG 0');

    publicacoes.mockResolvedValue({ publicacoes: [NO_YOUTUBE] } as never);
    qc.setQueryData(LOTE_KEY, loteCom(1));
    await assentar();
    expect(prateleira()).toBe('1 pronto, YT 1 · TT 0 · IG 0');
  });

  it('o lote andar sem publicar nada não relê à toa', async () => {
    vi.spyOn(shortsApi, 'listarDoCorte').mockResolvedValue({ shorts: [] } as never);
    const publicacoes = vi.spyOn(shortsApi, 'publicacoesDoCorte').mockResolvedValue({ publicacoes: [] } as never);
    await abrir('/shorts/c9/workspace', 'prateleira');
    const leituras = publicacoes.mock.calls.length;

    qc.setQueryData(LOTE_KEY, loteCom(0, 2));
    await assentar();
    expect(publicacoes.mock.calls.length).toBe(leituras);
  });
});

describe('D-1051 · o painel que fecha durante o upload', () => {
  it('o upload termina depois do painel sair: a releitura acontece', async () => {
    vi.spyOn(shortsApi, 'listarDoCorte').mockResolvedValue({ shorts: [] } as never);
    vi.spyOn(shortsApi, 'publicacoesDoCorte').mockResolvedValue({ publicacoes: [] } as never);
    let terminar: (valor: unknown) => void = () => undefined;
    vi.spyOn(shortsApi, 'publicar').mockReturnValue(new Promise((r) => (terminar = r)) as never);
    await abrir('/shorts/c9/workspace', 'prateleira', true);
    const invalidar = vi.spyOn(qc, 'invalidateQueries');

    publicar.mutate({ shortId: 's1', plataforma: 'youtube_shorts' });
    await assentar();
    desmontar();
    terminar({});
    await assentar();

    expect(invalidar).toHaveBeenCalledWith({ queryKey: publicacoesKey('c9') });
    limpar = async () => undefined;
  });

  it('o upload falhou: não relê nem deixa rejeição solta', async () => {
    vi.spyOn(shortsApi, 'listarDoCorte').mockResolvedValue({ shorts: [] } as never);
    vi.spyOn(shortsApi, 'publicacoesDoCorte').mockResolvedValue({ publicacoes: [] } as never);
    vi.spyOn(shortsApi, 'publicar').mockRejectedValue(new Error('falhou'));
    await abrir('/shorts/c9/workspace', 'prateleira', true);
    const invalidar = vi.spyOn(qc, 'invalidateQueries');

    publicar.mutate({ shortId: 's1', plataforma: 'youtube_shorts' });
    await assentar();

    expect(invalidar).not.toHaveBeenCalledWith({ queryKey: publicacoesKey('c9') });
  });
});

describe('D-1051 · a faixa acompanha o fim do render', () => {
  it('pelo próprio acompanhamento do render, sem releitura feita à mão', async () => {
    const shorts = vi.spyOn(shortsApi, 'listarDoCorte').mockResolvedValue({ shorts: [short('aprovado')] } as never);
    vi.spyOn(shortsApi, 'publicacoesDoCorte').mockResolvedValue({ publicacoes: [] } as never);
    await abrir('/shorts/c9/workspace', 'prateleira');
    expect(prateleira()).toBe('0 prontos, YT 0 · TT 0 · IG 0');

    shorts.mockResolvedValue({ shorts: [short('renderizado', 'a.mp4')] } as never);
    qc.setQueryData(progressoKey('s1'), { render: { concluido: true } });
    await assentar();
    expect(prateleira()).toBe('1 pronto, YT 0 · TT 0 · IG 0');
  });
});

describe('D-1051 · fora das telas do Fire', () => {
  it('no editor, cuja rota também tem um corte, a faixa não busca os shorts dele', async () => {
    const shorts = vi.spyOn(shortsApi, 'listarDoCorte');
    const publicacoes = vi.spyOn(shortsApi, 'publicacoesDoCorte');
    await abrir('/projetos/p1/cortes/c9', 'cortes');
    expect(shorts).not.toHaveBeenCalled();
    expect(publicacoes).not.toHaveBeenCalled();
  });
});
