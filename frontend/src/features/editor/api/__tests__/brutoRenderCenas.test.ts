import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: o bruto, o render e as cenas do corte saíram de lib/api.ts, sobre o
// cliente gerado.

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

const API = 'http://api.test/api';
const bruto = async () => (await import('../bruto')).brutoApi;
const render = async () => (await import('../render')).renderApi;
const cenas = async () => (await import('../cenas')).cenasApi;

describe('brutoApi', () => {
  it('sem opções, pede só o bruto — o mesmo padrão do backend', async () => {
    await (await bruto()).cortarClipBruto('c1');

    expect(chamadas[0].url).toBe(`${API}/cortes/c1/gerar-bruto`);
    expect(await chamadas[0].json()).toEqual({ refazer_transcricao: false, refazer_cenas: false });
  });

  it('os opt-ins da regeração vão como pedidos', async () => {
    await (await bruto()).cortarClipBruto('c1', { refazer_cenas: true });

    expect(await chamadas[0].json()).toEqual({ refazer_transcricao: false, refazer_cenas: true });
  });

  it.each([
    ['o status', async () => (await bruto()).statusClipBruto('c1'), '/export/corte/c1/cortar/status'],
    ['os passos', async () => (await bruto()).brutoProgress('c1'), '/cortes/c1/bruto-progress'],
  ])('lê %s', async (_nome, chamar, caminho) => {
    await chamar();

    expect(chamadas[0].url).toBe(`${API}${caminho}`);
  });
});

describe('renderApi', () => {
  it.each([
    ['a situação do pipeline', async () => (await render()).obterPipelineStatus('c1'), '/cortes/c1/pipeline-status'],
    ['o Studio', async () => (await render()).obterRemotionStudioUrl('c1'), '/cortes/c1/remotion-studio-url'],
  ])('lê %s', async (_nome, chamar, caminho) => {
    await chamar();

    expect(chamadas[0].url).toBe(`${API}${caminho}`);
  });

  it('o render parcial leva a fase onde parar', async () => {
    await (await render()).renderizarRemotion('c1', { startFrom: 'grade', pararEm: 'overlays' });

    expect(chamadas[0].url).toBe(`${API}/cortes/c1/renderizar-pipeline`);
    expect(await chamadas[0].json()).toEqual({ start_from: 'grade', continuar: false, parar_em: 'overlays' });
  });
});

describe('cenasApi', () => {
  it('gera as cenas', async () => {
    await (await cenas()).gerarCenasRemotion('c1');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`${API}/cortes/c1/gerar-cenas-remotion`);
  });

  it('importa as cenas como vieram', async () => {
    const payload = { formato: 'cortes', cenas: [{ tipo: 'citacao', startLeg: 1 }] };

    await (await cenas()).importarCenasRemotion('c1', payload as never);

    expect(chamadas[0].url).toBe(`${API}/cortes/c1/cenas-remotion/importar`);
    expect(await chamadas[0].json()).toEqual(payload);
  });

  it('valida (ou desfaz) a revisão das cenas', async () => {
    await (await cenas()).validarCenasRemotion('c1', false);

    expect(await chamadas[0].json()).toEqual({ validado: false });
  });

  it('lê o prompt das cenas', async () => {
    await (await cenas()).obterPromptCenasRemotion('c1');

    expect(chamadas[0].url).toBe(`${API}/cortes/c1/cenas-remotion/prompt`);
  });
});

describe('retratos (D-723: sem fetch direto)', () => {
  it('preenche os retratos das fichas das cenas', async () => {
    await (await cenas()).preencherRetratos('c1');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`${API}/cortes/c1/cenas-remotion/retratos`);
  });

  it('guarda o retrato de uma URL no banco', async () => {
    const { retratosApi } = await import('../retratos');

    await retratosApi.salvarDeUrl('Fulano', 'https://exemplo.org/f.jpg');

    expect(chamadas[0].url).toBe(`${API}/retratos/salvar-url`);
    expect(await chamadas[0].json()).toEqual({ nome: 'Fulano', url: 'https://exemplo.org/f.jpg' });
  });
});
