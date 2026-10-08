import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-804: cada função bate na rota certa. D-898: o pedido entra na fila do
// backend, e a ficha do pedido volta na hora.

const PEDIDO = {
  id: 'p1',
  destino: 'tiktok',
  alvo_id: 'c1',
  corte_id: 'c1',
  estado: 'aguardando',
  etapa: 'Na fila do ChatGPT',
  erro: '',
};
let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      if (pedido.url.includes('/pedidos/')) {
        return Response.json({ pedido: PEDIDO });
      }
      if (pedido.url.endsWith('/pedidos')) {
        return Response.json(PEDIDO, { status: 202 });
      }
      return new Response('{"projeto_url":"","fichas":[],"maximo_de_fichas":10}', { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const modulo = () => import('../api');

describe('capaChatgptApi', () => {
  it.each([
    ['configuração', async () => (await modulo()).capaChatgptApi.configuracao(), 'GET', '/api/capa-chatgpt/config'],
    ['gravar o projeto', async () => (await modulo()).capaChatgptApi.gravarProjeto('x'), 'PUT', '/api/capa-chatgpt/config'],
    ['remover ficha', async () => (await modulo()).capaChatgptApi.removerFicha('a b.png'), 'DELETE', '/api/capa-chatgpt/fichas/a%20b.png'],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();
    expect(chamadas[0].method).toBe(metodo);
    expect(new URL(chamadas[0].url).pathname).toBe(caminho);
  });

  it('pedir manda a capa, o alvo, o prompt e o elenco, e devolve a ficha', async () => {
    const { capaChatgptApi } = await modulo();

    const pedido = await capaChatgptApi.pedir('tiktok', 'c1', 'o sapo aponta', ['Neymar']);

    expect(chamadas[0].method).toBe('POST');
    expect(await chamadas[0].clone().json()).toEqual({
      destino: 'tiktok',
      alvo_id: 'c1',
      prompt: 'o sapo aponta',
      pessoas: ['Neymar'],
    });
    expect(pedido).toEqual(PEDIDO);
  });

  it('pedido lê o último pedido da capa', async () => {
    const { capaChatgptApi } = await modulo();

    expect(await capaChatgptApi.pedido('short', 's 1')).toEqual(PEDIDO);
    expect(new URL(chamadas[0].url).pathname).toBe('/api/capa-chatgpt/pedidos/short/s%201');
  });
});
