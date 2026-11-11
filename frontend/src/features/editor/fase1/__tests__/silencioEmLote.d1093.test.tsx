import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ToastProvider } from '@/components/ui/toaster';
import type { Desvio } from '@/types/models';

// D-1093 (E5, P9): a pergunta 1 da aba Decisões — o silêncio, decidido de uma vez.

const corte = vi.hoisted(() => ({ riscados: [] as unknown[] }));
vi.mock('@/features/editor/useCortes', async () => {
  const actual = await vi.importActual<typeof import('@/features/editor/useCortes')>('@/features/editor/useCortes');
  return {
    ...actual,
    useCorte: () => ({
      data: { projeto_id: 'p1', trechos_da_ultima_rodada: 0, desvios_riscados: corte.riscados, inicio_seg: 0, fim_seg: 1211 },
    }),
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

const { RightTabsPanel } = await import('../RightTabsPanel');
const { PerguntaDoSilencio } = await import('../PerguntaDoSilencio');
const { TrechosList } = await import('../TrechosList');
const { silencioDoCorte, resumoDoSilencio } = await import('../silencioDoCorte');
const { falaDoSilencio } = await import('../falaDoTrecho');

const noop = vi.fn();
// 05:05 → 05:22, como no canvas: 17 s.
const SILENCIO: Desvio = {
  inicio_hms: '00:05:05.000',
  fim_hms: '00:05:22.000',
  motivo: 'Silêncio Detectado (IA/Técnico)',
  origem: 'tecnico',
  categoria: 'silencio',
};
const OUTRO_SILENCIO: Desvio = { ...SILENCIO, inicio_hms: '00:06:00.000', fim_hms: '00:06:02.000' };
const TANGENTE: Desvio = {
  inicio_hms: '00:05:40.000',
  fim_hms: '00:06:20.000',
  motivo: 'Tangente',
  origem: 'claude',
  categoria: 'tangente',
};
const LINHAS = [
  { start: 300, end: 305, texto: 'só para você se ligar do que vamos' },
  { start: 305, end: 322, texto: 'trinta segundinhos aqui' },
  { start: 322, end: 326, texto: 'falando. A gente tá muito' },
];

beforeEach(() => {
  corte.riscados = [];
});

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
    desvios: [SILENCIO, TANGENTE],
    selectedDesvioIdx: null,
    onSeek: noop,
    onGerarManual: noop,
    onGerarTrechosIA: noop,
    pendingTrechos: {},
    transcricao: LINHAS,
    currentTime: 0,
    onAtualizarTranscricao: noop,
    transcricaoAtualizando: false,
    ...props,
  } as Parameters<typeof RightTabsPanel>[0];
}

/** O HTML de uma pergunta, pelo `aria-label` da seção. */
function pergunta(html: string, assunto: string): string {
  const inicio = html.indexOf(`<section aria-label="Pergunta sobre ${assunto}"`);
  expect(inicio, `sem a pergunta sobre ${assunto}`).toBeGreaterThanOrEqual(0);
  return html.slice(inicio, html.indexOf('</section>', inicio));
}

type Elemento = ReactElement<Record<string, unknown>>;
function elementos(no: ReactNode): Elemento[] {
  if (Array.isArray(no)) return no.flatMap(elementos);
  if (!isValidElement(no)) return [];
  const el = no as Elemento;
  return [el, ...elementos(el.props.children as ReactNode)];
}

/** A árvore que um componente com `memo` devolve, sem renderizar: para clicar. */
function arvore(Componente: unknown, props: Record<string, unknown>): Elemento[] {
  const tipo = (Componente as { type: (p: unknown) => ReactNode }).type;
  let resultado: Elemento[] = [];
  function Sonda() {
    resultado = elementos(tipo(props));
    return null;
  }
  envolver(<Sonda />);
  return resultado;
}

function propsDaPergunta(props: Record<string, unknown> = {}) {
  return {
    corteId: 'c1',
    desvios: [TANGENTE, SILENCIO],
    linhas: LINHAS,
    selectedDesvioIdx: null,
    onSeek: noop,
    onRiscar: noop,
    onDecidir: noop,
    ...props,
  };
}

describe('o estado da pergunta do silêncio', () => {
  it('sem silêncio nenhum, não há o que perguntar', () => {
    expect(silencioDoCorte([TANGENTE], [])).toBeNull();
  });

  it('o título soma todos os silêncios, os que saem e os mantidos', () => {
    const estado = silencioDoCorte([SILENCIO], [OUTRO_SILENCIO])!;

    expect(estado.rotulo).toBe('19 s');
    expect(estado.resposta).toBe('misto');
    expect(resumoDoSilencio(estado)).toBe('1 saem · 1 mantido');
  });

  it('todos saindo é "Tirar todos"; todos riscados é "Manter todos"', () => {
    expect(silencioDoCorte([SILENCIO, OUTRO_SILENCIO])!.resposta).toBe('tirar');
    expect(silencioDoCorte([TANGENTE], [SILENCIO, OUTRO_SILENCIO])!.resposta).toBe('manter');
    expect(resumoDoSilencio(silencioDoCorte([TANGENTE], [SILENCIO])!)).toBe('todos mantidos');
  });

  it('cada silêncio que sai guarda o índice da lista do corte', () => {
    expect(silencioDoCorte([TANGENTE, SILENCIO, OUTRO_SILENCIO])!.saem.map((s) => s.indice)).toEqual([1, 2]);
  });
});

describe('a pergunta 1 na aba Decisões', () => {
  it('"1 · Tirar o silêncio? Sai 17 s", todos de uma vez, antes dos desvios', () => {
    const html = envolver(<RightTabsPanel {...painel()} />);

    expect(html).toContain('1 · Tirar o silêncio? Sai 17 s');
    expect(pergunta(html, 'o silêncio')).toContain('todos de uma vez');
    expect(html.indexOf('Pergunta sobre o silêncio')).toBeLessThan(html.indexOf('Pergunta sobre os desvios'));
  });

  it('o silêncio mostra o SAI com a fala cortada e o FICA com o ponto da emenda', () => {
    const bloco = pergunta(envolver(<RightTabsPanel {...painel()} />), 'o silêncio');

    expect(bloco).toContain('>Sai<');
    expect(bloco).toContain('trinta segundinhos aqui');
    expect(bloco).toContain('aria-label="Como a emenda fica"');
    expect(bloco).toContain('▸◂');
    expect(bloco).toContain('Auto · borda da IA');
  });

  it('o silêncio sem fala dentro mostra a pausa e a emenda, em vez de nada', () => {
    const semFala = [
      { start: 296, end: 305, texto: 'só para você se ligar do que' },
      { start: 322, end: 326, texto: 'vamos falando. A gente tá' },
    ];
    const bloco = pergunta(envolver(<RightTabsPanel {...painel({ transcricao: semFala })} />), 'o silêncio');

    expect(bloco).toContain('pausa, sem fala');
    expect(bloco).toMatch(/do que <span[^>]*>▸◂<\/span> vamos falando/);
  });

  it('a pergunta 2 não lista o silêncio nem o conta no "sai"', () => {
    const bloco = pergunta(envolver(<RightTabsPanel {...painel()} />), 'os desvios de assunto');

    expect(bloco).toContain('sai 0:40');
    expect(bloco).not.toContain('Silêncio Detectado');
  });

  it('só um corte com silêncios tem a pergunta 1', () => {
    expect(envolver(<RightTabsPanel {...painel({ desvios: [TANGENTE] })} />)).not.toContain('Tirar o silêncio');
  });

  it('com todos riscados, a pergunta continua, com "Manter todos" marcado', () => {
    corte.riscados = [SILENCIO];
    const bloco = pergunta(envolver(<RightTabsPanel {...painel({ desvios: [TANGENTE] })} />), 'o silêncio');

    expect(bloco).toContain('Tirar o silêncio? Sai 17 s');
    expect(bloco).toContain('todos mantidos');
    expect(bloco).toMatch(/aria-pressed="true"[^>]*>Manter todos</);
    expect(bloco).toMatch(/aria-pressed="false"[^>]*>Tirar todos</);
  });

  it('nada de caixa de seleção por silêncio: a exceção se risca como trecho', () => {
    const bloco = pergunta(envolver(<RightTabsPanel {...painel()} />), 'o silêncio');

    expect(bloco).not.toContain('checkbox');
    expect(bloco).toContain('Riscar</button>');
  });
});

describe('as respostas da pergunta 1', () => {
  it('"Manter todos" responde de uma vez; "Tirar todos", já marcado, não chama nada', () => {
    const onDecidir = vi.fn();
    const resposta = arvore(PerguntaDoSilencio, propsDaPergunta({ onDecidir })).find(
      (e) => typeof e.type === 'function' && e.type.name === 'RespostaEmLote',
    )!;
    const botoes = elementos((resposta.type as (p: unknown) => ReactNode)(resposta.props)).filter(
      (e) => e.type === 'button',
    );

    const tirar = botoes.find((b) => b.props.children === 'Tirar todos')!;
    const manter = botoes.find((b) => b.props.children === 'Manter todos')!;
    expect(tirar.props.onClick).toBeUndefined();
    (manter.props.onClick as () => void)();

    expect(onDecidir).toHaveBeenCalledWith('manter');
  });

  it('o Riscar de um silêncio age no índice da lista do corte', () => {
    const onRiscar = vi.fn();
    const linha = arvore(PerguntaDoSilencio, propsDaPergunta({ onRiscar })).find((e) => e.props.desvio === SILENCIO)!;

    (linha.props.onRiscar as () => void)();

    expect(onRiscar).toHaveBeenCalledWith(1);
  });

  it('com muitos silêncios a lista começa fechada, e abre quando um é o selecionado', () => {
    const muitos = [0, 1, 2, 3].map((n) => ({ ...SILENCIO, inicio_hms: `00:0${n}:00.000`, fim_hms: `00:0${n}:01.000` }));
    const detalhe = (sel: number | null) =>
      arvore(PerguntaDoSilencio, propsDaPergunta({ desvios: muitos, selectedDesvioIdx: sel })).find((e) => e.type === 'details')!;

    expect(detalhe(null).props.open).toBe(false);
    expect(detalhe(2).props.open).toBe(true);
  });
});

describe('a lista da pergunta 2 sem o silêncio', () => {
  it('filtra o silêncio e risca pelo índice da lista inteira', () => {
    const onRemoverDesvio = vi.fn();
    const lista = arvore(TrechosList, {
      desvios: [SILENCIO, TANGENTE],
      semOSilencioDoApp: true,
      selectedDesvioIdx: null,
      pending: {},
      onSeek: noop,
      onRemoverDesvio,
      onGerarManual: noop,
      onGerarTrechosIA: noop,
    }).filter((e) => typeof e.type !== 'string' && e.props.desvio !== undefined && e.props.onRiscar);

    expect(lista.map((l) => l.props.desvio)).toEqual([TANGENTE]);
    (lista[0].props.onRiscar as () => void)();
    expect(onRemoverDesvio).toHaveBeenCalledWith(1);
  });
});

describe('cortesApi: o silêncio em lote', () => {
  let chamadas: Request[] = [];

  beforeEach(() => {
    chamadas = [];
    vi.resetModules();
    vi.stubEnv('VITE_API_URL', 'http://api.test/api');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (pedido: Request) => {
        chamadas.push(pedido);
        return new Response('{}', { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('"Manter todos" e "Tirar todos" são um pedido só cada, sem corpo', async () => {
    const { cortesApi } = await import('../../api/cortes');
    await cortesApi.manterSilencios('c1');
    await cortesApi.tirarSilencios('c1');

    expect(chamadas.map((c) => `${c.method} ${c.url}`)).toEqual([
      'POST http://api.test/api/cortes/c1/manter-silencios',
      'POST http://api.test/api/cortes/c1/tirar-silencios',
    ]);
  });
});

describe('falaDoSilencio', () => {
  const linhas = [
    { start: 290, end: 300, texto: 'um dois tres quatro cinco seis sete' },
    { start: 330, end: 340, texto: 'oito nove dez' },
  ];

  it('sem fala no trecho, junta a última palavra antes da pausa à primeira depois', () => {
    expect(falaDoSilencio(SILENCIO, linhas)).toEqual({
      sai: '',
      antes: 'dois tres quatro cinco seis sete',
      depois: 'oito nove dez',
    });
  });

  it('com fala no trecho, é a fala do trecho', () => {
    expect(falaDoSilencio(SILENCIO, LINHAS)?.sai).toBe('trinta segundinhos aqui');
  });

  it('sem fala nenhuma por perto, não inventa', () => {
    expect(falaDoSilencio(SILENCIO, [])).toBeNull();
  });
});
