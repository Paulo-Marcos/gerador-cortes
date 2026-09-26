import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: a avaliação de thumbnail por corte e a análise de padrões saíram de
// lib/api.ts para as features, sobre o cliente gerado.

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

describe('avaliação de thumbnail sobre o cliente gerado', () => {
  it('registrar manda o veredito e as notas por POST', async () => {
    const { avaliacaoThumbnailApi } = await import('../avaliacaoThumbnail');
    const corpo = {
      veredito: 'bom' as const,
      nota_fidelidade: 4,
      nota_clareza: null,
      nota_beleza: null,
      nota_impacto: null,
      nota_honestidade: null,
      comentario: '',
    };

    await avaliacaoThumbnailApi.registrar('c1', corpo);

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe('http://api.test/api/avaliacoes-thumbnail/corte/c1');
    expect(await chamadas[0].json()).toEqual(corpo);
  });

  it('listar lê o histórico do corte', async () => {
    const { avaliacaoThumbnailApi } = await import('../avaliacaoThumbnail');

    await avaliacaoThumbnailApi.listar('c1');

    expect(chamadas[0].method).toBe('GET');
    expect(chamadas[0].url).toBe('http://api.test/api/avaliacoes-thumbnail/corte/c1');
  });

  it('a análise de padrões vai por POST com o provider na query', async () => {
    const { padroesThumbnailApi } = await import('@/features/thumbnail-padroes/api');

    await padroesThumbnailApi.analisar('gemini');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe('http://api.test/api/avaliacoes-thumbnail/padroes?provider=gemini');
  });
});
