import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: a diarização saiu de lib/api.ts e do fetch à mão do hook para a
// feature, sobre o cliente gerado.

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

const diarizacao = async () => (await import('../api')).diarizacaoApi;

describe('diarizacaoApi sobre o cliente gerado', () => {
  it.each([
    ['diarizar o projeto', async () => (await diarizacao()).diarizarProjeto('p1'), 'POST', '/api/diarizacao/projeto/p1/diarizar'],
    ['diarizar um corte', async () => (await diarizacao()).diarizarCorte('c1'), 'POST', '/api/diarizacao/corte/c1/diarizar'],
    ['ler os falantes', async () => (await diarizacao()).obterFalantes('p1'), 'GET', '/api/diarizacao/projeto/p1/falantes'],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();

    expect(chamadas[0].method).toBe(metodo);
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
  });

  it('rebatizar os falantes manda o mapa inteiro por PUT', async () => {
    const falantes = { SPEAKER_00: { nome: 'Pedro', is_canal: true } };

    await (await diarizacao()).atualizarFalantes('p1', falantes);

    expect(chamadas[0].method).toBe('PUT');
    expect(await chamadas[0].json()).toEqual({ falantes });
  });
});
