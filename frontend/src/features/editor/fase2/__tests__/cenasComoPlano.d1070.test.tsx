import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isValidElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { conferenciaDaOrigemKey, corteKey } from '@/shared/chavesDeCache';
import type { CenaRemotion } from '@/types/models';
import type { CenaComOrigem as CenaComOrigemReal } from '../CenaComOrigem';
import { CenaItem } from '../CenaItem';
import { LegendaDaOrigem, PlanoDaCena, SeloDaOrigem } from '../CenaComOrigem';
import { cenasEmGeracaoKey } from '../../useGeracoesDaIa';
import { CenasPanel } from '../CenasPanel';
import { SceneTimeline } from '../SceneTimeline';

// D-1070: o plano na tela. O painel diz a origem de cada cena e quantas faltam conferir,
// risca em vez de excluir e marca como manual o que o operador escreveu; a linha do tempo
// usa a mesma cor.

type PropsDoItem = ComponentProps<typeof CenaComOrigemReal>;
const h = vi.hoisted(() => ({
  itens: [] as PropsDoItem[],
  botoes: [] as Record<string, unknown>[],
  validar: vi.fn(),
}));

vi.mock('@/features/ia', async (original) => ({
  ...(await original<typeof import('@/features/ia')>()),
  geracaoIaApi: { gerarCenasClaude: vi.fn(), cenasEmGeracao: vi.fn().mockResolvedValue({ em_geracao: false }) },
  useUltimaGeracao: () => ({ data: undefined }),
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('../useGravarCenas', () => ({ useGravarCenas: () => () => undefined }));
vi.mock('@/features/editor/useCenas', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCenas')>()),
  useValidarCenasRemotion: () => ({ mutate: h.validar, isPending: false }),
}));
// O botão vira sonda também: guarda o clique, para o teste apertar o Validar. O tooltip
// do Radix embrulha o clique e pede `window`; aqui ele só repassa o filho.
vi.mock('@/components/ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ variant: _v, size: _s, ...props }: Record<string, unknown>) => {
    h.botoes.push(props);
    return <button {...props} />;
  },
}));
// O item da lista vira sonda: guarda o que o painel entrega a cada cena.
vi.mock('../CenaComOrigem', async (original) => ({
  ...(await original<typeof import('../CenaComOrigem')>()),
  CenaComOrigem: (props: PropsDoItem) => {
    h.itens.push(props);
    return <li data-sonda={props.origem}>{props.cena.texto}</li>;
  },
}));

beforeEach(() => {
  h.itens.length = 0;
  h.botoes.length = 0;
  h.validar.mockReset();
});

const cena = (texto: string, campos: Partial<CenaRemotion> = {}) =>
  ({ tipo: 'enfase', inicio: 0, fim: 5, texto, ...campos }) as CenaRemotion;

const PLANO = [
  cena('Conferida', { inicio: 0, fim: 5 }),
  cena('Com aviso', { inicio: 10, fim: 15 }),
  cena('Escrita à mão', { inicio: 20, fim: 25, manual: true }),
  cena('Riscada', { inicio: 30, fim: 35, riscada: true }),
  cena('Riscada com aviso', { inicio: 40, fim: 45, riscada: true }),
];
const AVISOS = [
  { tipo: 'enfase', inicio: 10, codigo: 'sem_fonte', mensagem: 'Sem fonte.' },
  { tipo: 'enfase', inicio: 40, codigo: 'sem_fonte', mensagem: 'Sem fonte.' },
];

function cliente(avisos = AVISOS) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(corteKey('c1'), { id: 'c1' });
  const versao = qc.getQueryState(corteKey('c1'))?.dataUpdatedAt ?? 0;
  qc.setQueryData(conferenciaDaOrigemKey('c1', versao), { avisos });
  return qc;
}

