import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: a fila global saiu de lib/api.ts, sobre o cliente gerado.

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

const fila = async () => (await import('../api')).filaGlobalApi;

describe('filaGlobalApi sobre o cliente gerado', () => {
  it('lê a fila', async () => {
    await (await fila()).filaGlobal();

    expect(chamadas[0].url).toBe('http://api.test/api/export/fila-global');
  });

  it('cancela um job pelo id que a fila publica', async () => {
    await (await fila()).cancelarJob('render:c1');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe('http://api.test/api/export/fila-global/cancelar');
    expect(await chamadas[0].json()).toEqual({ job_id: 'render:c1' });
  });
});
