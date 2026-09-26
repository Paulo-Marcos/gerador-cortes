import { afterEach, describe, expect, it, vi } from 'vitest';
import { criarCliente } from '../client';
import { dados, ErroDaApi } from '../problem';

// D-721: o cliente gerado precisa se comportar como o `request()` que substitui —
// mesma URL, mesmo corpo e, principalmente, a MESMA mensagem de erro, que as
// telas exibem ao operador.

const BASE = 'http://api.test';

function responder(status: number, corpo?: string, statusText = '') {
  const fetch = vi.fn(async (_: Request) => new Response(corpo ?? null, { status, statusText }));
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('o cliente gerado', () => {
  it('devolve o JSON da resposta', async () => {
    responder(200, JSON.stringify({ canais: [], ativo: null }));

    const resposta = await dados(criarCliente(BASE).GET('/api/channels'));

    expect(resposta).toEqual({ canais: [], ativo: null });
  });

  it('codifica o parâmetro de caminho e manda o corpo em JSON', async () => {
    const fetch = responder(200, '{}');

    await criarCliente(BASE).PATCH('/api/channels/{canal_id}', {
      params: { path: { canal_id: 'meu canal' } },
      body: { nome: 'Novo' },
    });

    const pedido = fetch.mock.calls[0][0];
    expect(pedido.url).toBe(`${BASE}/api/channels/meu%20canal`);
    expect(pedido.method).toBe('PATCH');
    expect(pedido.headers.get('Content-Type')).toBe('application/json');
    expect(await pedido.json()).toEqual({ nome: 'Novo' });
  });

  it('resposta sem corpo devolve undefined', async () => {
    responder(204);

    expect(await dados(criarCliente(BASE).POST('/api/youtube/auth/desconectar'))).toBeUndefined();
  });

  it('erro vira exceção com a mensagem de sempre: status, texto e corpo', async () => {
    responder(404, '{"detail":"Canal não encontrado: \'x\'."}', 'Not Found');

    const falha = criarCliente(BASE).POST('/api/channels/{canal_id}/select', {
      params: { path: { canal_id: 'x' } },
    });

    await expect(falha).rejects.toMatchObject({
      message: '404 Not Found — {"detail":"Canal não encontrado: \'x\'."}',
    });
  });

  it('o erro expõe o status e o detail do backend', async () => {
    responder(400, '{"detail":"Id de canal inválido"}', 'Bad Request');

    const erro = await criarCliente(BASE)
      .GET('/api/channels')
      .catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(ErroDaApi);
    expect((erro as ErroDaApi).status).toBe(400);
    expect((erro as ErroDaApi).detalhe).toBe('Id de canal inválido');
  });

  it('erro sem corpo não deixa o travessão sobrando', async () => {
    responder(500, '', 'Internal Server Error');

    await expect(criarCliente(BASE).GET('/api/channels')).rejects.toMatchObject({
      message: '500 Internal Server Error',
    });
  });
});