function painel({ cenas = PLANO, avisos = AVISOS, validadas = false, onCenasChange = vi.fn(), gerando = false } = {}) {
  const qc = cliente(avisos);
  qc.setQueryData(cenasEmGeracaoKey('c1'), { corte_id: 'c1', em_geracao: gerando });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <CenasPanel
          corteId="c1"
          projetoId="p1"
          cenas={cenas}
          cenaAtivaIdx={-1}
          cenasValidadas={validadas}
          onSeek={vi.fn()}
          onCenasChange={onCenasChange}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const botaoValidar = (html: string) =>
  html.match(/<button[^>]*data-testid="botao-validar-cenas"[^>]*>([\s\S]*?)<\/button>/)?.[1] ?? '';

describe('Validar o plano (faltam N)', () => {
  it('conta as que pedem conferência, sem a riscada', () => {
    expect(botaoValidar(painel())).toContain('Validar o plano (faltam 1)');
  });

  it('sem aviso, sem número', () => {
    const rotulo = botaoValidar(painel({ avisos: [] }));
    expect(rotulo).toContain('Validar o plano');
    expect(rotulo).not.toContain('faltam');
  });

  it('com o plano validado, diz que está validado', () => {
    expect(botaoValidar(painel({ validadas: true }))).toContain('Plano validado');
  });

  it('o aviso não trava: com faltam 1 o botão segue livre (RN-42)', () => {
    expect(painel()).not.toMatch(/<button[^>]*disabled[^>]*data-testid="botao-validar-cenas"/);
  });
});

describe('o botão de validar', () => {
  const validarDoPainel = () => h.botoes.find((b) => b['data-testid'] === 'botao-validar-cenas')!;

  it('com cenas, fica livre e o clique valida o plano', () => {
    painel({ avisos: [] });
    expect(validarDoPainel().disabled).toBe(false);
    (validarDoPainel().onClick as () => void)();
    expect(h.validar).toHaveBeenCalledWith(true, expect.anything());
  });

  it('com zero cenas, oferece validar sem cenas e o clique valida o plano vazio (RN-38)', () => {
    const html = painel({ cenas: [], avisos: [] });
    expect(validarDoPainel().disabled).toBe(false);
    expect(botaoValidar(html)).toContain('Validar sem cenas');
    (validarDoPainel().onClick as () => void)();
    expect(h.validar).toHaveBeenCalledWith(true, expect.anything());
  });

  it('durante a geração, fica travado', () => {
    painel({ avisos: [], gerando: true });
    expect(validarDoPainel().disabled).toBe(true);
  });
});

describe('a origem de cada cena da lista', () => {
  it('o painel entrega a cada cena a sua origem', () => {
    painel();
    expect(h.itens.map((item) => [item.cena.texto, item.origem])).toEqual([
      ['Conferida', 'conferida'],
      ['Com aviso', 'conferir'],
      ['Escrita à mão', 'manual'],
      ['Riscada', 'riscada'],
      ['Riscada com aviso', 'riscada'],
    ]);
  });

  it('a contagem e a legenda falam do que vai ao vídeo', () => {
    const html = painel();
    expect(html).toContain('2 riscada(s) fora');
    expect(html).toContain('pede conferência');
    expect(html).toContain('da IA, conferida');
  });
});

describe('riscar em vez de excluir', () => {
  const itemDe = (texto: string) => h.itens.find((item) => item.cena.texto === texto)!;

  it('riscar mantém a cena no plano, com a marca, e as outras como estavam', () => {
    const onCenasChange = vi.fn();
    painel({ onCenasChange });
    itemDe('Conferida').onRiscar();
    const novas = onCenasChange.mock.calls[0][0] as CenaRemotion[];
    expect(novas).toHaveLength(PLANO.length);
    expect(novas[0]).toEqual({ ...PLANO[0], riscada: true });
    expect(novas.slice(1)).toEqual(PLANO.slice(1));
  });

  it('trazer de volta tira a marca', () => {
    const onCenasChange = vi.fn();
    painel({ onCenasChange });
    itemDe('Riscada').onTrazerDeVolta();
    const novas = onCenasChange.mock.calls[0][0] as CenaRemotion[];
    expect(novas[3]).not.toHaveProperty('riscada');
    expect(novas[3].texto).toBe('Riscada');
  });

  it('editar o texto de uma cena da IA a torna manual; mudar o tempo, não', () => {
    const onCenasChange = vi.fn();
    painel({ onCenasChange });
    itemDe('Conferida').onChange({ ...PLANO[0], texto: 'Reescrita' });
    itemDe('Conferida').onChange({ ...PLANO[0], inicio: 1 });
    expect((onCenasChange.mock.calls[0][0] as CenaRemotion[])[0]).toMatchObject({ texto: 'Reescrita', manual: true });
    expect((onCenasChange.mock.calls[1][0] as CenaRemotion[])[0]).not.toHaveProperty('manual');
  });

  it('a sobreposição com uma riscada não alarma', () => {
    const html = painel({ cenas: [cena('A', { inicio: 0, fim: 10 }), cena('B', { inicio: 5, fim: 12, riscada: true })] });
    expect(html).not.toContain('Cenas sobrepostas detectadas');
  });
});

describe('o card', () => {
  const procurarBotao = (no: unknown, texto: string): ReactElement<{ onClick: () => void }> | null => {
    if (!isValidElement(no)) return null;
    const props = no.props as { children?: unknown; onClick?: () => void };
    const filhos = ([] as unknown[]).concat(props.children ?? []);
    if (props.onClick && filhos.includes(texto)) return no as ReactElement<{ onClick: () => void }>;
    for (const filho of filhos) {
      const achado = procurarBotao(filho, texto);
      if (achado) return achado;
    }
    return null;
  };

  it('a riscada encolhe: texto riscado, fora do render e Trazer de volta, sem o editor', () => {
    const onTrazerDeVolta = vi.fn();
    const elemento = PlanoDaCena({
      origem: 'riscada',
      cena: cena('Pergunta riscada', { tipo: 'pergunta_transicao', riscada: true }),
      onSeek: vi.fn(),
      onTrazerDeVolta,
      children: <span>editor</span>,
    });
    const html = renderToStaticMarkup(elemento);
    expect(html).toContain('<s class');
    expect(html).toContain('Pergunta riscada');
    expect(html).toContain('fora do render');
    // O texto da linha do intervalo passa de 4.5:1: `--wb-text-dim` ficava entre 2.96 e 3.63.
    expect(html).toMatch(/text-\[var\(--wb-text-mute\)\]">[^<]*fora do render/);
    expect(html).not.toContain('editor');
    procurarBotao(elemento, 'Trazer de volta')?.props.onClick();
    expect(onTrazerDeVolta).toHaveBeenCalledOnce();
  });

  it('as outras levam a cor da origem e o editor', () => {
    const html = renderToStaticMarkup(
      PlanoDaCena({ origem: 'manual', cena: cena('x'), onSeek: vi.fn(), onTrazerDeVolta: vi.fn(), children: <span>editor</span> }),
    );
    expect(html).toContain('data-origem="manual"');
    expect(html).toContain('var(--wb-ok)');
    expect(html).toContain('editor');
  });

  it('o selo diz a origem, e a manual só "manual"', () => {
    expect(renderToStaticMarkup(<SeloDaOrigem origem="manual" />)).toContain('· manual');
    expect(renderToStaticMarkup(<SeloDaOrigem origem="conferir" />)).toContain('conferir');
    expect(renderToStaticMarkup(<SeloDaOrigem origem="conferida" />)).toContain('da IA · conferida');
  });

  it('o lixo virou Riscar', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <CenaItem cena={cena('x')} ativa={false} sobreposta={false} onChange={vi.fn()} onRiscar={vi.fn()} onSeek={vi.fn()} />
      </TooltipProvider>,
    );
    expect(html).toContain('aria-label="Riscar cena"');
    expect(html).not.toContain('Remover cena');
  });

  it('a legenda tem as quatro origens, e a riscada tracejada', () => {
    const html = renderToStaticMarkup(<LegendaDaOrigem />);
    for (const texto of ['da IA, conferida', 'pede conferência', 'manual', 'riscada']) expect(html).toContain(texto);
    expect(html).toContain('border-dashed');
  });
});

