import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog, type PedidoConfirmacao } from '@/components/ui/confirm-dialog';
import { ToastProvider } from '@/components/ui/toaster';
import { confirmacaoExcluirCorte } from '@/features/editor/regeracaoConfirmacao';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte, StatusExportCorte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-878 · o que a linha do corte já fazia na main sem teste nenhum — as
// mutações das auditorias da D-868 passavam vivas por aqui: a capa quebrada,
// a duração da miniatura, o rejeitado, a exclusão pela tecla R, a seleção e o
// gradiente.
//
// Sem DOM não há clique, mas há render-phase update: um setState chamado
// enquanto a sonda desenha faz o React do servidor desenhá-la de novo, com o
// estado novo e os mesmos refs. É assim que `encenar` anda de quadro em quadro.
const h = vi.hoisted(() => ({
  deletar: vi.fn(),
  portais: [] as { filho: ReactElement<ConfirmDialogProps>; alvo: unknown }[],
}));

type ConfirmDialogProps = { pedido: PedidoConfirmacao; onCancel: () => void; onConfirm: () => void };

vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  // O servidor não desenha portal; o substituto anota o que iria para ele.
  createPortal: (filho: ReactElement<ConfirmDialogProps>, alvo: unknown) => {
    h.portais.push({ filho, alvo });
    return null;
  },
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAprovar: () => ({ mutate: vi.fn() }),
  useAtualizarCorte: () => ({ mutate: vi.fn() }),
  useDeletarCorte: () => ({ mutate: h.deletar }),
}));
vi.mock('@/upgrade/medidas', async (original) => ({
  ...(await original<typeof import('@/upgrade/medidas')>()),
  useJanelaMin: () => true,
}));
vi.mock('@/components/ui/overflow-menu', async (original) => ({
  ...(await original<typeof import('@/components/ui/overflow-menu')>()),
  OverflowMenu: () => null,
}));

const casca = { nome: '.ap' };
const corpo = { nome: 'body' };

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  h.portais = [];
});

type No = ReactElement<Record<string, unknown> & { children?: unknown; style?: Record<string, unknown> }>;

function elementos(raiz: unknown): No[] {
  if (Array.isArray(raiz)) return raiz.flatMap(elementos);
  if (!raiz || typeof raiz !== 'object' || !('props' in raiz)) return [];
  const no = raiz as No;
  return [no, ...elementos(no.props.children)];
}

type Extra = { selecionado?: boolean; onAlternarSelecao?: () => void };

