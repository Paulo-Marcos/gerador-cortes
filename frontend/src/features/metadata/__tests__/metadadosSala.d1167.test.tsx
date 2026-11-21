import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { esperarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';
import type { Corte, MetadadoCorte } from '@/types/models';
import { ActionBar } from '@/upgrade/ActionBar';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { ComoApareceNoYouTube } from '../ComoApareceNoYouTube';
import { MaisDaCapa } from '../MaisDaCapa';
import { TextosDoCorte } from '../TextosDoCorte';
import type { EstadoDoCard } from '../useMetadataCard';
import { contarCapitulos, resumoDosTextos, separarTags } from '../resumoDosTextos';
import { metadataKey } from '../useMetadataCard';

// D-1167 (E-069 H-19; DIRECAO §5, §7.5): a tela de Metadados na Sala escura. O que se prova é o
// aceite: UMA primária (a régua `esperarPrimarios`, que conta o `primario` e exige que esteja
// aceso), o menu "Mais" em dois grupos, a prévia "Como aparece no YouTube", e nada de vidro nem
// de `style` de aparência — a tela tem campo de texto, e quem digita não pode ver o quadro tremer.

const h = vi.hoisted(() => ({ cortes: [] as unknown[], prontos: [] as unknown[], chrome: undefined as unknown }));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: unknown) => {
    h.chrome = chrome;
  },
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useCortesProjeto: () => ({ data: h.cortes, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', async (original) => ({
  ...(await original<typeof import('@/features/projeto-detalhe/useProjetoDetalhe')>()),
  useProjeto: () => ({ data: { id: 'p1', titulo_live: 'Pedro e a Igreja', youtube_url: '' } }),
  useExportStatus: () => ({ data: { cortes: h.prontos } }),
}));
vi.mock('@/features/channels/useChannels', () => ({
  useCanais: () => ({ data: { canais: [{ id: 'k1', nome: 'Canal do Teste', ativo: true }] } }),
}));
vi.mock('@/features/projeto-detalhe/PublicarMassaModal', () => ({ PublicarMassaModal: () => null }));

const { MetadataPage } = await import('../MetadataPage');

afterEach(() => {
  h.cortes = [];
  h.prontos = [];
  h.chrome = undefined;
});

const corte = (id: string, numero: number): Corte =>
  ({
    id,
    projeto_id: 'p1',
    numero,
    status: 'aprovado',
    titulo_proposto: `Corte ${numero}`,
    inicio_hms: '00:00:00',
    is_leitura: false,
    is_fire: false,
  }) as unknown as Corte;

const metadado = (extra: Partial<MetadadoCorte> = {}): MetadadoCorte =>
  ({
    id: 'm1',
    corte_id: 'c1',
    is_fire: false,
    titulo_youtube: 'Um título gerado para o corte',
    descricao_youtube: '0:00 Abertura\n1:10 Primeiro ponto\n4:30 Segundo ponto\nTexto.',
    tags_youtube: ['fé', 'história'],
    opcoes_titulo: ['Primeira opção'],
    opcoes_texto_capa: ['CAPA UM'],
    texto_capa: 'CAPA UM',
    prompt_thumbnail: 'Um prompt de capa',
    thumbnail_path: 'thumbnails/thumb_c1.png',
    thumbnail_tiktok_path: 'thumbnails/capa_tiktok_c1.png',
    ...extra,
  }) as MetadadoCorte;

