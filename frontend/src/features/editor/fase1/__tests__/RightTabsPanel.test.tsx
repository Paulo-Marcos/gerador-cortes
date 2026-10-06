import { isValidElement, useState, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';

vi.mock('@/features/editor/useCortes', async () => {
  const actual = await vi.importActual<typeof import('@/features/editor/useCortes')>('@/features/editor/useCortes');
  return {
    ...actual,
    useCorte: () => ({ data: { projeto_id: 'p1' } }),
  };
});

vi.mock('@/features/diarizacao/useDiarizacao', async () => {
  const actual = await vi.importActual<typeof import('@/features/diarizacao/useDiarizacao')>(
    '@/features/diarizacao/useDiarizacao',
  );
  return {
    ...actual,
    useFalantes: () => ({ data: { falantes: {} } }),
    useDiarizarCorte: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

import { RightTabsPanel } from '../RightTabsPanel';
import type { Desvio } from '@/types/models';

const noop = vi.fn();

function baseProps(desvios: Desvio[] = []) {
  return {
    corteId: 'c1',
    desvios,
    selectedDesvioIdx: null,
    onSeek: noop,
    onAdicionarDesvio: noop,
    onRemoverDesvio: noop,
    onGerarManual: noop,
    onGerarTrechosIA: noop,
    pendingTrechos: {},
    transcricao: [],
    currentTime: 0,
    onAtualizarTranscricao: noop,
    transcricaoAtualizando: false,
  };
}

function render(desvios?: Desvio[]) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <TooltipProvider>
          <RightTabsPanel {...baseProps(desvios)} />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('RightTabsPanel — header', () => {
  it('mantém "Atualizar transcricao" no header e NÃO renderiza o rodapé "Mais ações"', () => {
    const html = render();

    expect(html).toContain('aria-label="Atualizar transcricao"');
    expect(html).not.toContain('Mais ações');
  });

  // D-871: a capa se decide em Metadados (que tem o mesmo editor — ver
  // MetadataCardModal.test); no editor ele empurrava as abas para baixo.
  it('não traz mais o "Influenciar a capa"', () => {
    expect(render()).not.toContain('Influenciar');
  });
});

// D-871 (canvas do Editor, nota 3 "Painel que cabe"): as quatro abas cabiam
// numa faixa rolável que deixava Transcrição e Avaliação fora da tela.
describe('RightTabsPanel — as quatro abas cabem (D-871)', () => {
  const desvios: Desvio[] = [
    { inicio_hms: '00:00:10', fim_hms: '00:00:14', motivo: 'repete', origem: 'claude', categoria: 'repeticao' },
    { inicio_hms: '00:00:20', fim_hms: '00:00:22', motivo: 'muleta', origem: 'manual' },
  ];
  const tablist = (html: string) =>
    html.match(/<div role="tablist" aria-label="Painel do corte"[^>]*>(.*?)<\/div>/)!;
  const abas = (html: string) => [...tablist(html)[1].matchAll(/<button[^>]*>([^<]*)<\/button>/g)];

  it('um seletor com as quatro, na ordem, e o contador no rótulo dos trechos', () => {
    const html = render(desvios);
    expect(abas(html).map((a) => a[1])).toEqual(['Trechos · 2', 'Ordem', 'Transcrição', 'Avaliação']);
    for (const [aba] of abas(html)) {
      expect(aba).toContain('role="tab"');
      expect(aba).toContain('white-space:nowrap');
    }
    // A ativa é a peça clara sobre o fundo do seletor; as outras, sem fundo.
    expect(abas(html)[0][0]).toContain('aria-selected="true"');
    expect(abas(html)[0][0]).toContain('background:var(--wb-bg-card)');
    expect(abas(html)[1][0]).toContain('aria-selected="false"');
    expect(abas(html)[1][0]).toContain('background:transparent');
  });

  it('não rolam para fora: sem espaço, quebram em outra fileira', () => {
    const html = render(desvios);
    expect(tablist(html)[0]).toContain('flex-wrap:wrap');
    expect(html).not.toContain('overflow-x-auto');
    // Uma aba sozinha mais larga que a coluna ainda encolhe, sem vazar.
    for (const [aba] of abas(html)) {
      expect(aba).toContain('max-width:100%');
      expect(aba).toContain('text-overflow:ellipsis');
    }
  });

  it('ter trechos a remover não é erro: nada de vermelho nas abas', () => {
    expect(tablist(render(desvios))[0]).not.toContain('err');
  });

  it('a IA dos trechos diz os dois provedores pelo nome, lado a lado', () => {
    const html = render();
    const grupo = html.match(/<div role="group" aria-label="Gerar trechos a remover".*?<\/div>/s)![0];
    expect(grupo).toMatch(/<span class="truncate">Claude<\/span>.*<span class="truncate">Gemini<\/span>/s);
  });

  it('o Manual continua no painel, como ícone', () => {
    expect(render()).toContain('aria-label="Importar trechos manualmente"');
  });

  it('o tempo que cada trecho tira sai em cinza, não em vermelho', () => {
    const tempo = render(desvios).match(/<span class="([^"]*)"[^>]*>−4\.0s<\/span>/)!;
    expect(tempo[1]).toContain('text-[var(--wb-text-mute)]');
    expect(tempo[1]).not.toContain('err');
  });
});

describe('RightTabsPanel — badge do trecho varia pelo motivo da remoção (D-422)', () => {
  const desviosDaIa: Desvio[] = [
    {
      inicio_hms: '00:27:57',
      fim_hms: '00:29:30',
      motivo: 'digressão sobre utilitarismo',
      origem: 'claude',
      categoria: 'tangente',
    },
    {
      inicio_hms: '00:37:10',
      fim_hms: '00:37:16',
      motivo: 'checagem com a audiência e repetição',
      origem: 'claude',
      categoria: 'repeticao',
    },
    {
      inicio_hms: '00:38:02',
      fim_hms: '00:38:09',
      motivo: 'Possível imprecisão — atribui a frase a Platão',
      origem: 'claude',
      categoria: 'imprecisao',
    },
  ];

  it('três trechos da MESMA origem (claude) rendem três badges distintos, sem "IA" genérico', () => {
    const html = render(desviosDaIa);

    expect(html).toContain('>tangente<');
    expect(html).toContain('>repeticao<');
    expect(html).toContain('>impreciso<');
    expect(html).not.toContain('>IA<');
  });

  it('o trecho impreciso avisa na mensagem, não só na cor do badge', () => {
    const html = render(desviosDaIa);

    expect(html).toContain('Possível imprecisão');
    expect(html).toContain('var(--wb-warn-soft)');
  });

  it('desvio legado sem categoria continua badgeado (fallback por motivo/origem)', () => {
    const html = render([
      { inicio_hms: '00:36:14', fim_hms: '00:36:23', motivo: 'Trecho manual', origem: 'manual' },
      {
        inicio_hms: '00:40:00',
        fim_hms: '00:40:05',
        motivo: 'Silêncio Detectado (IA/Técnico)',
        origem: 'tecnico',
      },
    ]);

    expect(html).toContain('>manual<');
    expect(html).toContain('>silencio<');
  });
});

// O vitest roda sem DOM: para clicar, a sonda chama o painel como função dentro
// de um render e aciona os onClick da árvore de elementos que ele devolve.
type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(el.props.children as ReactNode)];
}
// O esbuild pode sufixar o nome para evitar colisão ("TrechosList2").
const nomeDoTipo = (el: Elemento) =>
  (typeof el.type === 'function'
    ? el.type.name
    : typeof el.type === 'object'
      ? ((el.type as { type?: { name?: string } }).type?.name ?? '')
      : el.type
  ).replace(/\d+$/, '');
const PAINEIS = ['TrechosList', 'BlocosTab', 'TranscriptList', 'AvaliacaoBrutoPanel'];

function renderSonda(Sonda: () => null) {
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <TooltipProvider>
          <Sonda />
        </TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('RightTabsPanel — os controles fazem o que dizem (D-871)', () => {
  it.each([
    ['Trechos', 'TrechosList'],
    ['Ordem', 'BlocosTab'],
    ['Transcrição', 'TranscriptList'],
    ['Avaliação', 'AvaliacaoBrutoPanel'],
  ])('clicar em %s abre o painel dela e só ela fica ativa', (rotulo, painelEsperado) => {
    let ativas: string[] = [];
    let painel: string | undefined;
    function Sonda() {
      const [clicou, setClicou] = useState(false);
      const arvore = elementos(RightTabsPanel(baseProps()));
      const abas = arvore.filter((e) => nomeDoTipo(e) === 'TabButton');
      if (!clicou) {
        (abas.find((a) => a.props.label === rotulo)!.props.onClick as () => void)();
        setClicou(true);
      } else {
        ativas = abas.filter((a) => a.props.active).map((a) => a.props.label as string);
        painel = arvore.map(nomeDoTipo).find((n) => PAINEIS.includes(n as string)) as string;
      }
      return null;
    }
    renderSonda(Sonda);
    expect(ativas).toEqual([rotulo]);
    expect(painel).toBe(painelEsperado);
  });

  it('o ícone do Manual importa os trechos, e o Gerar chama a IA escolhida', () => {
    const gerarManual = vi.fn();
    const gerarIA = vi.fn();
    let arvore: Elemento[] = [];
    function Sonda() {
      const props = { ...baseProps(), onGerarManual: gerarManual, onGerarTrechosIA: gerarIA };
      const lista = elementos(RightTabsPanel(props)).find((e) => nomeDoTipo(e) === 'TrechosList')!;
      arvore = elementos((lista.type as unknown as { type: (p: unknown) => ReactNode }).type(lista.props));
      return null;
    }
    renderSonda(Sonda);
    (arvore.find((e) => e.props['aria-label'] === 'Importar trechos manualmente')!.props.onClick as () => void)();
    expect(gerarManual).toHaveBeenCalledOnce();
    (arvore.find((e) => nomeDoTipo(e) === 'AcaoDeIa')!.props.onGerar as (p: string) => void)('gemini');
    expect(gerarIA).toHaveBeenCalledWith('gemini');
  });
});