describe('a mesma cor na linha do tempo', () => {
  const timeline = (corteId?: string) =>
    renderToStaticMarkup(
      <QueryClientProvider client={cliente()}>
        <TooltipProvider>
          <SceneTimeline cenas={PLANO} currentTime={0} duration={60} onSeek={vi.fn()} waveformCorteId={corteId} />
        </TooltipProvider>
      </QueryClientProvider>,
    );
  const blocos = (html: string) => html.match(/<button[^>]*aria-label="Cena [^"]*"[^>]*>/g) ?? [];

  it('na Pós, cada bloco tem a cor da origem do card, e a riscada é tracejada', () => {
    const [conferida, conferir, manual, riscada] = blocos(timeline('c1'));
    expect(conferida).toContain('var(--wb-info)');
    expect(conferir).toContain('var(--wb-warn)');
    expect(manual).toContain('var(--wb-ok)');
    expect(riscada).toContain('border-style:dashed');
  });

  it('na Pós, traz a legenda', () => {
    expect(timeline('c1')).toContain('pede conferência');
  });

  it('sem cenas, a legenda não ocupa a linha do tempo', () => {
    const html = renderToStaticMarkup(
      <QueryClientProvider client={cliente()}>
        <SceneTimeline cenas={[]} currentTime={0} duration={60} onSeek={vi.fn()} waveformCorteId="c1" />
      </QueryClientProvider>,
    );
    expect(html).not.toContain('pede conferência');
  });

  it('sem corte (a Revisão final), pinta pelo tipo e não traz legenda', () => {
    const html = timeline(undefined);
    expect(html).not.toContain('pede conferência');
    expect(blocos(html)[0]).not.toContain('var(--wb-info)');
  });

  it('a origem não depende só da cor: o bloco traz o ícone e diz a origem ao leitor de tela', () => {
    const [conferida, conferir, manual, riscada] = blocos(timeline('c1'));
    expect(conferida).toContain('aria-label="Cena Enfase, da IA · conferida"');
    expect(conferir).toContain(', conferir"');
    expect(manual).toContain('title="Enfase · manual · ');
    expect(riscada).toContain(', riscada"');
    const html = timeline('c1');
    // O último ícone antes do texto do bloco (o primeiro é o do tipo da cena).
    const iconeAntes = (texto: string) =>
      [...html.slice(0, html.indexOf(`</svg>${texto}`)).matchAll(/lucide-([a-z-]+)/g)].at(-1)?.[1];
    expect(iconeAntes('Conferida')).toBe('check');
    expect(iconeAntes('Com aviso')).toBe('triangle-alert');
    expect(iconeAntes('Escrita à mão')).toBe('pen');
    expect(iconeAntes('Riscada<')).toBe('eye-off');
  });

  it('a legenda leva o mesmo ícone do bloco', () => {
    const html = renderToStaticMarkup(<LegendaDaOrigem />);
    for (const icone of ['check', 'triangle-alert', 'pen', 'eye-off']) expect(html).toContain(`lucide-${icone}`);
  });

  it('só leitura (Revisão final) não desenha a riscada: ela não está no vídeo', () => {
    const html = renderToStaticMarkup(
      <SceneTimeline cenas={PLANO} currentTime={0} duration={60} onSeek={vi.fn()} readOnly seekable />,
    );
    expect(html).toContain('Conferida');
    expect(html).not.toContain('Riscada');
  });
});
