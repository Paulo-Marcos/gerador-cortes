import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-1106: o motivo do riscado viaja no corpo do POST, os vários num só `motivo`
// separados por "|" — o formato que o backend separa e grava
// (`domain/corte/motivo_apagado.py`). A prova morava no `deletarCorte`, que saiu.

let chamadas: Request[] = [];

beforeEach(() => {
  chamadas = [];
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response('{"corte_id":"c1","status_anterior":"aprovado","liberado_mb":0,"retido_mb":0}', {
        status: 200,
      });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function corpoDoRiscar(motivos?: readonly string[]): Promise<unknown> {
  const { cortesApi } = await import('../cortes');
  await cortesApi.riscarCorte('c1', motivos);
  expect(chamadas[0].method).toBe('POST');
  expect(chamadas[0].url).toBe('http://api.test/api/cortes/c1/riscar');
  return chamadas[0].json();
}

describe('cortesApi.riscarCorte · motivos (D-1106)', () => {
  it('leva o motivo escolhido no corpo', async () => {
    expect(await corpoDoRiscar(['repetido'])).toEqual({ motivo: 'repetido' });
  });

  it('junta os vários motivos com "|" num só campo', async () => {
    expect(await corpoDoRiscar(['tema_fraco', 'repetido'])).toEqual({ motivo: 'tema_fraco|repetido' });
  });

  it('sem motivo ou com a lista vazia, o motivo vai nulo', async () => {
    expect(await corpoDoRiscar()).toEqual({ motivo: null });
    chamadas = [];
    expect(await corpoDoRiscar([])).toEqual({ motivo: null });
  });
});
