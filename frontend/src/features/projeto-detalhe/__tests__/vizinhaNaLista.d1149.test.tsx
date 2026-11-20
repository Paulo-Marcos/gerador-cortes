import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-1149 · achado da pr-audit (bloqueante 1). Na lista da Sala escura cada `<article>` mora
// sozinho dentro da sua `<li>` (WorkspaceProjetoPage), e o cabeçalho é a primeira `<li>`. A
// triagem procurava a vizinha entre os irmãos do `<article>`, que não existem mais: J e K
// paravam de andar e, depois do R, o foco caía no nada (D-746, D-842, D-1096). Aqui a árvore
// tem a forma da tela de verdade: ul > li (cabeçalho), li > article, li > article, li > article.

const h = vi.hoisted(() => ({ riscar: vi.fn(), aoRiscar: undefined as undefined | (() => void) }));

vi.mock('@/features/editor/useRiscarCorte', () => ({
  useRiscarCorte: (_c: unknown, _l: unknown, _p: unknown, aoRiscar: () => void) => {
    h.aoRiscar = aoRiscar;
    return { riscarCorte: h.riscar };
  },
}));

afterEach(() => {
  vi.clearAllMocks();
  h.aoRiscar = undefined;
});

type No = {
  tagName: string;
  parentElement: No | null;
  nextElementSibling: No | null;
  previousElementSibling: No | null;
  focus: ReturnType<typeof vi.fn>;
  querySelector: (sel: string) => No | null;
};

function no(tagName: string): No {
  return {
    tagName,
    parentElement: null,
    nextElementSibling: null,
    previousElementSibling: null,
    focus: vi.fn(),
    querySelector: () => null,
  };
}

/** ul > li(cabeçalho), li > article × 3, ligados como no DOM. */
function lista() {
  const cabecalho = no('LI');
  const itens = [no('LI'), no('LI'), no('LI')];
  const linhas = itens.map((li) => {
    const artigo = no('ARTICLE');
    artigo.parentElement = li;
    li.querySelector = (sel) => (sel === 'article' ? artigo : null);
    return artigo;
  });
  const todos = [cabecalho, ...itens];
  todos.forEach((li, i) => {
    li.previousElementSibling = todos[i - 1] ?? null;
    li.nextElementSibling = todos[i + 1] ?? null;
  });
  return linhas;
}

function teclar(tecla: string, linha: No) {
  let artigo: ReactElement<{ onKeyDown: (e: unknown) => void }> | undefined;
  function Sonda() {
    artigo = CorteLinhaAp({
      projetoId: 'p1',
      corte: { id: 'c7', numero: 7, status: 'proposto', inicio_seg: 0, fim_seg: 60 } as unknown as Corte,
      status: statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Corte' }),
      podeSubir: true,
      podeDescer: true,
      reordenando: false,
      onMover: vi.fn(),
      onEnviarYoutube: vi.fn(),
      onInformarUrl: vi.fn(),
      onLiberarPublicacao: vi.fn(),
      enviando: false,
    }) as typeof artigo;
    return artigo!;
  }
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <Sonda />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  artigo!.props.onKeyDown({
    key: tecla,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: linha,
    target: { closest: () => null },
  });
}

describe('D-1149 · J, K e R acham a linha vizinha através da <li>', () => {
  it('K leva o foco à linha de baixo; J, à de cima', () => {
    const [primeira, segunda, terceira] = lista();
    teclar('k', segunda);
    expect(terceira.focus).toHaveBeenCalledOnce();
    teclar('j', segunda);
    expect(primeira.focus).toHaveBeenCalledOnce();
  });

  it('J na primeira linha não sai da lista: o cabeçalho não é linha', () => {
    const [primeira, segunda] = lista();
    teclar('j', primeira);
    expect(segunda.focus).not.toHaveBeenCalled();
  });

  it('riscado, o foco segue para a linha de baixo; na última, sobe para a de cima', () => {
    const [, segunda, terceira] = lista();
    teclar('r', segunda);
    expect(h.riscar).toHaveBeenCalledOnce();
    h.aoRiscar!();
    expect(terceira.focus).toHaveBeenCalledOnce();

    const [, outraSegunda, ultima] = lista();
    teclar('r', ultima);
    h.aoRiscar!();
    expect(outraSegunda.focus).toHaveBeenCalledOnce();
  });
});
