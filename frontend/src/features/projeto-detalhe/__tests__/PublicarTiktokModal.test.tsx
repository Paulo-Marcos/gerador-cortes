import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StatusExportCorte } from '@/types/models';

// D-834: o "publicar sozinho" saiu do lote e subiu para o modal — vale para o
// lote e para o botão Assistido de cada corte, e chega ao backend no pedido.

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

const shortsApi = async () => (await import('@/features/shorts/shortsApi')).shortsApi;

describe('assistido do corte no TikTok', () => {
  it('manda o "publicar sozinho" que o modal escolheu', async () => {
    await (await shortsApi()).assistidoTiktokHorizontal('c1', {
      agendarPara: '2026-10-01T19:00',
      publicarSozinho: true,
    });

    expect(chamadas[0].url).toBe(
      'http://api.test/api/shorts/corte/c1/publicar/tiktok-horizontal/assistido',
    );
    expect(await chamadas[0].json()).toEqual({
      agendar_para: '2026-10-01T19:00',
      publicar_sozinho: true,
    });
  });

  it('sem escolha, para antes de publicar como sempre', async () => {
    await (await shortsApi()).assistidoTiktokHorizontal('c1');

    expect(await chamadas[0].json()).toEqual({ agendar_para: '', publicar_sozinho: false });
  });
});

describe('PublicarTiktokModal', () => {
  it('mostra o interruptor uma vez, para o lote e para cada corte', async () => {
    const { PublicarTiktokModal } = await import('../PublicarTiktokModal');
    const corte = { corte_id: 'c1', numero: 1, titulo: 'Um corte' } as StatusExportCorte;

    const html = renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <PublicarTiktokModal open onClose={() => {}} projetoId="p1" cortes={[corte]} />
      </QueryClientProvider>,
    );

    expect(html.match(/Publicar sozinho — o robô aperta Publicar/g)).toHaveLength(1);
    expect(html).toContain('Vale para o lote e para o botão Assistido de cada corte');
  });
});
