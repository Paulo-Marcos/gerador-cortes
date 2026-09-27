import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { renderApi } from '../render';

// I-023: regressao do bug "render final ignora Filtro Global Padrao".
// O frontend NAO pode mais enviar fallback hardcoded de filtro: quando o
// caller nao especifica, o backend tem que resolver via AppSettings.
// D-722: a funcao saiu de lib/api.ts para renderApi, sobre o cliente gerado,
// que chama o fetch com um Request — o corpo e lido dele.

describe('renderApi.renderizarRemotion — payload de filtro', () => {
  let pedidos: Request[] = [];

  beforeEach(() => {
    pedidos = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        pedidos.push(pedido);
        return new Response(JSON.stringify({ message: 'ok' }), { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const renderizar = async (...args: Parameters<typeof renderApi.renderizarRemotion>) =>
    (await import('../render')).renderApi.renderizarRemotion(...args);

  async function lastRequestBody(): Promise<Record<string, unknown>> {
    expect(pedidos.length).toBeGreaterThan(0);
    return (await pedidos[pedidos.length - 1].clone().json()) as Record<string, unknown>;
  }

  it('NAO envia filtro quando o caller nao especifica (deixa backend usar global)', async () => {
    await renderizar('corte-1');

    const body = await lastRequestBody();
    expect(body).not.toHaveProperty('filtro');
  });

  it('NAO envia filtro mesmo quando startFrom e definido', async () => {
    await renderizar('corte-1', { startFrom: 'grade' });

    const body = await lastRequestBody();
    expect(body).not.toHaveProperty('filtro');
    expect(body).toMatchObject({ start_from: 'grade', continuar: false });
  });

  it('envia exatamente o filtro fornecido pelo caller (teste de filtro)', async () => {
    await renderizar('corte-1', { filtro: 'cinematic_iii_leve' });

    expect(await lastRequestBody()).toMatchObject({ filtro: 'cinematic_iii_leve' });
  });

  it('NUNCA usa o literal "cinematic_iii" como fallback', async () => {
    // Regressao especifica: o bug anterior era exatamente este fallback.
    await renderizar('corte-1');
    await renderizar('corte-1', { startFrom: 'overlays' });
    await renderizar('corte-1', { startFrom: 'auto' });

    for (const pedido of pedidos) {
      const body = (await pedido.clone().json()) as Record<string, unknown>;
      expect(body.filtro).not.toBe('cinematic_iii');
    }
  });

  it('traduz startFrom=overlays_continuar para start_from=overlays + continuar=true', async () => {
    await renderizar('corte-1', { startFrom: 'overlays_continuar' });

    expect(await lastRequestBody()).toMatchObject({ start_from: 'overlays', continuar: true });
  });
});
