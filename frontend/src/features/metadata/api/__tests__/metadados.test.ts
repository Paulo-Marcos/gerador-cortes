import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: o metadado do corte e a capa saíram de lib/api.ts, sobre o cliente gerado.

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

const metadados = async () => (await import('../metadados')).metadadosApi;
const BASE = 'http://api.test/api/metadados/corte/c1';

describe('metadadosApi sobre o cliente gerado', () => {
  it.each([
    ['lê o metadado', async () => (await metadados()).obterMetadado('c1'), 'GET', ''],
    ['alterna o Fire', async () => (await metadados()).toggleFireMeta('c1'), 'POST', '/toggle-fire'],
    ['gera a capa', async () => (await metadados()).gerarThumbnail('c1'), 'POST', '/gerar-thumbnail'],
    ['emoldura a capa', async () => (await metadados()).aplicarMolduraThumbnail('c1'), 'POST', '/aplicar-moldura'],
    ['comprime a capa', async () => (await metadados()).comprimirThumbnail('c1'), 'POST', '/comprimir-thumbnail'],
    ['remove a capa', async () => (await metadados()).removerThumbnail('c1'), 'DELETE', '/thumbnail'],
    ['o prompt do metadado', async () => (await metadados()).obterPromptMeta('c1'), 'GET', '/meta/prompt'],
    ['o prompt da capa', async () => (await metadados()).obterPromptThumbnail('c1'), 'GET', '/prompt-thumbnail/prompt'],
    ['o prompt do capista', async () => (await metadados()).obterPromptThumbnailAgente('c1'), 'GET', '/thumbnail-agent/prompt'],
    [
      'o prompt livre do capista',
      async () => (await metadados()).obterPromptThumbnailAgenteLivre('c1'),
      'GET',
      '/thumbnail-agent-livre/prompt',
    ],
  ])('%s', async (_nome, chamar, metodo, sufixo) => {
    await chamar();

    expect(chamadas[0].method).toBe(metodo);
    expect(chamadas[0].url).toBe(`${BASE}${sufixo}`);
  });

  it('edita pelo PATCH com os campos mudados', async () => {
    await (await metadados()).atualizarMetadado('c1', { titulo_youtube: 'Novo', tags_youtube: ['#a'] });

    expect(chamadas[0].method).toBe('PATCH');
    expect(await chamadas[0].json()).toEqual({ titulo_youtube: 'Novo', tags_youtube: ['#a'] });
  });

  it.each([
    ['importarMeta', '/meta/importar', { opcoes_titulo: ['T'], opcoes_texto_capa: [], sinopse: '', hashtags: [] }],
    ['importarPromptThumbnail', '/prompt-thumbnail/importar', { prompt_thumbnail: 'uma capa' }],
  ] as const)('%s manda a resposta colada como veio', async (nome, sufixo, colado) => {
    await (await metadados())[nome]('c1', colado);

    expect(chamadas[0].url).toBe(`${BASE}${sufixo}`);
    expect(await chamadas[0].json()).toEqual(colado);
  });

  it('envia a capa manual como formulário, com o arquivo', async () => {
    const arquivo = new File(['png'], 'capa.png', { type: 'image/png' });

    await (await metadados()).uploadThumbnail('c1', arquivo);

    expect(chamadas[0].url).toBe(`${BASE}/thumbnail-manual`);
    expect(chamadas[0].headers.get('content-type')).toMatch(/^multipart\/form-data; boundary=/);
    const enviado = (await chamadas[0].formData()).get('file') as File;
    expect(enviado.name).toBe('capa.png');
  });
});
