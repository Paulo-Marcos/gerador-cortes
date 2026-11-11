import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';
import type { Desvio } from '@/types/models';

vi.mock('@/features/editor/useCortes', async () => {
  const actual = await vi.importActual<typeof import('@/features/editor/useCortes')>('@/features/editor/useCortes');
  return { ...actual, useCorte: () => ({ data: { projeto_id: 'p1', trechos_da_ultima_rodada: 1, inicio_seg: 0, fim_seg: 1211 } }) };
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

const { RightTabsPanel } = await import('../RightTabsPanel');
const { TrechosList } = await import('../TrechosList');
type TrechosListProps = import('../TrechosList').TrechosListProps;

// D-1089 (E6, P10): a aba "Trechos" virou "Decisões", e a pergunta 2 é a dos desvios.

const noop = vi.fn();
// 16:45 → 18:41, como a rodada 2 do Claude deu.
const DA_IA: Desvio = {
  inicio_hms: '00:16:45.000',
  fim_hms: '00:18:41.000',
  motivo: 'Crítica pessoal às credenciais',
  origem: 'claude',
  categoria: 'tangente',
  rodada: 2,
  borda_da_rodada: [1005, 1121],
};
// Da mesma rodada, com o fim arrastado de 18:50 para 18:56.
const AJUSTADA: Desvio = {
  inicio_hms: '00:18:41.000',
  fim_hms: '00:18:56.000',
  motivo: 'Reação a um comentário do chat',
  origem: 'claude',
  categoria: 'chat',
  rodada: 2,
  borda_da_rodada: [1121, 1130],
};
const A_MAO: Desvio = { inicio_hms: '00:19:10.000', fim_hms: '00:19:12.000', motivo: 'muleta', origem: 'manual' };

function envolver(no: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <TooltipProvider>{no}</TooltipProvider>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

function painel(props: Record<string, unknown> = {}) {
  return {
    corteId: 'c1',
    desvios: [DA_IA, AJUSTADA],
    selectedDesvioIdx: null,
    onSeek: noop,
    onGerarManual: noop,
    onGerarTrechosIA: noop,
    pendingTrechos: {},
    transcricao: [],
    currentTime: 0,
    onAtualizarTranscricao: noop,
    transcricaoAtualizando: false,
    ...props,
  } as Parameters<typeof RightTabsPanel>[0];
}

function lista(props: Partial<TrechosListProps> = {}) {
  return envolver(
    <TrechosList
      desvios={[]}
      selectedDesvioIdx={null}
      onSeek={noop}
      onRemoverDesvio={noop}
      onGerarManual={noop}
      onGerarTrechosIA={noop}
      pending={{}}
      {...props}
    />,
  );
}

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(el.props.children as ReactNode)];
}
const nome = (el: Elemento) =>
  (typeof el.type === 'function'
    ? el.type.name
    : typeof el.type === 'object'
      ? ((el.type as { type?: { name?: string } }).type?.name ?? '')
      : String(el.type)
  ).replace(/\d+$/, '');

/** A árvore que a lista devolve, sem renderizar: para achar os botões e clicar. */
function arvoreDaLista(props: Partial<TrechosListProps>): Elemento[] {
  const Lista = TrechosList as unknown as { type: (p: unknown) => ReactNode };
  let arvore: Elemento[] = [];
  function Sonda() {
    arvore = elementos(
      Lista.type({ desvios: [], selectedDesvioIdx: null, pending: {}, onSeek: noop, onRemoverDesvio: noop, onGerarManual: noop, onGerarTrechosIA: noop, ...props }),
    );
    return null;
  }
  renderToStaticMarkup(<Sonda />);
  return arvore;
}

describe('a moldura da aba Decisões', () => {
  it('abre na aba Decisões, antes de Ordem, Transcrição e Avaliação', () => {
    const html = envolver(<RightTabsPanel {...painel()} />);
    const abas = [...html.matchAll(/<button[^>]*role="tab"[^>]*aria-selected="(\w+)"[^>]*>([^<]*)<\/button>/g)];

    expect(abas.map((a) => a[2])).toEqual(['Decisões', 'Ordem', 'Transcrição', 'Avaliação']);
    expect(abas[0][1]).toBe('true');
    expect(html).not.toContain('>Trechos');
  });

  it('a aba não mostra o número de trechos, nem no rótulo nem na dica (decisão do Paulo, como no canvas)', () => {
    const html = envolver(<RightTabsPanel {...painel({ desvios: [DA_IA, AJUSTADA, A_MAO] })} />);
    const aba = html.match(/<button[^>]*role="tab"[^>]*title="([^"]*)"[^>]*>(Decis[^<]*)<\/button>/)!;

    // O rótulo e a dica, não o `style` (que tem números de tamanho).
    expect(aba[2]).toBe('Decisões');
    expect(aba[1]).toBe('Decisões');
  });

  it('a pergunta 2 diz no título quanto sai, contando uma vez o que se sobrepõe', () => {
    const html = envolver(<RightTabsPanel {...painel()} />);

    expect(html).toContain('aria-label="Pergunta sobre os desvios de assunto"');
    expect(html).toContain('2 · Tirar os desvios de assunto?');
    // 1:56 + 0:15
    expect(html).toContain('sai 2:11');
  });

  it('sem trechos, a pergunta fica, mas sem um "sai 0 s"', () => {
    const html = envolver(<RightTabsPanel {...painel({ desvios: [] })} />);

    expect(html).toContain('2 · Tirar os desvios de assunto?');
    expect(html).not.toContain('sai ');
  });

  it('as perguntas 1 e 3 são de outras demandas: só o lugar, sem conteúdo inventado', () => {
    const html = envolver(<RightTabsPanel {...painel()} />);

    expect(html.match(/<section aria-label="Pergunta sobre/g)).toHaveLength(1);
    expect(html).not.toContain('1 · ');
    expect(html).not.toContain('3 · ');
  });

  it('a lista dos trechos mora dentro da pergunta 2', () => {
    let arvore: Elemento[] = [];
    function Sonda() {
      arvore = elementos(RightTabsPanel(painel()));
      return null;
    }
    envolver(<Sonda />);
    const pergunta = arvore.find((e) => nome(e) === 'PerguntaDosDesvios')!;

    expect(elementos(pergunta.props.children as ReactNode).map(nome)).toContain('TrechosList');
  });
});

describe('a pergunta 2: cada trecho diz de quem é a borda', () => {
  it('dois selos só: Auto na borda da IA, Manual na sua', () => {
    const html = lista({ desvios: [DA_IA, AJUSTADA, A_MAO], onVoltarABordaDaIa: noop });
    const blocos = html.split('<article').slice(1);

    expect(blocos[0]).toContain('Auto · borda da IA');
    expect(blocos[1]).toContain('Manual · você ajustou');
    expect(blocos[2]).toContain('Manual · você ajustou');
    expect(html).not.toContain('você marcou');
  });

  it('o silêncio do app e a análise inicial, sem carimbo, são Auto e não têm Voltar', () => {
    const silencio: Desvio = { inicio_hms: '00:20:00.000', fim_hms: '00:20:02.000', motivo: 'silêncio', origem: 'tecnico' };
    const daAnalise: Desvio = { inicio_hms: '00:21:00.000', fim_hms: '00:21:09.000', motivo: 'tangente', origem: 'claude' };
    const blocos = lista({ desvios: [silencio, daAnalise], onVoltarABordaDaIa: noop }).split('<article').slice(1);

    expect(blocos.map((b) => b.includes('Auto · borda da IA'))).toEqual([true, true]);
    expect(blocos.some((b) => b.includes('Voltar à borda da IA'))).toBe(false);
  });

  it('"Voltar à borda da IA" só no trecho ajustado, com o aviso de que o Desfazer não o leva', () => {
    const html = lista({ desvios: [DA_IA, AJUSTADA, A_MAO], onVoltarABordaDaIa: noop });
    const blocos = html.split('<article').slice(1);

    expect(blocos.map((b) => b.includes('Voltar à borda da IA</button>'))).toEqual([false, true, false]);
    expect(blocos[1]).toContain('Desfazer a rodada não leva este trecho');
    expect(blocos[0]).not.toContain('Desfazer a rodada não leva');
  });

  it('o Voltar age no índice gravado, não na posição na tela', () => {
    const voltar = vi.fn();
    const linhas = arvoreDaLista({ desvios: [A_MAO, AJUSTADA, DA_IA], onVoltarABordaDaIa: voltar }).filter(
      (e) => nome(e) === 'LinhaDoTrecho',
    );
    const ajustada = linhas.find((l) => l.props.desvio === AJUSTADA)!;

    (ajustada.props.onVoltarABordaDaIa as () => void)();

    expect(voltar).toHaveBeenCalledWith(1);
  });

  it('cada bloco mostra o SAI e o FICA da emenda, e o Riscar', () => {
    const html = lista({
      desvios: [{ ...DA_IA, inicio_hms: '00:00:14.000', fim_hms: '00:00:18.000', borda_da_rodada: [14, 18] }],
      linhas: [
        { start: 10, end: 14, texto: 'a gente estava falando da classe média' },
        { start: 14, end: 18, texto: 'e aí, veja bem, a classe média paga' },
        { start: 18, end: 22, texto: 'essa conta todo mês sem reclamar' },
      ],
    });

    expect(html).toMatch(/>Sai<\/span>/);
    expect(html).toMatch(/>Fica<\/span>/);
    expect(html).toContain('aria-label="Como a emenda fica"');
    expect(html).toMatch(/aria-label="Riscar trecho"[^>]*>Riscar<\/button>/);
  });
});

describe('a pergunta 2: a rodada e as ações da IA', () => {
  it('o cabeçalho da rodada diz quem a fez e quantos trechos desfazer leva', () => {
    const html = lista({ desvios: [DA_IA, AJUSTADA], trechosDaUltimaRodada: 1, onDesfazerRodada: noop });

    expect(html).toContain('rodada da IA · Claude');
    expect(html).toContain('Desfazer rodada · 1 trecho');
  });

  it('o Desfazer rodada chama o desfazer', () => {
    const desfazer = vi.fn();
    const botao = arvoreDaLista({ desvios: [DA_IA], trechosDaUltimaRodada: 1, onDesfazerRodada: desfazer }).find(
      (e) => e.props.onClick === desfazer,
    );

    expect(botao).toBeDefined();
  });

  it('Gerar e "+ Trecho no cursor" ficam no fim, depois dos trechos', () => {
    const html = lista({ desvios: [DA_IA], onAdicionarTrechoNoCursor: noop });

    expect(html.indexOf('<article')).toBeLessThan(html.indexOf('aria-label="Gerar trechos a remover"'));
    expect(html).toContain('Gerar (acrescenta)');
    expect(html.indexOf('Gerar trechos a remover')).toBeLessThan(html.indexOf('Trecho no cursor'));
  });

  it('"+ Trecho no cursor" chama o trecho aqui do editor; sem ele, o botão não aparece', () => {
    const noCursor = vi.fn();
    const botao = arvoreDaLista({ onAdicionarTrechoNoCursor: noCursor }).find((e) => e.props.onClick === noCursor);

    expect(botao).toBeDefined();
    expect(lista()).not.toContain('Trecho no cursor');
  });

  it('o painel liga o "+ Trecho no cursor" ao trecho aqui e o Voltar ao dos riscados', () => {
    const aqui = vi.fn();
    const voltar = vi.fn();
    const riscados = { ocupado: false, riscar: noop, restaurar: noop, desfazerRodada: noop, voltarABordaDaIa: voltar };
    let props: TrechosListProps | undefined;
    function Sonda() {
      const arvore = elementos(RightTabsPanel(painel({ onAdicionarTrechoAqui: aqui, riscados })));
      props = arvore.find((e) => nome(e) === 'TrechosList')!.props as unknown as TrechosListProps;
      return null;
    }
    envolver(<Sonda />);

    props!.onAdicionarTrechoNoCursor!();
    props!.onVoltarABordaDaIa!(4);

    expect(aqui).toHaveBeenCalledOnce();
    expect(voltar).toHaveBeenCalledWith(4);
  });
});
