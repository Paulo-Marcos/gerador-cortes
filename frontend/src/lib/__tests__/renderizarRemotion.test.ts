import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';

// I-023: regressao do bug "render final ignora Filtro Global Padrao".
// O frontend NAO pode mais enviar fallback hardcoded de filtro: quando o
// caller nao especifica, o backend tem que resolver via AppSettings.

describe('api.renderizarRemotion — payload de filtro', () => {
  const okJson = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ message: 'ok' }),
      text: () => Promise.resolve(''),
    } as unknown as Response);

  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(okJson);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function lastRequestBody(): Record<string, unknown> {
    const calls = fetchSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const init = calls[calls.length - 1][1] as RequestInit | undefined;
    return JSON.parse(String(init?.body ?? '{}'));
  }

  it('NAO envia filtro quando o caller nao especifica (deixa backend usar global)', async () => {
    await api.renderizarRemotion('corte-1');

    const body = lastRequestBody();
    expect(body).not.toHaveProperty('filtro');
  });

  it('NAO envia filtro mesmo quando startFrom e definido', async () => {
    await api.renderizarRemotion('corte-1', { startFrom: 'grade' });

    const body = lastRequestBody();
    expect(body).not.toHaveProperty('filtro');
    expect(body).toMatchObject({ start_from: 'grade', continuar: false });
  });

  it('envia exatamente o filtro fornecido pelo caller (teste de filtro)', async () => {
    await api.renderizarRemotion('corte-1', { filtro: 'cinematic_iii_leve' });

    expect(lastRequestBody()).toMatchObject({ filtro: 'cinematic_iii_leve' });
  });

  it('NUNCA usa o literal "cinematic_iii" como fallback', async () => {
    // Regressao especifica: o bug anterior era exatamente este fallback.
    await api.renderizarRemotion('corte-1');
    await api.renderizarRemotion('corte-1', { startFrom: 'overlays' });
    await api.renderizarRemotion('corte-1', { startFrom: 'auto' });

    for (const call of fetchSpy.mock.calls) {
      const init = call[1] as RequestInit | undefined;
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.filtro).not.toBe('cinematic_iii');
    }
  });

  it('traduz startFrom=overlays_continuar para start_from=overlays + continuar=true', async () => {
    await api.renderizarRemotion('corte-1', { startFrom: 'overlays_continuar' });

    expect(lastRequestBody()).toMatchObject({ start_from: 'overlays', continuar: true });
  });
});
