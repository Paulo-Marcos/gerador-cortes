import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assentar, montar } from '@/features/editor/__tests__/domMinimo';
import { shortsApi, type FireComBruto } from '@/features/shorts/shortsApi';
import { FIRES_KEY } from '@/features/shorts/useFires';
import { TrilhaDeEtapas } from '../TrilhaDeEtapas';
import { trilhaDoFire } from '../trilhaDoFire';
import type { TelaId } from '../upgradeRoutes';
import { useTrilhaDaTela } from '../useTrilhaDoFire';

// D-1051: as duas telas do Fire ganham a trilha que a live já tinha, nas URLs atuais.

const FIRE = {
  corte_id: 'c9',
  numero: 9,
  projeto_id: 'p1',
  projeto_titulo: 'Live',
  finalizado_em: null,
  shorts: { sugerido: 2, aprovado: 1, renderizado: 2, rejeitado: 1, total: 6 },
  redes: [
    { plataforma: 'youtube_shorts', publicados: 1, completa: false },
    { plataforma: 'tiktok', publicados: 0, completa: false },
  ],
} as unknown as FireComBruto;

const comShorts = (shorts: object) => ({ ...FIRE, shorts: { ...FIRE.shorts, ...shorts } }) as FireComBruto;
const casa = (etapas: ReturnType<typeof trilhaDoFire>, id: string) => etapas.find((e) => e.id === id)!;

describe('D-1051 · as casas da trilha do Fire', () => {
  it('Curar conta o que falta decidir; Prateleira, o que está pronto e onde subiu', () => {
    const etapas = trilhaDoFire('fire', 'c9', FIRE);
    expect(casa(etapas, 'curar').contagem).toBe('2 sugeridos, 1 aprovado');
    expect(casa(etapas, 'prateleira').contagem).toBe('2 prontos, YT 1 · TT 0 · IG 0');
  });

  it('as casas levam às duas URLs de hoje', () => {
    const etapas = trilhaDoFire('prateleira', 'c9', FIRE);
    expect(casa(etapas, 'curar').to).toBe('/shorts/c9');
    expect(casa(etapas, 'prateleira').to).toBe('/shorts/c9/workspace');
  });

  it('acende a casa da tela aberta', () => {
    expect(casa(trilhaDoFire('fire', 'c9', FIRE), 'curar').agora).toBe(true);
    expect(casa(trilhaDoFire('fire', 'c9', FIRE), 'prateleira').agora).toBe(false);
    expect(casa(trilhaDoFire('prateleira', 'c9', FIRE), 'prateleira').agora).toBe(true);
    expect(casa(trilhaDoFire('prateleira', 'c9', FIRE), 'curar').agora).toBe(false);
  });

  it('Curar fica feita quando nenhum sugerido espera decisão', () => {
    expect(casa(trilhaDoFire('fire', 'c9', FIRE), 'curar').feita).toBe(false);
    expect(casa(trilhaDoFire('fire', 'c9', comShorts({ sugerido: 0 })), 'curar').feita).toBe(true);
  });

  it('só rejeitados não é curadoria feita', () => {
    const curar = casa(trilhaDoFire('fire', 'c9', comShorts({ sugerido: 0, aprovado: 0, renderizado: 0, rejeitado: 3, total: 3 })), 'curar');
    expect(curar).toMatchObject({ contagem: 'sem shorts', feita: false });
  });

  it('Prateleira só fica feita pela declaração do operador (RN-17), não pelas publicações', () => {
    const redesCompletas = {
      ...FIRE,
      redes: [{ plataforma: 'youtube_shorts', publicados: 2, completa: true }],
    } as FireComBruto;
    expect(casa(trilhaDoFire('prateleira', 'c9', redesCompletas), 'prateleira').feita).toBe(false);
    const declarado = { ...FIRE, finalizado_em: '2026-11-05T00:00:00' } as FireComBruto;
    expect(casa(trilhaDoFire('prateleira', 'c9', declarado), 'prateleira').feita).toBe(true);
  });

  it('sem os dados ainda, as casas existem sem inventar contagem', () => {
    const etapas = trilhaDoFire('fire', 'c9', undefined);
    expect(etapas.map((e) => e.contagem)).toEqual(['—', '—']);
    expect(etapas.map((e) => e.feita)).toEqual([false, false]);
  });

  it('fora das duas telas do Fire não há trilha', () => {
    expect(trilhaDoFire('shorts', null, FIRE)).toEqual([]);
    expect(trilhaDoFire('prontos', 'c9', FIRE)).toEqual([]);
  });
});

describe('D-1051 · a faixa de etapas da tela aberta', () => {
  afterEach(() => vi.restoreAllMocks());

  function desenhar(rota: string, tela: TelaId, projetoId: string | null = null) {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
    qc.setQueryData(FIRES_KEY, { fires: [FIRE] });
    const Sonda = () => <TrilhaDeEtapas etapas={useTrilhaDaTela(tela, projetoId)} />;
    return renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[rota]}>
          <Sonda />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('em /shorts/:corte, desenha a trilha com a Curar acesa', () => {
    const html = desenhar('/shorts/c9', 'fire');
    expect(html).toContain('aria-label="Etapas do Fire"');
    expect(html).toContain('>2 sugeridos, 1 aprovado<');
    expect(html).toContain('href="/shorts/c9/workspace"');
    expect(html).toMatch(/<a [^>]*aria-current="step"[^>]*href="\/shorts\/c9"/);
  });

  it('em /shorts/:corte/workspace, desenha a mesma trilha com a Prateleira acesa', () => {
    const html = desenhar('/shorts/c9/workspace', 'prateleira');
    expect(html).toContain('>2 prontos, YT 1 · TT 0 · IG 0<');
    expect(html).toMatch(/<a [^>]*aria-current="step"[^>]*href="\/shorts\/c9\/workspace"/);
  });

  it('na lista de Shorts não há faixa', () => {
    expect(desenhar('/shorts', 'shorts')).toBe('');
  });

  it('fora do Fire, a casca não busca a lista dos Fires por causa da faixa', async () => {
    const listar = vi.spyOn(shortsApi, 'listarFires').mockResolvedValue({ fires: [] } as never);
    const Sonda = () => {
      useTrilhaDaTela('biblioteca', null);
      return null;
    };
    const { limpar } = montar(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/']}>
          <Sonda />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await assentar();
    expect(listar).not.toHaveBeenCalled();
    await limpar();
  });

  it('a casca desenha a faixa da tela, e não só a da live', () => {
    const casca = readFileSync(resolve(__dirname, '../UpgradeShell.tsx'), 'utf8');
    expect(casca).toMatch(/const etapasDaLive = useTrilhaDaTela\(tela, projetoId\)/);
  });

  it('dentro da live, segue a trilha da live', () => {
    const html = desenhar('/projetos/p1/cortes/c9', 'cortes', 'p1');
    expect(html).toContain('aria-label="Etapas da live"');
    expect(html).not.toContain('Prateleira');
  });
});
