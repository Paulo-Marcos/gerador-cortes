import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { shortsApi, type FireComBruto, type PublicacaoRegistrada, type ShortSugerido } from '@/features/shorts/shortsApi';
import { usePublicarEAtualizar } from '@/features/shorts/useLotePublicacao';
import { shortsDoCorteKey } from '@/features/shorts/useShortsDoCorte';
import { comOQueATelaVe, type trilhaDoFire } from '../trilhaDoFire';
import type { TelaId } from '../upgradeRoutes';
import { useTrilhaDaTela } from '../useTrilhaDoFire';

// D-1051 · achado da auditoria: a faixa contava pela lista dos Fires, que o fim do render e
// o publicar não relêem. O cartão mostrava o short pronto, e a casa, "0 prontos".

const FIRE = {
  corte_id: 'c9',
  finalizado_em: null,
  shorts: { sugerido: 0, aprovado: 1, renderizado: 0, rejeitado: 0, total: 1 },
  redes: [],
} as unknown as FireComBruto;
const short = (status: string, arquivo = '') =>
  ({ id: 's1', status, arquivo_short_path: arquivo }) as unknown as ShortSugerido;
const publicado = (plataforma: string, alvo = 's1') =>
  ({ alvo_id: alvo, plataforma, publicado_em: '2026-11-05' }) as PublicacaoRegistrada;

describe('D-1051 · a conta pelas consultas da tela', () => {
  it('conta pelos shorts e pelas publicações, e não pela lista', () => {
    const fire = comOQueATelaVe(FIRE, [short('renderizado', 'a.mp4')], [publicado('tiktok')]);
    expect(fire.shorts).toMatchObject({ aprovado: 0, renderizado: 1, total: 1 });
    expect(fire.redes.find((r) => r.plataforma === 'tiktok')?.publicados).toBe(1);
    expect(fire.redes.find((r) => r.plataforma === 'youtube_shorts')?.publicados).toBe(0);
  });

  it('renderizado sem arquivo não conta como pronto, como na Prateleira', () => {
    expect(comOQueATelaVe(FIRE, [short('renderizado')], undefined).shorts.renderizado).toBe(0);
  });

  it('publicação sem data, ou de outro corte, não conta', () => {
    const pacote = { ...publicado('tiktok'), publicado_em: '' };
    const fire = comOQueATelaVe(FIRE, [short('renderizado', 'a.mp4')], [pacote, publicado('tiktok', 'outro')]);
    expect(fire.redes.find((r) => r.plataforma === 'tiktok')?.publicados).toBe(0);
  });

  it('o que ainda não chegou vem da lista', () => {
    const redes = [{ plataforma: 'tiktok', publicados: 2, completa: true }];
    const comRedes = { ...FIRE, redes } as FireComBruto;
    expect(comOQueATelaVe(comRedes, undefined, undefined)).toBe(comRedes);
    expect(comOQueATelaVe(comRedes, [short('aprovado')], undefined).redes).toBe(redes);
  });
});

describe('D-1051 · a faixa acompanha os gestos, com a lista parada', () => {
  let limpar: () => Promise<void> = async () => undefined;
  afterEach(async () => {
    await limpar();
    limpar = async () => undefined;
    vi.restoreAllMocks();
  });

  let etapas: ReturnType<typeof trilhaDoFire> = [];
  let publicar: ReturnType<typeof usePublicarEAtualizar>;
  let qc: ReturnType<typeof useQueryClient>;
  function Sonda({ tela }: { tela: TelaId }) {
    etapas = useTrilhaDaTela(tela, null);
    publicar = usePublicarEAtualizar('c9');
    qc = useQueryClient();
    return null;
  }

  const prateleira = () => etapas.find((e) => e.id === 'prateleira')?.contagem;
  const listarShorts = () => vi.spyOn(shortsApi, 'listarDoCorte');
  const listarPublicacoes = () => vi.spyOn(shortsApi, 'publicacoesDoCorte');

  async function abrir() {
    vi.spyOn(shortsApi, 'listarFires').mockResolvedValue({ fires: [FIRE] } as never);
    ({ limpar } = montar(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/shorts/c9/workspace']}>
          <Sonda tela="prateleira" />
        </MemoryRouter>
      </QueryClientProvider>,
    ));
    await assentar();
  }

  it('o render terminou: a casa conta o short pronto', async () => {
    const shorts = listarShorts().mockResolvedValue({ shorts: [short('aprovado')] } as never);
    listarPublicacoes().mockResolvedValue({ publicacoes: [] } as never);
    await abrir();
    expect(prateleira()).toBe('0 prontos, YT 0 · TT 0 · IG 0');

    // É o que `useProgressoRender` faz ao ver o render concluído.
    shorts.mockResolvedValue({ shorts: [short('renderizado', 'a.mp4')] } as never);
    void qc.invalidateQueries({ queryKey: shortsDoCorteKey('c9') });
    await assentar();
    expect(prateleira()).toBe('1 pronto, YT 0 · TT 0 · IG 0');
  });

  it('publicou pelo painel: a casa conta a rede', async () => {
    listarShorts().mockResolvedValue({ shorts: [short('renderizado', 'a.mp4')] } as never);
    const publicacoes = listarPublicacoes().mockResolvedValue({ publicacoes: [] } as never);
    vi.spyOn(shortsApi, 'publicar').mockResolvedValue({} as never);
    await abrir();
    expect(prateleira()).toBe('1 pronto, YT 0 · TT 0 · IG 0');

    publicacoes.mockResolvedValue({ publicacoes: [publicado('youtube_shorts')] } as never);
    publicar.mutate({ shortId: 's1', plataforma: 'youtube_shorts' });
    await assentar();
    expect(prateleira()).toBe('1 pronto, YT 1 · TT 0 · IG 0');
  });
});
