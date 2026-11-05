import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-1043: gerar preenche só o que falta; regerar é a mesma rota com o pedido explícito.

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

describe('regerarMetadadosClaude', () => {
  it('pede para substituir, com o provider na query', async () => {
    const { geracaoIaApi } = await import('../api/geracao');

    await geracaoIaApi.regerarMetadadosClaude('c1', 'gemini');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(
      'http://api.test/api/claude/corte/c1/gerar-metadados?provider=gemini&substituir=true',
    );
  });
});
