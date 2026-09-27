import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: os ajustes saíram de lib/api.ts para a feature, sobre o cliente gerado.

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

const settings = async () => (await import('../api')).settingsApi;

describe('settingsApi sobre o cliente gerado', () => {
  it('lê os ajustes', async () => {
    await (await settings()).obterSettings();

    expect(chamadas[0].method).toBe('GET');
    expect(chamadas[0].url).toBe('http://api.test/api/settings');
  });

  it('quem passa só o nível de log ainda funciona', async () => {
    await (await settings()).atualizarSettings('debug');

    expect(chamadas[0].method).toBe('PUT');
    expect(await chamadas[0].json()).toEqual({ log_level: 'debug' });
  });

  it('os campos a mudar vão como vieram', async () => {
    await (await settings()).atualizarSettings({ velocidade_player_padrao: 1.5 });

    expect(await chamadas[0].json()).toEqual({ velocidade_player_padrao: 1.5 });
  });

  it('lê a geometria da capa do TikTok', async () => {
    await (await settings()).obterLayoutCapaTiktok();

    expect(chamadas[0].url).toBe('http://api.test/api/settings/capa-tiktok/layout');
  });
});
