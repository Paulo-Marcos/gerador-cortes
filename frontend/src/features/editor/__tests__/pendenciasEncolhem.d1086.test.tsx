import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';

// D-1086: a barra de ações é uma fileira só. Sem largura, a lista de pendências encolhe
// com reticências em vez de empurrar o botão principal para uma segunda fileira; o
// texto inteiro fica no hover (D-1044).

vi.mock('../useBruto', () => ({ useStatusBruto: () => ({ data: { bruto_defasado: true } }) }));
vi.mock('../useCortes', () => ({ useCorte: () => ({ dataUpdatedAt: 1 }) }));
vi.mock('@tanstack/react-query', async (original) => ({
  ...(await original<typeof import('@tanstack/react-query')>()),
  useQuery: () => ({ data: { avisos: [] } }),
}));

const { PendenciasDoCorte } = await import('../PendenciasDoCorte');

const corte = {
  id: 'c1',
  alertas_conferir: [],
  cenas_remotion: [{ tipo: 'enfase', inicio: 0, fim: 2 }],
  cenas_validadas: 0,
  youtube_video_id: '',
} as unknown as Corte;

const html = renderToStaticMarkup(
  <QueryClientProvider client={new QueryClient()}>
    <PendenciasDoCorte corte={corte} />
  </QueryClientProvider>,
);

describe('D-1086 · as pendências cedem largura na barra', () => {
  it('o bloco encolhe (min-width 0, flex 0 1 auto)', () => {
    const raiz = html.match(/^<span[^>]*>/)?.[0] ?? '';
    expect(raiz).toContain('min-width:0');
    expect(raiz).toContain('flex:0 1 auto');
  });

  it('o texto vira reticências numa linha; o inteiro fica no hover', () => {
    const texto = 'os trechos mudaram depois do bruto, cenas por validar';
    expect(html).toContain(`title="Em aberto, sem bloquear: ${texto}"`);
    expect(html).toMatch(new RegExp(`<span style="[^"]*text-overflow:ellipsis;white-space:nowrap[^"]*">${texto}</span>`));
  });
});
