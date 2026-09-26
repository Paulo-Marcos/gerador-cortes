import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: filtros e multiversão saíram de lib/api.ts para a feature, sobre o
// cliente gerado — com a mesma query e o mesmo corpo de antes.

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

const filtros = async () => (await import('../filtros')).filtrosApi;

describe('filtrosApi sobre o cliente gerado', () => {
  it('lista os filtros do catálogo', async () => {
    await (await filtros()).listarFiltros();

    expect(chamadas[0].url).toBe('http://api.test/api/export/filtros');
  });

  it('lista as versões do corte', async () => {
    await (await filtros()).listarVersoes('c1');

    expect(chamadas[0].url).toBe('http://api.test/api/export/corte/c1/versoes');
  });

  it('sem filtros escolhidos manda corpo vazio (o backend usa todos)', async () => {
    await (await filtros()).processarMultiversion('c1', true, 10, null);

    const pedido = chamadas[0];
    expect(pedido.method).toBe('POST');
    expect(pedido.url).toBe(
      'http://api.test/api/export/corte/c1/processar-multiversion?preview=true&preview_segundos=10',
    );
    expect(await pedido.json()).toEqual({});
  });

  it('com filtros escolhidos manda só eles', async () => {
    await (await filtros()).processarMultiversion('c1', false, 5, ['cinematic_iii']);

    const pedido = chamadas[0];
    expect(new URL(pedido.url).searchParams.get('preview')).toBe('false');
    expect(await pedido.json()).toEqual({ filtros: ['cinematic_iii'] });
  });
});
