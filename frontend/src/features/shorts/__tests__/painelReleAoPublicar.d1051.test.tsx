import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { ShortSugerido } from '../shortsApi';

// D-1051: o painel de publicar é quem relê o cartão e a trilha depois de subir.

const h = vi.hoisted(() => ({ publicar: vi.fn() }));

vi.mock('../useLotePublicacao', async (original) => ({
  ...(await original<typeof import('../useLotePublicacao')>()),
  usePublicarEAtualizar: (corteId: string) => {
    h.publicar(corteId);
    return { mutate: vi.fn(), isPending: false, isSuccess: false, isError: false };
  },
}));

const { PainelPublicacao } = await import('../PainelPublicacao');

describe('D-1051 · o painel de publicar', () => {
  it('publica pelo gesto que relê, no corte dele', () => {
    const short = { id: 's1', titulo: 'Short', status: 'renderizado' } as unknown as ShortSugerido;
    const qc = new QueryClient({ defaultOptions: { queries: { enabled: false, retry: false } } });
    renderToStaticMarkup(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <TooltipProvider>
            <PainelPublicacao short={short} corteId="c9" onEscreverPost={vi.fn()} onEscolherCapa={vi.fn()} />
          </TooltipProvider>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(h.publicar).toHaveBeenCalledWith('c9');
  });
});
