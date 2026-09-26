import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-721: o cliente de canais passou para o cliente gerado do contrato. Os nomes
// exportados ficaram; o que se confere aqui é que cada função ainda bate na rota
// certa, com o método e o corpo que a rota espera.

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

async function modulo() {
  return import('../canais');
}

describe('channelsApi sobre o cliente gerado', () => {
  it.each([
    ['listar canais', async () => (await modulo()).channelsApi.listar(), 'GET', '/api/channels'],
    [
      'selecionar canal',
      async () => (await modulo()).channelsApi.selecionar('meu-canal'),
      'POST',
      '/api/channels/meu-canal/select',
    ],
    ['listar temas', async () => (await modulo()).themesApi.listar(), 'GET', '/api/channels/temas'],
    [
      'tema do canal',
      async () => (await modulo()).themesApi.obterDoCanal('c1'),
      'GET',
      '/api/channels/c1/tema',
    ],
    [
      'status do YouTube',
      async () => (await modulo()).youtubeAuthApi.status(),
      'GET',
      '/api/youtube/auth/status',
    ],
    [
      'conectar o YouTube',
      async () => (await modulo()).youtubeAuthApi.conectar(),
      'POST',
      '/api/youtube/auth/conectar',
    ],
    [
      'desconectar o YouTube',
      async () => (await modulo()).youtubeAuthApi.desconectar(),
      'POST',
      '/api/youtube/auth/desconectar',
    ],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();

    expect(chamadas[0].method).toBe(metodo);
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
  });

  it('editar manda só os campos informados', async () => {
    await (await modulo()).channelsApi.editar('c1', { nome: 'Novo' });

    expect(chamadas[0].method).toBe('PATCH');
    expect(await chamadas[0].json()).toEqual({ nome: 'Novo' });
  });

  it('selecionar o tema manda o tema_id', async () => {
    await (await modulo()).themesApi.selecionar('c1', 'moderna');

    expect(chamadas[0].method).toBe('PUT');
    expect(await chamadas[0].json()).toEqual({ tema_id: 'moderna' });
  });
});
