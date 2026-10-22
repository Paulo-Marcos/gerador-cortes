import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { ContaDoDestino } from '../api';
import { CHAVE_CONTAS_DOS_DESTINOS, ContasDosDestinos, descreverConta } from '../ContasDosDestinos';

// D-980 (RN-31): a conta aprendida de cada destino, e o "Esquecer".

const linha = (parcial: Partial<ContaDoDestino>): ContaDoDestino => ({
  destino: 'tiktok',
  rotulo: 'TikTok',
  conta_id: '',
  nome: '',
  gravada_em: '',
  ...parcial,
});

function renderizar(contas?: ContaDoDestino[]) {
  const qc = new QueryClient();
  if (contas) qc.setQueryData(CHAVE_CONTAS_DOS_DESTINOS, contas);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ContasDosDestinos />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('descreverConta', () => {
  it('sem conta gravada, avisa que aprende no próximo envio', () => {
    expect(descreverConta(linha({}))).toBe('Aprende no próximo envio');
  });

  it('mostra o nome e o id da conta aprendida', () => {
    expect(descreverConta(linha({ conta_id: '71', nome: '@ateuinforma' }))).toBe(
      '@ateuinforma · 71',
    );
  });

  it('sem nome (Instagram pelo navegador), mostra só o número', () => {
    expect(descreverConta(linha({ conta_id: '3524' }))).toBe('Conta 3524');
  });
});

describe('ContasDosDestinos', () => {
  it('lista cada destino e só oferece Esquecer onde há conta gravada', () => {
    const html = renderizar([
      linha({ destino: 'youtube', rotulo: 'YouTube', conta_id: 'UC1', nome: 'Canal A' }),
      linha({}),
    ]);

    expect(html).toContain('YouTube');
    expect(html).toContain('Canal A · UC1');
    expect(html).toContain('Aprende no próximo envio');
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toContain('>Esquecer</button>');
  });

  it('explica que a conta diferente barra o envio', () => {
    expect(renderizar([])).toContain('diferente da daqui, ele não publica');
  });
});

describe('settingsApi das contas', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('esquecer apaga a conta do destino pelo caminho dele', async () => {
    const chamadas: Request[] = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        chamadas.push(pedido);
        return new Response('[]', { status: 200 });
      }),
    );
    const { settingsApi } = await import('../api');

    await settingsApi.esquecerContaDoDestino('instagram_web');
    await settingsApi.listarContasDosDestinos();

    expect(chamadas.map((c) => [c.method, c.url])).toEqual([
      ['DELETE', 'http://api.test/api/channels/ativo/contas-dos-destinos/instagram_web'],
      ['GET', 'http://api.test/api/channels/ativo/contas-dos-destinos'],
    ]);
  });
});
