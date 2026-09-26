import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: o pin da ordem dos cortes passou para o cliente gerado. A resposta é a
// lista de cortes inteira, que vai direto para o cache da listagem.

let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response(JSON.stringify([{ id: 'c1', posicao_fixada: 2 }]), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const ordem = async () => (await import('../api')).ordemCortesApi;

describe('ordemCortesApi sobre o cliente gerado', () => {
  it('normalizar solta os pins da live e devolve os cortes', async () => {
    const cortes = await (await ordem()).normalizar('p1');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe('http://api.test/api/ordem-cortes/projeto/p1/normalizar');
    expect(cortes).toEqual([{ id: 'c1', posicao_fixada: 2 }]);
  });

  it.each([
    [2, { posicao: 2 }],
    [null, { posicao: null }],
  ])('fixar na posição %s manda o pin (null solta)', async (posicao, esperado) => {
    await (await ordem()).fixarPosicao('c1', posicao);

    expect(chamadas[0].method).toBe('PUT');
    expect(chamadas[0].url).toBe('http://api.test/api/ordem-cortes/corte/c1/posicao');
    expect(await chamadas[0].json()).toEqual(esperado);
  });
});
