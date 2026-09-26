import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '../statusExport';

// D-722: o caminho da publicação saiu de lib/api.ts para a feature, sobre o
// cliente gerado; e o status do corte sem linha no backend ganhou um lugar só.

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

const publicacao = async () => (await import('../api')).publicacaoApi;

describe('publicacaoApi sobre o cliente gerado', () => {
  it('lê o status de exportação do projeto', async () => {
    await (await publicacao()).exportStatus('p1');

    expect(chamadas[0].url).toBe('http://api.test/api/export/projeto/p1/status');
  });

  it.each([
    [
      'upload para o YouTube',
      async () => (await publicacao()).uploadYouTube('c1', { scheduled_at: null }),
      '/api/export/corte/c1/youtube',
      { scheduled_at: null },
    ],
    [
      'marcar publicado',
      async () =>
        (await publicacao()).marcarPublicadoYouTube('c1', { youtube_url: 'https://youtu.be/x' }),
      '/api/export/corte/c1/youtube/marcar-publicado',
      { youtube_url: 'https://youtu.be/x' },
    ],
    [
      'liberar a publicação',
      async () => (await publicacao()).liberarPublicacao('c1', { destino: 'youtube' }),
      '/api/export/corte/c1/publicacao/liberar',
      { destino: 'youtube' },
    ],
  ])('%s vai por POST com o corpo', async (_nome, chamar, caminho, corpo) => {
    await chamar();

    expect(chamadas[0].method).toBe('POST');
    expect(chamadas[0].url).toBe(`http://api.test${caminho}`);
    expect(await chamadas[0].json()).toEqual(corpo);
  });

  it('a publicação em massa manda a agenda pedida', async () => {
    const corpo = {
      corte_ids: ['c1', 'c2'],
      agendar: false,
      videos_por_dia: 3,
      hora_publicacao: '15:00',
      scheduled_dates: [null, null],
    };

    await (await publicacao()).bulkYoutube('p1', corpo);

    expect(chamadas[0].url).toBe('http://api.test/api/export/projeto/p1/bulk-youtube');
    expect(await chamadas[0].json()).toEqual(corpo);
  });
});

describe('statusExportPendente', () => {
  it('um corte zerado: nada pronto, metadado ausente é null, marca é vazia', () => {
    expect(statusExportPendente({ corte_id: 'c1', numero: 1, titulo: 'T' })).toMatchObject({
      raw_pronto: false,
      video_pronto: false,
      pronto_publicar: false,
      titulo_youtube: null,
      youtube_url_publicado: '',
      tiktok_publicado_em: '',
    });
  });

  it('o que o chamador sabe vale por cima dos padrões', () => {
    const status = statusExportPendente({ corte_id: 'c1', numero: 1, titulo: null, raw_pronto: true });

    expect(status.raw_pronto).toBe(true);
    expect(status.titulo).toBeNull();
  });
});
