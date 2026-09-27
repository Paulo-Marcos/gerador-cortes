import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: o corte na edição e o arranjo dos blocos saíram de lib/api.ts, sobre o
// cliente gerado.

let chamadas: Request[] = [];
let corpo = '{}';

beforeEach(() => {
  chamadas = [];
  corpo = '{}';
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', 'http://api.test/api');
  vi.stubGlobal(
    'fetch',
    vi.fn(async (pedido: Request) => {
      chamadas.push(pedido);
      return new Response(corpo, { status: 200 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const cortes = async () => (await import('../cortes')).cortesApi;
const arranjo = async () => (await import('../arranjo')).arranjoApi;
const API = 'http://api.test/api';

describe('cortesApi sobre o cliente gerado', () => {
  it('lista os cortes do projeto', async () => {
    corpo = '[]';

    await (await cortes()).listarCortes('p1');

    expect(chamadas[0].url).toBe(`${API}/cortes/projeto/p1`);
  });

  it.each([
    ['abre um corte', async () => (await cortes()).obterCorte('c1'), 'GET', '/cortes/c1'],
    ['aprova', async () => (await cortes()).aprovarCorte('c1'), 'POST', '/cortes/c1/aprovar'],
    ['exclui', async () => (await cortes()).deletarCorte('c1'), 'DELETE', '/cortes/c1'],
    ['abre a pasta', async () => (await cortes()).abrirPastaCorte('c1'), 'POST', '/cortes/c1/abrir-pasta'],
    ['detecta segmentos', async () => (await cortes()).detectarSegmentos('c1'), 'POST', '/cortes/c1/detectar-segmentos'],
    ['o prompt de trechos', async () => (await cortes()).obterPromptDesvios('c1'), 'GET', '/cortes/c1/desvios/prompt'],
    [
      'ressincroniza a transcrição',
      async () => (await cortes()).sincronizarTranscricao('c1'),
      'POST',
      '/cortes/c1/sincronizar-transcricao',
    ],
    [
      'sincroniza a pós-produção',
      async () => (await cortes()).sincronizarPosProducao('c1'),
      'POST',
      '/cortes/c1/sincronizar-pos-producao',
    ],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();

    expect(chamadas[0].method).toBe(metodo);
    expect(chamadas[0].url).toBe(`${API}${caminho}`);
  });

  it.each([
    [
      'cria um corte manual',
      async () => (await cortes()).criarCorteManual('p1', { inicio_hms: '00:01:00', fim_hms: '00:09:00' }),
      '/cortes/projeto/p1/manual',
      { inicio_hms: '00:01:00', fim_hms: '00:09:00' },
    ],
    [
      'reordena',
      async () => (await cortes()).reordenarCortes('p1', ['c2', 'c1']),
      '/cortes/projeto/p1/reordenar',
      { cortes_ids: ['c2', 'c1'] },
    ],
    ['divide', async () => (await cortes()).dividirCorte('c1', { ponto_seg: 42 }), '/cortes/c1/dividir', { ponto_seg: 42 }],
    ['junta com o vizinho', async () => (await cortes()).juntarCortes('c1'), '/cortes/c1/juntar', {}],
    [
      'adiciona um trecho a remover',
      async () =>
        (await cortes()).adicionarDesvio('c1', { inicio_hms: '00:02:00', fim_hms: '00:02:10', motivo: 'repetição' }),
      '/cortes/c1/adicionar-desvio',
      { inicio_hms: '00:02:00', fim_hms: '00:02:10', motivo: 'repetição' },
    ],
    ['remove um trecho', async () => (await cortes()).removerDesvio('c1', 3), '/cortes/c1/remover-desvio', { desvio_index: 3 }],
    [
      'importa os trechos colados',
      async () => (await cortes()).importarDesvios('c1', [{ inicio_hms: '00:01:00' }]),
      '/cortes/c1/desvios/importar',
      { trechos: [{ inicio_hms: '00:01:00' }] },
    ],
  ])('%s vai por POST com o corpo', async (_nome, chamar, caminho, esperado) => {
    corpo = caminho.endsWith('dividir') || caminho.endsWith('reordenar') ? '[]' : '{}';

    await chamar();

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`${API}${caminho}`);
    expect(await chamadas[0].json()).toEqual(esperado);
  });

  it('edita pelo PATCH com os campos da tela', async () => {
    await (await cortes()).atualizarCorte('c1', { titulo_proposto: 'Novo', is_leitura: 1 });

    expect(chamadas[0].method).toBe('PATCH');
    expect(await chamadas[0].json()).toEqual({ titulo_proposto: 'Novo', is_leitura: 1 });
  });

  it('decide um segmento pelo índice', async () => {
    await (await cortes()).decidirSegmentoDetectado('c1', 2, 'full');

    expect(chamadas[0].method).toBe('PATCH');
    expect(chamadas[0].url).toBe(`${API}/cortes/c1/segmentos-detectados/2`);
    expect(await chamadas[0].json()).toEqual({ decisao: 'full' });
  });

  it('a análise de trechos leva o limpar na query', async () => {
    await (await cortes()).analisarDesviosCorte('c1', true);

    expect(chamadas[0].url).toBe(`${API}/cortes/c1/analisar-desvios?limpar_anteriores=true`);
  });

  it('a análise de trechos do projeto leva o provider', async () => {
    await (await cortes()).analisarDesviosTodos('p1', 'gemini');

    expect(chamadas[0].url).toBe(`${API}/cortes/projeto/p1/analisar-desvios-todos?provider=gemini`);
  });
});

describe('arranjoApi sobre o cliente gerado', () => {
  it('lê o arranjo', async () => {
    await (await arranjo()).obterArranjo('c1');

    expect(chamadas[0].url).toBe(`${API}/cortes/c1/arranjo`);
  });

  it.each([
    ['dividirBloco', { ponto_seg: 10 }, 'dividir'],
    ['moverBloco', { de_indice: 0, para_indice: 2 }, 'mover'],
    ['fundirBloco', { indice: 1 }, 'fundir'],
  ] as const)('%s manda o corpo', async (nome, body, rota) => {
    const a = await arranjo();
    await (a[nome] as (id: string, b: typeof body) => Promise<unknown>)('c1', body);

    expect(chamadas[0].url).toBe(`${API}/cortes/c1/arranjo/${rota}`);
    expect(await chamadas[0].json()).toEqual(body);
  });

  it('restaura a ordem da live', async () => {
    await (await arranjo()).restaurarArranjo('c1');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`${API}/cortes/c1/arranjo/restaurar`);
  });
});
