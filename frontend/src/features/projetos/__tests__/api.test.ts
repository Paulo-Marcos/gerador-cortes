import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: o ciclo do projeto saiu de lib/api.ts para a feature, sobre o cliente gerado.

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

const projetos = async () => (await import('../api')).projetosApi;

describe('projetosApi sobre o cliente gerado', () => {
  it.each([
    ['lista', async () => (await projetos()).listarProjetos(), 'GET', '/api/projetos'],
    ['abre um', async () => (await projetos()).obterProjeto('p1'), 'GET', '/api/projetos/p1'],
    ['exclui', async () => (await projetos()).removerProjeto('p1'), 'DELETE', '/api/projetos/p1'],
    [
      'rebaixa o vídeo',
      async () => (await projetos()).rebaixarVideoProjeto('p1'),
      'POST',
      '/api/projetos/p1/rebaixar-video',
    ],
    [
      'limpa os arquivos',
      async () => (await projetos()).limparArquivosProjeto('p1'),
      'POST',
      '/api/projetos/p1/limpar-arquivos',
    ],
    [
      'reinicia os downloads que falharam',
      async () => (await projetos()).reiniciarDownloadsFalhados(),
      'POST',
      '/api/projetos/reiniciar-downloads-falhados',
    ],
  ])('%s', async (_nome, chamar, metodo, caminho) => {
    await chamar();

    expect(chamadas[0].method).toBe(metodo);
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
  });

  it('cria com a URL da live', async () => {
    await (await projetos()).criarProjeto({ youtube_url: 'https://youtu.be/x' });

    expect(chamadas[0].method).toBe('POST');
    expect(await chamadas[0].json()).toEqual({ youtube_url: 'https://youtu.be/x' });
  });

  it('a config de render muda só este projeto quando não se pede o global', async () => {
    await (await projetos()).atualizarRenderConfig('p1', { fonte_preset: 'moderna' });

    expect(chamadas[0].method).toBe('PATCH');
    expect(chamadas[0].url).toBe('http://api.test/api/projetos/p1/render-config');
    expect(await chamadas[0].json()).toEqual({ global_update: false, fonte_preset: 'moderna' });
  });
});
