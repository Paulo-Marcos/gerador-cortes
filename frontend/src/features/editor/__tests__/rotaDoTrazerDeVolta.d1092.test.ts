import { afterEach, describe, expect, it, vi } from 'vitest';
import { cortesApi } from '../api/cortes';

// D-1092: a seção Riscados e o Desfazer do aviso (D-1088) trazem o corte de volta
// por UMA rota só, a que devolve a etapa de antes e regera o bruto. Os testes dos
// hooks trocam `cortesApi.trazerDeVolta` por um dublê; aqui se prova a rota de
// verdade, com o `fetch` interceptado.
//
// A origem da API é fixada aqui: sem `VITE_API_URL` (o CI não tem `.env.local`)
// ela é relativa, e o `Request` do Node recusa URL relativa antes do `fetch`.
vi.mock('@/lib/apiBase', async (original) => ({
  ...(await original<typeof import('@/lib/apiBase')>()),
  ORIGEM_API: 'http://api.test',
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a rota do Trazer de volta', () => {
  it('é POST /api/cortes/{id}/trazer-de-volta, sem corpo', async () => {
    const fetch = vi.fn(
      async (_: Request) =>
        new Response(JSON.stringify({ corte_id: 'c 1', status: 'aprovado', gerando_bruto: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);

    const resposta = await cortesApi.trazerDeVolta('c 1');

    const pedido = fetch.mock.calls[0][0];
    expect(pedido.method).toBe('POST');
    expect(pedido.url).toBe('http://api.test/api/cortes/c%201/trazer-de-volta');
    expect(await pedido.text()).toBe('');
    expect(resposta).toEqual({ corte_id: 'c 1', status: 'aprovado', gerando_bruto: true });
  });
});