function tela(meta: MetadadoCorte = metadado()): string {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(metadataKey('c1'), meta);
  qc.setQueryData(['capa-chatgpt', 'configuracao'], { projeto_url: 'https://chatgpt.com/g/x/project', fichas: [], maximo_de_fichas: 10 });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={['/projetos/p1/metadados?corte=c1']}>
            <Routes>
              <Route path="/projetos/:id/metadados" element={<MetadataPage />} />
            </Routes>
          </MemoryRouter>
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const barra = () => renderToStaticMarkup(<ActionBar barra={(h.chrome as Chrome).barra!} />);
const prontoParaPublicar = (corteId: string) => ({ corte_id: corteId, pronto_publicar: true, youtube_url_publicado: null });

describe('D-1167 · a única primária de Metadados (§5)', () => {
  it('com corte pronto, a tela tem UMA primária e ela está acesa: "Publicar 1 corte"', () => {
    h.cortes = [corte('c1', 1), corte('c2', 2)];
    h.prontos = [prontoParaPublicar('c1')];
    const html = tela() + barra();
    esperarPrimarios(html, 'Metadados');
    expect(barra()).toContain('Publicar 1 corte');
  });

  it('sem nada pronto, a primária continua uma só, apagada por decisão da tela', () => {
    h.cortes = [corte('c1', 1)];
    h.prontos = [];
    esperarPrimarios(tela() + barra(), 'Metadados', { primarioDesabilitado: true });
    expect(barra()).toContain('Nada pronto para publicar');
  });

  it('o conteúdo da tela, sozinho, não traz primária: o "Salvar", o ChatGPT e o "Mais" são secundários', () => {
    h.cortes = [corte('c1', 1)];
    expect(tela()).not.toMatch(/data-variant="(?:primario|primary)"/);
  });
});

describe('D-1167 · o formulário e as capas (§7.5)', () => {
  it('mostra só o corte aberto, com o título num campo de 40 px ligado ao rótulo', () => {
    h.cortes = [corte('c1', 1), corte('c2', 2)];
    const html = tela();
    expect(html).toContain('aria-label="Metadados do corte 1"');
    expect(html).not.toContain('aria-label="Metadados do corte 2"');
    const id = html.match(/<label for="([^"]+)"[^>]*>Título do YouTube<\/label>/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toMatch(new RegExp(`<input[^>]*id="${id}"[^>]*data-sala=""|<input[^>]*data-sala=""[^>]*id="${id}"`));
  });

  it('"Como aparece no YouTube" traz a capa, o título e o canal ativo', () => {
    h.cortes = [corte('c1', 1)];
    const html = tela();
    expect(html).toContain('aria-label="Como aparece no YouTube"');
    expect(html).toContain('Canal do Teste');
    expect(html).toMatch(/aria-label="Como aparece no YouTube"[\s\S]*thumb_c1\.png/);
  });

  it('as duas capas ficam à vista, sem abas, e a do TikTok leva os três botões: ChatGPT, Subir arte e Mais', () => {
    h.cortes = [corte('c1', 1)];
    const html = tela();
    expect(html).toContain('aria-label="Capa do YouTube"');
    expect(html).toContain('aria-label="Capa do TikTok"');
    expect(html).not.toContain('role="tab"');
    const tiktok = html.slice(html.indexOf('aria-label="Capa do TikTok"'));
    expect(tiktok).toContain('Gerar no ChatGPT');
    expect(tiktok).toContain('Subir arte');
    expect(tiktok).toContain('aria-label="Mais da capa do TikTok"');
  });

  it('nada de vidro nem de `style` de aparência: só variáveis CSS de geometria', () => {
    h.cortes = [corte('c1', 1)];
    const html = tela();
    expect(html).not.toMatch(/backdrop-filter|backdrop-blur/);
    // Todo `style=""` que a tela emite é variável (`--p`), nunca cor, tamanho ou posição. A
    // exceção é o `flex-shrink:0` que o Icon compartilhado grava em todo glifo (D-854).
    for (const [, estilo] of html.matchAll(/style="([^"]*)"/g)) expect(estilo).toMatch(/^(?:--|flex-shrink:0$)/);
  });
});

describe('D-1167 · o menu "Mais" em dois grupos (§7.5)', () => {
  const grupos = [
    {
      rotulo: 'Arte' as const,
      itens: [
        { icone: 'clipboard' as const, rotulo: 'Colar arte', onSelect: vi.fn() },
        { icone: 'refresh-cw' as const, rotulo: 'Atualizar texto', desligado: true, dica: 'Ainda não há capa para atualizar.', onSelect: vi.fn() },
      ],
    },
    {
      rotulo: 'Prompt' as const,
      itens: [{ icone: 'copy' as const, rotulo: 'Copiar', onSelect: vi.fn() }],
    },
  ];
  const html = renderToStaticMarkup(<MaisDaCapa rotulo="Mais da capa" grupos={grupos} aberto />);

  it('abre com os grupos Arte e Prompt, nessa ordem, cada um com o seu rótulo', () => {
    const arte = html.indexOf('>Arte<');
    const prompt = html.indexOf('>Prompt<');
    expect(arte).toBeGreaterThan(-1);
    expect(prompt).toBeGreaterThan(arte);
    expect(html.indexOf('Colar arte')).toBeLessThan(prompt);
    expect(html.indexOf('Copiar')).toBeGreaterThan(prompt);
    expect(html.match(/role="group"/g)).toHaveLength(2);
  });

  it('o item sem como rodar fica desligado por aria-disabled, no teclado, com o porquê no title', () => {
    expect(html).toMatch(/aria-disabled="true"[^>]*title="Ainda não há capa para atualizar\."|title="Ainda não há capa para atualizar\."[^>]*aria-disabled="true"/);
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });

  it('o gatilho é secundário, com nome acessível', () => {
    const fechado = renderToStaticMarkup(<MaisDaCapa rotulo="Mais da capa" grupos={grupos} />);
    expect(fechado).toContain('aria-label="Mais da capa"');
    expect(fechado).toContain('data-variant="secundario"');
  });
});

