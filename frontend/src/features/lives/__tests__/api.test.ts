import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: busca de lives e ranking saíram de lib/api.ts para a feature, sobre o
// cliente gerado. Mesmas rotas e a mesma query de antes — filtro vazio não vai.

let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response('{}', { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const lives = async () => (await import('../api')).livesApi;

describe('livesApi sobre o cliente gerado', () => {
  it('a busca sem data manda só o limite', async () => {
    await (await lives()).listarLivesCanal();

    expect(chamadas[0].url).toBe('http://api.test/api/youtube/lives?max_results=25');
  });

  it('a busca com data manda o corte de data', async () => {
    await (await lives()).listarLivesCanal('20260901', 10);

    const url = new URL(chamadas[0].url);
    expect(Object.fromEntries(url.searchParams)).toEqual({ max_results: '10', after_date: '20260901' });
  });

  it('enfileirar manda os vídeos e o canal de origem', async () => {
    await (await lives()).enfileirarDownloads(['v1', 'v2'], '@canal');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe('http://api.test/api/youtube/enfileirar');
    expect(await chamadas[0].json()).toEqual({ video_ids: ['v1', 'v2'], canal_origem: '@canal' });
  });

  it.each([
    [false, 'http://api.test/api/ranking-lives'],
    [true, 'http://api.test/api/ranking-lives?forcar_refresh=true'],
  ])('ranking com forcar_refresh=%s', async (forcar, url) => {
    await (await lives()).listarRankingLives(forcar);

    expect(chamadas[0].url).toBe(url);
  });

  it.each([
    ['refresh', async () => (await lives()).refreshRankingLives(), '/api/ranking-lives/refresh'],
    ['rejeitar', async () => (await lives()).rejeitarCandidata('v1'), '/api/ranking-lives/v1/rejeitar'],
    ['enfileirar candidata', async () => (await lives()).enfileirarCandidata('v1'), '/api/ranking-lives/v1/enfileirar'],
  ])('%s vai por POST', async (_nome, chamar, caminho) => {
    await chamar();

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
  });
});
