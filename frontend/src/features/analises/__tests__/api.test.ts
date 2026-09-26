import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: a Área de Análises saiu de lib/api.ts para a feature, sobre o cliente
// gerado. Cada chamada bate na mesma rota de antes.

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

const analises = async () => (await import('../api')).analisesApi;

describe('analisesApi sobre o cliente gerado', () => {
  it.each([
    [
      'telemetria do projeto',
      async () => (await analises()).obterTelemetriaCortes('p1'),
      'GET',
      '/api/projetos/p1/telemetria-cortes',
    ],
    [
      'status do YouTube',
      async () => (await analises()).obterYoutubeStatsStatus(),
      'GET',
      '/api/projetos/youtube-stats/status',
    ],
    [
      'levantamento por duração',
      async () => (await analises()).levantamentoDuracaoRetencao(),
      'GET',
      '/api/projetos/youtube-stats/levantamento/duracao-retencao',
    ],
    [
      'levantamento por título',
      async () => (await analises()).levantamentoTituloDesempenho(),
      'GET',
      '/api/projetos/youtube-stats/levantamento/titulo-desempenho',
    ],
    [
      'sincronizar o YouTube',
      async () => (await analises()).sincronizarYoutubeStats(),
      'POST',
      '/api/projetos/youtube-stats/sync',
    ],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();

    expect(chamadas[0].method).toBe(metodo);
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
  });

  it('o CSV da telemetria é uma URL para o navegador baixar', async () => {
    expect((await analises()).telemetriaCortesCsvUrl()).toBe(
      'http://api.test/api/projetos/telemetria-cortes/export?formato=csv',
    );
    expect(chamadas).toHaveLength(0);
  });
});
