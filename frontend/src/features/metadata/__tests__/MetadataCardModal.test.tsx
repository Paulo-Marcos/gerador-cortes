import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Corte, MetadadoCorte } from '@/types/models';
import { MetadataCard } from '../MetadataCard';
import { metadataKey } from '../useMetadataCard';
import { ModalChip } from '../modalPecas';

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
    is_fire: false,
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
  qc.setQueryData(['capa-chatgpt', 'configuracao'], {
    projeto_url: 'https://chatgpt.com/g/g-p-6aa2f1d08414819192ac821e77ded48e/project',
    fichas: [],
    maximo_de_fichas: 10,
  });
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

  // D-556: conferir a moldura exige ver a capa grande. O clique na imagem deixou
  // de copiar o caminho — que continua no icone de pasta e no ... — e passou a
  // ampliar, que e o que alguem espera ao clicar numa imagem.
  it('oferece ampliar a capa ao clicar nela', () => {
    expect(render(metadado())).toContain('Ampliar a capa');
  });

  // D-609: regerar os metadados e o prompt da capa oferecem os dois provedores
  // na MESMA acao — antes o modal so chamava o Claude, sem escolha.
  it('regera os metadados com o Claude ou com o Gemini', () => {
    const markup = render(metadado());
    expect(markup).toContain('aria-label="Regerar metadados com o Claude"');
    expect(markup).toContain('aria-label="Regerar metadados com o Gemini"');
  });

  it('regera o prompt da capa com o Claude ou com o Gemini', () => {
    const markup = render(metadado());
    expect(markup).toContain('aria-label="Regerar prompt da capa com o Claude"');
    expect(markup).toContain('aria-label="Regerar prompt da capa com o Gemini"');
  });

  it('sem prompt ainda, a acao diz gerar e nao regerar', () => {
    const markup = render(metadado({ prompt_thumbnail: '' }));
    expect(markup).toContain('aria-label="Gerar prompt da capa com o Gemini"');
  });

  // D-821: sugestao e para quando o titulo ficou ruim, nao para toda vez —
  // recolhidas, dizem quantas ha e nao ocupam a tela.
  it('comeca com as sugestoes recolhidas, dizendo quantas ha', () => {
    const markup = render(metadado());
    expect(markup).not.toContain('Primeira opcao');
    expect(markup).not.toContain('CAPA DOIS');
    expect(markup).toContain('sugestões (2)');
  });

  // D-821: a D-804 pos o botao so na variante card; o modal ficou sem ele.
  it('oferece gerar a capa do YouTube no ChatGPT', () => {
    expect(render(metadado())).toContain('imagem 16:9');
  });

  // D-821: cada capa numa aba, com as acoes ao lado da propria imagem — antes
  // o bloco do TikTok separava a capa do YouTube dos botoes dela.
  it('separa as capas em abas, com a do YouTube aberta', () => {
    const markup = render(metadado());
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>[^<]*YouTube/);
    expect(markup).toMatch(/role="tab"[^>]*aria-selected="false"[^>]*>[^<]*TikTok/);
  });
});

describe('ModalChip', () => {
  // D-821: o escolhido usava texto branco fixo sobre o acento do tema; num tema
  // de acento escuro com texto herdado escuro, a opcao ficava ilegivel.
  it('usa a cor de texto que o tema define para o acento', () => {
    const html = renderToStaticMarkup(
      <ModalChip active onClick={() => undefined}>
        opcao
      </ModalChip>,
    );
    expect(html).toContain('text-[var(--wb-accent-fg)]');
    expect(html).not.toContain('text-white');
  });
});