describe('D-1167 · as regras puras do bloco de textos e da prévia', () => {
  it('capítulo é a linha da descrição que começa por tempo; o YouTube só os lê a partir de três', () => {
    expect(contarCapitulos('0:00 A\n1:10 B\nTexto\n1:02:03 C')).toBe(3);
    expect(contarCapitulos('Sem tempo nenhum')).toBe(0);
    const [descricao, capitulos, tags] = resumoDosTextos('0:00 A\n1:10 B', '');
    expect(descricao.preenchida).toBe(true);
    expect(capitulos.preenchida).toBe(false);
    expect(tags.preenchida).toBe(false);
  });

  it('separa as tags por vírgula, sem vazias', () => {
    expect(separarTags(' fé, ,história ,')).toEqual(['fé', 'história']);
  });

  it('a prévia avisa quando o título passa do que a lista do YouTube mostra', () => {
    const curto = renderToStaticMarkup(<ComoApareceNoYouTube titulo="Curto" canal="Canal" />);
    const longo = renderToStaticMarkup(<ComoApareceNoYouTube titulo={'x'.repeat(80)} canal="Canal" />);
    expect(curto).not.toContain('corta perto dos');
    expect(longo).toContain('corta perto dos 70 caracteres');
    expect(renderToStaticMarkup(<ComoApareceNoYouTube titulo="" />)).toContain('O título aparece aqui.');
  });
});

describe('D-1167 · o bloco "Descrição, capítulos e tags" (§7.5)', () => {
  // O rascunho dos campos nasce num efeito, que a renderização em servidor não roda: o corpo
  // do bloco se prova com o estado do card na mão, como o hook o entrega.
  const estado = (extra: Record<string, unknown>) =>
    ({
      title: 'Um título',
      coverText: 'CAPA',
      description: '0:00 A\n1:10 B\n2:20 C',
      tagsText: '',
      showDescription: false,
      showTitleSuggestions: false,
      showThumbSuggestions: false,
      titleSuggestions: [],
      thumbSuggestions: [],
      rotuloIa: 'Regerar metadados',
      metadadosEmVoo: null,
      save: vi.fn(),
      ...extra,
    }) as unknown as EstadoDoCard;
  const form = (extra: Record<string, unknown>) =>
    renderToStaticMarkup(
      <TooltipProvider>
        <TextosDoCorte card={estado(extra)} cut={corte('c1', 1)} />
      </TooltipProvider>,
    );

  it('fechado, diz o que está preenchido e o que falta, e não mostra os campos', () => {
    const html = form({});
    expect(html).toContain('Descrição preenchida');
    expect(html).toContain('Capítulos preenchida');
    expect(html).toContain('Tags falta');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('os capítulos são as linhas com tempo');
  });

  it('aberto, mostra a descrição e as tags para editar', () => {
    const html = form({ showDescription: true });
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('os capítulos são as linhas com tempo');
    expect(html).toContain('Tags (SEO oculto');
  });

  it('o contador do título passa a erro acima de 100, e o "gerar de novo" está na linha do rótulo', () => {
    const longo = form({ title: 'x'.repeat(101) });
    expect(longo).toContain('101/100');
    expect(longo).toMatch(/class="num ml-auto text-erro"[^>]*>101\/100/);
    expect(form({})).toMatch(/Título do YouTube<\/label>[\s\S]*Regerar metadados/);
  });
});
