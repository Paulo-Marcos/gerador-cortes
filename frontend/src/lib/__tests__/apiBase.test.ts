import { afterEach, describe, expect, it, vi } from 'vitest';

async function carregar(valor: string | undefined) {
  vi.resetModules();
  vi.stubEnv('VITE_API_URL', valor ?? '');
  return import('../apiBase');
}

describe('apiBase', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('usa a URL configurada e deriva raiz e /videos dela', async () => {
    const m = await carregar('http://localhost:8001/api');
    expect(m.API_BASE).toBe('http://localhost:8001/api');
    expect(m.ORIGEM_API).toBe('http://localhost:8001');
    expect(m.VIDEOS_BASE).toBe('http://localhost:8001/videos');
  });

  it('sem configuração não cai na porta da produção: base relativa', async () => {
    const m = await carregar(undefined);
    expect(m.API_BASE).toBe('/api');
    expect(m.ORIGEM_API).toBe('');
    expect(m.VIDEOS_BASE).toBe('/videos');
    expect(m.API_BASE).not.toContain('8000');
  });

  it('WebSocket troca http por ws e https por wss na base absoluta', async () => {
    const m = await carregar('http://localhost:8001/api');
    expect(m.wsUrl('/projetos/p1/ws')).toBe('ws://localhost:8001/api/projetos/p1/ws');
    expect(m.wsUrl('/x', 'https://exemplo.com/api')).toBe('wss://exemplo.com/api/x');
  });

  it('WebSocket com base relativa usa a origem da página', async () => {
    vi.stubGlobal('window', { location: { protocol: 'https:', host: 'app.exemplo:4300' } });
    try {
      const m = await carregar(undefined);
      expect(m.wsUrl('/projetos/p1/ws')).toBe('wss://app.exemplo:4300/api/projetos/p1/ws');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