function propsDaLinha(corte: Partial<Corte> | null, status: Partial<StatusExportCorte>, extra: Extra) {
  return {
    projetoId: 'p1',
    corte:
      corte === null
        ? undefined
        : ({ id: 'c7', numero: 7, status: 'proposto', inicio_seg: 0, fim_seg: 60, ...corte } as unknown as Corte),
    status: { ...statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Pedro II e a Igreja' }), ...status },
    podeSubir: true,
    podeDescer: true,
    reordenando: false,
    onMover: vi.fn(),
    onEnviarYoutube: vi.fn(),
    onInformarUrl: vi.fn(),
    onLiberarPublicacao: vi.fn(),
    enviando: false,
    ...extra,
  };
}

type Passo = (arvore: No[]) => void;

/** Desenha a linha numa sonda que, a cada desenho, roda o passo da vez sobre
 *  a árvore daquele quadro. Devolve as árvores e o HTML do último quadro. */
function encenar(
  passos: Passo[],
  corte: Partial<Corte> | null = {},
  status: Partial<StatusExportCorte> = {},
  extra: Extra = {},
) {
  const quadros: No[][] = [];
  const props = propsDaLinha(corte, status, extra);
  function Sonda() {
    const artigo = CorteLinhaAp(props) as No;
    quadros.push(elementos(artigo));
    passos[quadros.length - 1]?.(quadros[quadros.length - 1]);
    return artigo;
  }
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <Sonda />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { quadros, html: html.slice(html.indexOf('<article'), html.indexOf('</article>')) };
}

const desenhar = (corte: Partial<Corte> | null = {}, status: Partial<StatusExportCorte> = {}, extra: Extra = {}) =>
  encenar([], corte, status, extra).html;

describe('CorteLinhaAp · a miniatura (D-878)', () => {
  it('capa que não carrega some e deixa o gradiente à mostra', () => {
    const imagem = (arvore: No[]) => arvore.find((e) => e.type === 'img');
    const { quadros, html } = encenar(
      [(arvore) => (imagem(arvore)!.props.onError as () => void)()],
      {},
      { thumbnail_path: 'https://cdn.exemplo/capa.jpg' },
    );
    expect(imagem(quadros[0])!.props.src).toBe('https://cdn.exemplo/capa.jpg');
    expect(quadros).toHaveLength(2);
    expect(imagem(quadros[1])).toBeUndefined();
    expect(html).not.toContain('<img');
    expect(html).toContain('linear-gradient(135deg');
  });

  it('o gradiente de fundo tem o matiz do número do corte', () => {
    const fundo = (hue: number) => `linear-gradient(135deg,oklch(0.55 0.05 ${hue}),oklch(0.28 0.04 ${hue}))`;
    expect(desenhar({}, { numero: 7 })).toContain(fundo(22));
    expect(desenhar({}, { numero: 6 })).toContain(fundo(250));
    expect(desenhar({}, { numero: 3 })).toContain(fundo(300));
    expect(desenhar({}, { numero: 7 })).toMatch(/aria-hidden="true" style="position:absolute;inset:0;background:linear/);
  });

  it('a duração fica no canto da miniatura, em h:mm:ss', () => {
    const html = desenhar({ duracao_clip_seg: 3725 });
    expect(html).toMatch(
      /aria-label="Abrir o corte 7 no editor"(?:(?!<\/button>).)*bottom:3px;right:4px[^>]*>01:02:05<\/span>/,
    );
  });

  it('sem a duração do clipe, conta do início ao fim; sem duração, não mostra', () => {
    expect(desenhar({ inicio_seg: 10, fim_seg: 95 })).toMatch(/>00:01:25<\/span>/);
    expect(desenhar({ inicio_seg: 30, fim_seg: 30 })).not.toContain('right:4px');
    expect(desenhar(null)).not.toContain('right:4px');
  });
});

describe('CorteLinhaAp · rejeitado e seleção (D-878)', () => {
  const abertura = (html: string) => html.slice(0, html.indexOf('>'));
  const titulo = (html: string) => html.match(/<button[^>]*title="Pedro II e a Igreja"[^>]*>/)![0];

  it('o rejeitado fica esmaecido e com o título riscado', () => {
    const html = desenhar({ status: 'rejeitado' });
    expect(abertura(html)).toContain('opacity:0.72');
    expect(titulo(html)).toContain('text-decoration:line-through');
  });

  it('os outros estados ficam inteiros e sem risco', () => {
    const html = desenhar({ status: 'aprovado' });
    expect(abertura(html)).toContain('opacity:1');
    expect(titulo(html)).toContain('text-decoration:none');
  });

  it('a linha selecionada ganha a borda de seleção; a outra não', () => {
    const alternar = vi.fn();
    expect(abertura(desenhar({}, {}, { selecionado: true, onAlternarSelecao: alternar }))).toContain(
      'border-color:var(--sel-line)',
    );
    expect(desenhar({}, {}, { selecionado: false, onAlternarSelecao: alternar })).not.toContain('--sel-line');
  });

  it('o checkbox mostra a seleção e alterna pelo que a tela passou', () => {
    const alternar = vi.fn();
    const { quadros } = encenar([], {}, {}, { selecionado: true, onAlternarSelecao: alternar });
    const caixa = quadros[0].find((e) => e.type === 'input')!;
    expect(caixa.props.type).toBe('checkbox');
    expect(caixa.props.checked).toBe(true);
    (caixa.props.onChange as () => void)();
    expect(alternar).toHaveBeenCalledOnce();
    expect(encenar([]).quadros[0].some((e) => e.type === 'input')).toBe(false);
  });
});

describe('CorteLinhaAp · excluir pela tecla R (D-878)', () => {
  const vizinhas = () => ({ seguinte: { focus: vi.fn() }, anterior: { focus: vi.fn() } });

  function linhaFocada(seguinte: unknown, anterior: unknown) {
    return { focus: vi.fn(), nextElementSibling: seguinte, previousElementSibling: anterior };
  }

  const teclarR = (linha: unknown) => (arvore: No[]) =>
    (arvore[0].props.onKeyDown as (e: unknown) => void)({
      key: 'r',
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      currentTarget: linha,
      target: { closest: () => null },
    });
  const noDialogo = (botao: 'onConfirm' | 'onCancel') => () => h.portais[h.portais.length - 1].filho.props[botao]();

  it('R abre o diálogo de exclusão do editor, por portal na casca — e não apaga ainda', () => {
    vi.stubGlobal('document', { querySelector: (s: string) => (s === '.ap' ? casca : null), body: corpo });
    const { seguinte, anterior } = vizinhas();
    const { quadros } = encenar([teclarR(linhaFocada(seguinte, anterior))]);
    expect(quadros).toHaveLength(2);
    expect(h.portais).toHaveLength(1);
    const { filho, alvo } = h.portais[0];
    expect(filho.type).toBe(ConfirmDialog);
    expect(filho.props.pedido).toEqual(confirmacaoExcluirCorte(7, 'Pedro II e a Igreja'));
    expect(alvo).toBe(casca);
    expect(h.deletar).not.toHaveBeenCalled();
  });

  it('sem a casca, o diálogo vai para o body', () => {
    vi.stubGlobal('document', { querySelector: () => null, body: corpo });
    encenar([teclarR(linhaFocada(null, null))]);
    expect(h.portais[0].alvo).toBe(corpo);
  });

  it('"Excluir de vez" apaga, e o foco segue para a linha de baixo', () => {
    vi.stubGlobal('document', { querySelector: () => casca, body: corpo });
    const { seguinte, anterior } = vizinhas();
    const { quadros } = encenar([teclarR(linhaFocada(seguinte, anterior)), noDialogo('onConfirm')]);
    expect(quadros).toHaveLength(3);
    expect(h.deletar).toHaveBeenCalledOnce();
    h.deletar.mock.calls[0][1].onSuccess();
    expect(seguinte.focus).toHaveBeenCalledOnce();
    expect(anterior.focus).not.toHaveBeenCalled();
  });

  it('na última linha, o foco sobe para a de cima', () => {
    vi.stubGlobal('document', { querySelector: () => casca, body: corpo });
    const { anterior } = vizinhas();
    encenar([teclarR(linhaFocada(null, anterior)), noDialogo('onConfirm')]);
    h.deletar.mock.calls[0][1].onSuccess();
    expect(anterior.focus).toHaveBeenCalledOnce();
  });

  it('desistir fecha o diálogo, não apaga e devolve o foco à própria linha', () => {
    vi.stubGlobal('document', { querySelector: () => casca, body: corpo });
    const { seguinte, anterior } = vizinhas();
    const linha = linhaFocada(seguinte, anterior);
    const { quadros } = encenar([teclarR(linha), noDialogo('onCancel')]);
    expect(quadros).toHaveLength(3);
    expect(h.portais).toHaveLength(1);
    expect(linha.focus).toHaveBeenCalledOnce();
    expect(h.deletar).not.toHaveBeenCalled();
  });
});
