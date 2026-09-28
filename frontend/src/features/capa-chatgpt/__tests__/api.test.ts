import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-804: cada função bate na rota certa, e a imagem gerada volta como `File` —
// o formato que o upload do Ctrl+V de cada capa já aceita.

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      if (pedido.url.endsWith('/gerar')) {
        return new Response(PNG, { status: 200, headers: { 'Content-Type': 'image/png' } });
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

  it('gerar manda prompt e proporção e devolve a imagem como File', async () => {
    const { capaChatgptApi } = await modulo();

    const arquivo = await capaChatgptApi.gerar('o sapo aponta', '4:5');

    expect(await chamadas[0].clone().json()).toEqual({ prompt: 'o sapo aponta', proporcao: '4:5' });
    expect(arquivo).toBeInstanceOf(File);
    expect(arquivo.type).toBe('image/png');
    expect(arquivo.name).toBe('chatgpt.png');
    expect(new Uint8Array(await arquivo.arrayBuffer())).toEqual(PNG);
  });
});
