import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: os presets de layout saíram de lib/api.ts, sobre o cliente gerado.

let chamadas: Request[] = [];
let resposta: () => Response;

beforeEach(() => {
  chamadas = [];
  resposta = () => new Response('{}', { status: 200 });
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return resposta();
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const presets = async () => (await import('../layoutPresetsApi')).layoutPresetsApi;

describe('layoutPresetsApi sobre o cliente gerado', () => {
  it('lista por tipo', async () => {
    resposta = () => new Response('[]', { status: 200 });

    await (await presets()).listarLayoutPresets('palco_short');

    expect(chamadas[0].url).toBe('http://api.test/api/presets/layout?tipo=palco_short');
  });

  it('sem tipo, lista todos', async () => {
    resposta = () => new Response('[]', { status: 200 });

    await (await presets()).listarLayoutPresets();

    expect(chamadas[0].url).toBe('http://api.test/api/presets/layout');
  });

  it('cria com nome, tipo e payload', async () => {
    const corpo = { nome: 'Gancho', tipo: 'gancho_short' as const, payload: { cor: '', realce: 'veu', fonte: '', tamanho: 0, duracao: 0, x: 0, y: 0, largura: 0 } };

    await (await presets()).criarLayoutPreset(corpo);

    expect(chamadas[0].method).toBe('POST');
    expect(await chamadas[0].json()).toEqual(corpo);
  });

  it('renomeia pelo id', async () => {
    await (await presets()).atualizarLayoutPreset('p1', { nome: 'Novo nome' });

    expect(chamadas[0].method).toBe('PUT');
    expect(chamadas[0].url).toBe('http://api.test/api/presets/layout/p1');
    expect(await chamadas[0].json()).toEqual({ nome: 'Novo nome' });
  });

  it('exclui sem esperar corpo na resposta', async () => {
    resposta = () => new Response(null, { status: 204 });

    await expect((await presets()).deletarLayoutPreset('p1')).resolves.toBeUndefined();
    expect(chamadas[0].method).toBe('DELETE');
  });
});
