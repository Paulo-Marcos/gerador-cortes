import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-909: cada função do estilo das capas bate na rota certa, e gravar manda só
// o que se escolhe — as fotos vêm da pasta, não do corpo.

let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      if (pedido.url.includes('/claridade')) return Response.json({ claridade: null });
      return Response.json({});
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const modulo = () => import('../api');

describe('estiloDaCapaApi', () => {
  it.each([
    ['ler', async () => (await modulo()).estiloDaCapaApi.ler(), 'GET', '/api/capa-chatgpt/estilo'],
    [
      'remover foto',
      async () => (await modulo()).estiloDaCapaApi.removerFoto('rindo 2.png'),
      'DELETE',
      '/api/capa-chatgpt/apresentador/rindo%202.png',
    ],
    [
      'claridade',
      async () => (await modulo()).estiloDaCapaApi.claridade('c1'),
      'GET',
      '/api/avaliacoes-thumbnail/corte/c1/claridade',
    ],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();
    expect(chamadas[0].method).toBe(metodo);
    expect(new URL(chamadas[0].url).pathname).toBe(caminho);
  });

  it('gravar manda o protagonista e a meta, e nada mais', async () => {
    const { estiloDaCapaApi } = await modulo();

    await estiloDaCapaApi.gravar({
      protagonista: 'apresentador',
      luminancia_minima: 95,
      escuros_maximo: 40,
      fotos_do_apresentador: ['rindo.png'],
      expressoes: ['rindo'],
      maximo_de_fotos: 40,
    });

    expect(chamadas[0].method).toBe('PUT');
    expect(await chamadas[0].clone().json()).toEqual({
      protagonista: 'apresentador',
      luminancia_minima: 95,
      escuros_maximo: 40,
    });
  });

  it('a claridade sem capa volta null', async () => {
    const { estiloDaCapaApi } = await modulo();

    expect(await estiloDaCapaApi.claridade('c1')).toBeNull();
  });

  it('a miniatura da foto fura o cache pela versão', async () => {
    const { fotoDoApresentadorUrl } = await modulo();

    expect(fotoDoApresentadorUrl('rindo.png', 3)).toBe(
      'http://api.test/api/capa-chatgpt/apresentador/rindo.png?v=3',
    );
  });
});
