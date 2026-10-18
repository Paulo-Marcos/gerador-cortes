import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte, MetadadoCorte } from '@/types/models';
import { MetadataCard } from '../MetadataCard';
import { metadataKey } from '../useMetadataCard';

// D-968 (pr-audit do #235): a capa do TikTok tinha o mesmo contador da do
// YouTube — zerava ao reabrir o modal ou trocar de aba, e voltava a capa velha.

const corte = { id: 'c1', projeto_id: 'p1', numero: 1, titulo_proposto: 'Corte 1' } as unknown as Corte;

const metadado = {
  id: 'm1',
  corte_id: 'c1',
  is_fire: false,
  titulo_youtube: 'Um titulo gerado',
  descricao_youtube: '',
  tags_youtube: [],
  opcoes_titulo: [],
  opcoes_texto_capa: [],
  texto_capa: 'CAPA',
  prompt_thumbnail: 'Um prompt de capa',
  thumbnail_path: 'thumbnails/thumb_c1.png',
  thumbnail_tiktok_path: 'thumbnails/capa_tiktok_c1.png',
} as MetadadoCorte;

function montarCartao(lidoEm: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(metadataKey('c1'), metadado, { updatedAt: lidoEm });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <MetadataCard projetoId="p1" cut={corte} variant="card" active />
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('capa do TikTok ao reabrir (D-968)', () => {
  it('a URL da capa vertical leva a hora da leitura do metadado', () => {
    expect(montarCartao(1_000)).toContain('capa_tiktok_c1.png?v=1000');
    expect(montarCartao(2_000)).toContain('capa_tiktok_c1.png?v=2000');
  });
});
