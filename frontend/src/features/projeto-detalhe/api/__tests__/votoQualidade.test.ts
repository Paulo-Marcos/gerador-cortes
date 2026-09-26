import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: o voto de qualidade da live passou para o cliente gerado.

let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response(
        JSON.stringify({ projeto_id: 'p1', voto_qualidade_live: 4, pontuacao_ranking: 71.5 }),
        { status: 200 },
      );
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const voto = async () => (await import('../votoQualidade')).votoQualidadeApi;

describe('votoQualidadeApi sobre o cliente gerado', () => {
  it('obter lê o voto da live', async () => {
    expect(await (await voto()).obter('p1')).toEqual({
      projeto_id: 'p1',
      voto_qualidade_live: 4,
      pontuacao_ranking: 71.5,
    });
    expect(chamadas[0].url).toBe('http://api.test/api/ranking-lives/projetos/p1/voto-qualidade');
  });

  it('salvar manda o voto por PUT', async () => {
    await (await voto()).salvar('p1', 4);

    expect(chamadas[0].method).toBe('PUT');
    expect(await chamadas[0].json()).toEqual({ voto: 4 });
  });
});
