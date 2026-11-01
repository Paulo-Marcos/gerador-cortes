import { afterEach, describe, expect, it, vi } from 'vitest';

// D-1005: vários motivos viajam num só `motivo`, separados por "|" — o formato
// que o backend separa e grava.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function urlDoDelete(motivos?: readonly string[]): Promise<string> {
  const chamadas: Request[] = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response('{"message":"ok","corte_id":"c1"}', { status: 200 });
    }),
  );
  const { cortesApi } = await import('../api/cortes');
  await cortesApi.deletarCorte('c1', motivos);
  return decodeURIComponent(chamadas[0].url);
}

describe('cortesApi.deletarCorte · vários motivos (D-1005)', () => {
  it('junta os motivos com "|" num só parâmetro', async () => {
    expect(await urlDoDelete(['tema_fraco', 'repetido'])).toBe(
      'http://api.test/api/cortes/c1?motivo=tema_fraco|repetido',
    );
  });

  it('lista vazia é o mesmo que sem motivo', async () => {
    expect(await urlDoDelete([])).toBe('http://api.test/api/cortes/c1');
  });
});
