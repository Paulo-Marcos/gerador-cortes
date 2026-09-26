import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: as avaliações (humana por corte e automática do bruto) passaram para o
// cliente gerado. Cada função bate na rota certa e devolve o mesmo recorte do
// corpo que devolvia (`motivos`, `avaliacao`, `avaliacoes`).

let chamadas: Request[] = [];
let corpo: unknown = {};

beforeEach(() => {
  chamadas = [];
  corpo = {};
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response(JSON.stringify(corpo), { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const corte = async () => (await import('../avaliacaoCorte')).avaliacaoCorteApi;
const bruto = async () => (await import('../avaliacaoBruto')).avaliacaoBrutoApi;

describe('avaliação do corte', () => {
  it('motivos devolve a lista', async () => {
    corpo = { motivos: [{ slug: 'ritmo', rotulo: 'Ritmo' }] };

    expect(await (await corte()).motivos()).toEqual([{ slug: 'ritmo', rotulo: 'Ritmo' }]);
    expect(chamadas[0].url).toBe('http://api.test/api/avaliacao-cortes/motivos');
  });

  it('salvar manda o voto pelo PUT do corte', async () => {
    await (await corte()).salvar('c1', { voto: 4, motivos: ['ritmo'], comentario: '' });

    expect(chamadas[0].method).toBe('PUT');
    expect(chamadas[0].url).toBe('http://api.test/api/avaliacao-cortes/corte/c1');
    expect(await chamadas[0].json()).toEqual({ voto: 4, motivos: ['ritmo'], comentario: '' });
  });
});

describe('avaliação do bruto', () => {
  it('obter devolve só a avaliação (null = nunca avaliado)', async () => {
    corpo = { avaliacao: null };

    expect(await (await bruto()).obter('c1')).toBeNull();
    expect(chamadas[0].url).toBe('http://api.test/api/avaliacao-bruto/corte/c1');
  });

  it.each([
    ['historico', async () => (await bruto()).historico('c1'), '/api/avaliacao-bruto/corte/c1/historico'],
    ['doProjeto', async () => (await bruto()).doProjeto('p1'), '/api/avaliacao-bruto/projeto/p1'],
  ])('%s devolve a lista de avaliações', async (_nome, chamar, caminho) => {
    corpo = { avaliacoes: [] };

    expect(await chamar()).toEqual([]);
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
  });

  it('reavaliar vai por POST com o provider na query', async () => {
    corpo = { avaliacao: { id: 'a1' } };

    expect(await (await bruto()).reavaliar('c1', 'gemini')).toEqual({ id: 'a1' });
    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe('http://api.test/api/avaliacao-bruto/corte/c1?provider=gemini');
  });
});
