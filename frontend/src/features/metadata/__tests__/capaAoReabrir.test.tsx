import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte, MetadadoCorte } from '@/types/models';
import { MetadataCard } from '../MetadataCard';
import { metadataKey } from '../useMetadataCard';

// D-968: a capa nova se grava por cima do MESMO arquivo, e o navegador guarda
// a imagem pela URL. A versão que fura esse cache morava no estado do card:
// fechar o modal e reabrir zerava a versão, a URL voltava a ser a de antes e a
// tela mostrava a capa velha. Agora a versão é a hora da leitura do metadado —
// toda montagem nova relê o metadado e, com ele, a imagem.

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
} as MetadadoCorte;

function montar(lidoEm: number) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(metadataKey('c1'), metadado, { updatedAt: lidoEm });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <MetadataCard projetoId="p1" cut={corte} variant="modal" />
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('capa ao reabrir o modal (D-968)', () => {
  it('a URL da capa leva a hora da leitura do metadado, não um contador do card', () => {
    expect(montar(1_700_000_000_000)).toContain('thumb_c1.png?v=1700000000000');
  });

  it('cada leitura nova pede a imagem de novo', () => {
    const antes = montar(1_000);
    const depois = montar(2_000);
    expect(antes).toContain('thumb_c1.png?v=1000');
    expect(depois).toContain('thumb_c1.png?v=2000');
  });
});
