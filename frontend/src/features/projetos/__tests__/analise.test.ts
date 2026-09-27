import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: a análise pelo lado do projeto saiu de lib/api.ts, sobre o cliente gerado.

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

const analise = async () => (await import('../analise')).analiseApi;

describe('analiseApi sobre o cliente gerado', () => {
  it.each([
    ['a auditoria', async () => (await analise()).obterAuditoriaAnalise('p1'), 'GET', '/api/projetos/p1/auditoria-analise'],
    ['o prompt inteiro', async () => (await analise()).obterPromptAnalise('p1'), 'GET', '/api/projetos/p1/analise/prompt'],
    ['a reanálise', async () => (await analise()).reanalisarProjeto('p1'), 'POST', '/api/projetos/p1/reanalisar'],
    [
      'a transcrição refeita',
      async () => (await analise()).refazerTranscricao('p1'),
      'POST',
      '/api/projetos/p1/refazer-transcricao',
    ],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();

    expect(chamadas[0].method).toBe(metodo);
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
  });

  it('o prompt de um intervalo vai na query', async () => {
    await (await analise()).obterPromptAnaliseIntervalo('p1', {
      inicio_hms: '00:10:00',
      fim_hms: '00:40:00',
      blocos: 2,
    });

    const url = new URL(chamadas[0].url);
    expect(url.pathname).toBe('/api/projetos/p1/analise-intervalo/prompt');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      inicio_hms: '00:10:00',
      fim_hms: '00:40:00',
      blocos: '2',
    });
  });

  it.each([
    [
      'importar a resposta colada',
      async () => (await analise()).importarAnalise('p1', { cortes: [{ titulo_proposto: 'T' }] }),
      '/api/projetos/p1/analise/importar',
      { cortes: [{ titulo_proposto: 'T' }] },
    ],
    [
      'analisar um intervalo',
      async () => (await analise()).analisarIntervalo('p1', { inicio_hms: '01:00:00', fim_hms: '02:00:00' }),
      '/api/projetos/p1/analisar-intervalo',
      { inicio_hms: '01:00:00', fim_hms: '02:00:00' },
    ],
  ])('%s vai por POST com o corpo', async (_nome, chamar, caminho, corpo) => {
    await chamar();

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
    expect(await chamadas[0].json()).toEqual(corpo);
  });
});
