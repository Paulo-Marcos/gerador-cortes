import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte, MetadadoCorte } from '@/types/models';
import { MetadataCard, metadataKey } from '../MetadataCard';

function corte(): Corte {
  return {
    id: 'c1',
    projeto_id: 'p1',
    numero: 1,
    titulo_proposto: 'Corte 1',
    resumo: '',
    tema_central: '',
    inicio_hms: '00:00:00',
    fim_hms: '00:00:10',
    inicio_seg: 0,
    fim_seg: 10,
    desvios: [],
    status: 'aprovado',
    is_leitura: false,
    is_fire: false,
  } as unknown as Corte;
}

function metadado(overrides: Partial<MetadadoCorte> = {}): MetadadoCorte {
  return {
    id: 'm1',
    corte_id: 'c1',
    titulo_youtube: 'Um titulo gerado',
    descricao_youtube: 'Descricao',
    tags_youtube: ['tag'],
    opcoes_titulo: ['Primeira opcao', 'Segunda opcao'],
    opcoes_texto_capa: ['CAPA UM', 'CAPA DOIS'],
    texto_capa: 'CAPA UM',
    prompt_thumbnail: 'Um prompt de capa',
    thumbnail_path: 'thumbnails/thumb_c1.png',
    ...overrides,
  };
}

function render(meta: MetadadoCorte) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(metadataKey('c1'), meta);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter>
            <MetadataCard projetoId="p1" cut={corte()} variant="modal" />
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('MetadataCard — corpo do modal', () => {
  // D-413: a acao sumiu da tela no D-396, que a moveu para o OverflowMenu do
  // header do card — e o modal nao renderiza header nenhum.
  it('oferece copiar o prompt da capa', () => {
    expect(render(metadado())).toContain('Copiar prompt');
  });

  it('desabilita copiar o prompt enquanto ele nao foi gerado', () => {
    const semPrompt = render(metadado({ prompt_thumbnail: '' }));
    expect(semPrompt).toMatch(/disabled=""[^>]*>[^<]*<svg[^>]*>.*?Copiar prompt/s);
  });

  // D-413: acao de geracao nao pode voltar a ser mais um chip no meio das
  // sugestoes — pill = escolha de titulo/capa, retangulo = acao.
  it('mantem as acoes de geracao fora da faixa de sugestoes', () => {
    const markup = render(metadado());
    expect(markup).toContain('sugestões');
    // O chip antigo dizia "✦ regerar por IA" / "manual" em caixa baixa: a
    // regex tem de ser insensivel a caixa e ao ornamento para pegar a volta
    // da regressao, e nao so a grafia de hoje.
    expect(markup).not.toMatch(/rounded-full[^>]*>[\s✦]*(regerar|gerar|manual)/i);
    expect(markup).toMatch(/border-dashed/);
  });

  // D-555: a moldura entrou pelo ⋯ do header do card — que o modal nao
  // renderiza —, repetindo a falha que a D-413 corrigiu logo acima. Este teste
  // e a trava: a acao vive na fileira que opera a capa existente, nao no header.
  it('oferece aplicar a moldura na capa', () => {
    expect(render(metadado())).toContain('Aplicar moldura');
  });

  it('nao oferece aplicar moldura quando nao ha capa', () => {
    expect(render(metadado({ thumbnail_path: '' }))).not.toContain('Aplicar moldura');
  });

  it('mostra as sugestoes de titulo e de capa como chips', () => {
    const markup = render(metadado());
    expect(markup).toContain('Primeira opcao');
    expect(markup).toContain('CAPA DOIS');
  });
});
