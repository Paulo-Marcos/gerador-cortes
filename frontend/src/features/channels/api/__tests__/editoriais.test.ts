import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: os clientes editoriais da tela de Canais passaram para o cliente gerado.
// Cada função ainda bate na rota certa, com o método e o corpo que ela espera.

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

const skills = async () => (await import('../skillsEditoriais')).editorialSkillsApi;
const scaffolds = async () => (await import('../scaffolds')).editorialScaffoldsApi;
const prompts = async () => (await import('../promptsUtilitarios')).promptsUtilitariosApi;
const pesos = async () => (await import('../pesosRanking')).rankingPesosApi;

const PESOS = {
  views: 0.1,
  likes_por_view: 0.1,
  comentarios_por_view: 0.2,
  sentimento: 0.3,
  recencia: 0.2,
  vph: 0.1,
  meia_vida_dias: 90,
};

describe('clientes editoriais sobre o cliente gerado', () => {
  it.each([
    ['listar skills', async () => (await skills()).listar(), 'GET', '/api/editorial-skills', undefined],
    [
      'modelos do Gemini',
      async () => (await skills()).listarModelosGemini(),
      'GET',
      '/api/editorial-skills/modelos-gemini',
      undefined,
    ],
    [
      'editar skill',
      async () => (await skills()).editar('cortador-expert', { corpo: 'novo' }),
      'PUT',
      '/api/editorial-skills/cortador-expert',
      { corpo: 'novo' },
    ],
    [
      'resetar skill',
      async () => (await skills()).resetar('cortador-expert', ['corpo', 'lentes']),
      'POST',
      '/api/editorial-skills/cortador-expert/reset',
      { campos: ['corpo', 'lentes'] },
    ],
    [
      'versões da skill',
      async () => (await skills()).listarVersoes('cortador-expert'),
      'GET',
      '/api/editorial-skills/cortador-expert/versoes',
      undefined,
    ],
    [
      'reverter skill',
      async () => (await skills()).reverter('cortador-expert', 3),
      'POST',
      '/api/editorial-skills/cortador-expert/reverter',
      { versao: 3 },
    ],
    ['listar scaffolds', async () => (await scaffolds()).listar(), 'GET', '/api/editorial-skills/scaffolds', undefined],
    [
      'editar scaffold',
      async () => (await scaffolds()).editar('desvios', 'molde'),
      'PUT',
      '/api/editorial-skills/scaffolds/desvios',
      { scaffold: 'molde' },
    ],
    [
      'resetar scaffold',
      async () => (await scaffolds()).resetar('desvios'),
      'POST',
      '/api/editorial-skills/scaffolds/desvios/reset',
      undefined,
    ],
    [
      'listar prompts',
      async () => (await prompts()).listar(),
      'GET',
      '/api/editorial-skills/prompts-utilitarios',
      undefined,
    ],
    [
      'editar prompt',
      async () => (await prompts()).editar('sentimento', 'texto'),
      'PUT',
      '/api/editorial-skills/prompts-utilitarios/sentimento',
      { prompt: 'texto' },
    ],
    [
      'resetar prompt',
      async () => (await prompts()).resetar('sentimento'),
      'POST',
      '/api/editorial-skills/prompts-utilitarios/sentimento/reset',
      undefined,
    ],
    ['listar pesos', async () => (await pesos()).listar(), 'GET', '/api/editorial-skills/ranking-pesos', undefined],
    [
      'salvar pesos',
      async () => (await pesos()).salvar(PESOS),
      'PUT',
      '/api/editorial-skills/ranking-pesos',
      PESOS,
    ],
    [
      'resetar pesos (GET, sem corpo)',
      async () => (await pesos()).resetar(),
      'GET',
      '/api/editorial-skills/ranking-pesos/reset',
      undefined,
    ],
  ])('%s', async (_nome, chamar, metodo, caminho, corpo) => {
    await chamar();

    const pedido = chamadas[0];
    expect(pedido.method).toBe(metodo);
    expect(pedido.url).toBe(`http://api.test${caminho}`);
    if (corpo === undefined) {
      expect(await pedido.text()).toBe('');
    } else {
      expect(await pedido.json()).toEqual(corpo);
    }
  });
});
