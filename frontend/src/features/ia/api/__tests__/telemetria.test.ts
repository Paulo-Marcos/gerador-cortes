import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: a telemetria de IA passou para o cliente gerado. O que se confere é a
// query: filtro vazio não vai (seria "igual a vazio", não "qualquer"), como no
// montarQuery que ela substitui.

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

const telemetria = async () => (await import('../telemetria')).llmCallsApi;

describe('llmCallsApi sobre o cliente gerado', () => {
  it('lista sem filtro não manda query', async () => {
    await (await telemetria()).listar();

    expect(chamadas[0].url).toBe('http://api.test/api/claude/telemetria/llm-calls');
  });

  it('lista com os filtros informados e omite os vazios', async () => {
    await (await telemetria()).listar({ projetoId: 'p1', corteId: '', etapa: 'metadados', limite: 50 });

    const url = new URL(chamadas[0].url);
    expect(url.pathname).toBe('/api/claude/telemetria/llm-calls');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      projeto_id: 'p1',
      etapa: 'metadados',
      limite: '50',
    });
  });

  it('a última geração vai pela etapa e pelo alvo', async () => {
    await (await telemetria()).ultimaGeracao('capa-short', { shortId: 's1' });

    const url = new URL(chamadas[0].url);
    expect(url.pathname).toBe('/api/claude/telemetria/ultima-geracao');
    expect(Object.fromEntries(url.searchParams)).toEqual({ etapa: 'capa-short', short_id: 's1' });
  });
});
