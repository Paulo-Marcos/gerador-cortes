import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-1148 (H-15): a saudação da Biblioteca lê o nome pelo `GET /api/operador` (D-1129).
let pedidos: Request[] = [];

beforeEach(() => {
  pedidos = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      pedidos.push(pedido);
      return new Response('{"nome":"Paulo"}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('consultaDoOperador', () => {
  it('lê o nome da rota do operador', async () => {
    const { consultaDoOperador } = await import('../useSalaDaBiblioteca');
    expect(await consultaDoOperador.queryFn()).toEqual({ nome: 'Paulo' });
    expect(pedidos.map((p) => [p.method, new URL(p.url).pathname])).toEqual([['GET', '/api/operador']]);
  });
});
