import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// D-722: as gerações pela IA saíram de lib/api.ts, sobre o cliente gerado.

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

const geracao = async () => (await import('../api/geracao')).geracaoIaApi;

describe('geracaoIaApi sobre o cliente gerado', () => {
  it('a análise da live leva a diarização e o provider na query', async () => {
    await (await geracao()).analisarViaClaude('p1', false, 'gemini');

    const url = new URL(chamadas[0].url);
    expect(chamadas[0].method).toBe('POST');
    expect(url.pathname).toBe('/api/claude/projeto/p1/analisar');
    expect(Object.fromEntries(url.searchParams)).toEqual({ usar_diarizacao: 'false', provider: 'gemini' });
  });

  it('sem argumentos, usa a diarização e o Claude', async () => {
    await (await geracao()).analisarViaClaude('p1');

    expect(Object.fromEntries(new URL(chamadas[0].url).searchParams)).toEqual({
      usar_diarizacao: 'true',
      provider: 'claude',
    });
  });

  it.each([
    ['gerarTrechosClaude', 'gerar-trechos'],
    ['gerarCenasClaude', 'gerar-cenas'],
    ['gerarMetadadosClaude', 'gerar-metadados'],
    ['gerarPromptThumbnailClaude', 'gerar-prompt-thumbnail'],
  ] as const)('%s chama a rota do corte com o provider', async (nome, rota) => {
    await (await geracao())[nome]('c1', 'gemini');

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`http://api.test/api/claude/corte/c1/${rota}?provider=gemini`);
  });
});
