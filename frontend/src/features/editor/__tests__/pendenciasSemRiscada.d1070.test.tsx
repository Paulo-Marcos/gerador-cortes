import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';

// D-1070: a cena riscada sai do vídeo, então o aviso dela não é pendência do corte. Antes
// a barra dizia "1 aviso de cena" enquanto o painel, ao lado, não pedia conferir nada.

const h = vi.hoisted(() => ({ avisos: [] as unknown[] }));

vi.mock('../useBruto', () => ({ useStatusBruto: () => ({ data: undefined }) }));
vi.mock('../useCortes', () => ({ useCorte: () => ({ dataUpdatedAt: 1 }) }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { avisos: h.avisos } }),
}));

const { PendenciasDoCorte } = await import('../PendenciasDoCorte');

const AVISO = { tipo: 'destaque_numerico', inicio: 9, codigo: 'sem_fonte', mensagem: 'Sem fonte.' };
const CENA = { tipo: 'destaque_numerico', inicio: 9, fim: 14, numero: '1489' };

const desenhar = (cenas_remotion: unknown) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <PendenciasDoCorte
        corte={{ id: 'c1', alertas_conferir: [], cenas_remotion, cenas_validadas: 1, youtube_video_id: '' } as unknown as Corte}
      />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.avisos = [AVISO];
});

describe('D-1070 · pendências sem as cenas riscadas', () => {
  it('o aviso da cena que vai ao vídeo segue contando (controle)', () => {
    expect(desenhar([CENA])).toContain('1 aviso de cena');
  });

  it('o aviso da cena riscada não conta', () => {
    expect(desenhar([{ ...CENA, riscada: true }])).not.toContain('aviso de cena');
  });

  it('também no envelope com cenas', () => {
    expect(desenhar({ formato: 'cortes', cenas: [{ ...CENA, riscada: true }] })).not.toContain('aviso de cena');
  });
});
