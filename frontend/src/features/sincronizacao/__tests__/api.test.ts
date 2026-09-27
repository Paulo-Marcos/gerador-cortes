import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: a sincronização e o ambiente pelo cliente gerado, sem fetch direto.

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

const sincronizacao = async () => (await import('../api')).sincronizacaoApi;

describe('sincronizacaoApi', () => {
  it('lê o estado da sincronização', async () => {
    await (await sincronizacao()).estado();

    expect(chamadas[0].url).toBe('http://api.test/api/sincronizacao');
  });

  it('lê o retrato da máquina', async () => {
    await (await sincronizacao()).ambiente();

    expect(chamadas[0].url).toBe('http://api.test/api/sincronizacao/ambiente');
  });
});
