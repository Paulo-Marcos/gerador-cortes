import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-1096 (E11, P7): na linha do Workspace, R risca direto, com o mesmo riscar do
// editor (D-1088). Sem diálogo: o aviso do riscar traz o motivo e o Desfazer.
// O hook do riscar tem os testes dele (useRiscarCorte.d1088, riscarNaLinha.d1096);
// aqui se prova que a linha o usa e para onde o foco vai.

type ArgsDoRiscar = [Corte | undefined, readonly Corte[], string, (proximo: number) => void, (() => void)?];

const h = vi.hoisted(() => ({
  riscarCorte: vi.fn(),
  args: [] as unknown[],
  portais: 0,
}));

vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: () => {
    h.portais += 1;
    return null;
  },
}));
vi.mock('@/features/editor/useRiscarCorte', () => ({
  useRiscarCorte: (...args: unknown[]) => {
    h.args = args;
    return { riscarCorte: h.riscarCorte, bloqueio: null, riscando: false };
  },
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAprovar: () => ({ mutate: vi.fn() }),
  useAtualizarCorte: () => ({ mutate: vi.fn() }),
}));
vi.mock('@/upgrade/medidas', async (original) => ({
  ...(await original<typeof import('@/upgrade/medidas')>()),
  useJanelaMin: () => true,
}));
vi.mock('@/components/ui/overflow-menu', async (original) => ({
  ...(await original<typeof import('@/components/ui/overflow-menu')>()),
  OverflowMenu: () => null,
}));

afterEach(() => {
  vi.clearAllMocks();
  h.args = [];
  h.portais = 0;
});

type No = ReactElement<Record<string, unknown>>;
type Linha = { focus: () => void; nextElementSibling: unknown; previousElementSibling: unknown };

const CORTE = { id: 'c7', numero: 7, status: 'aprovado', inicio_seg: 0, fim_seg: 60, youtube_video_id: '' };

function desenhar(passo?: (artigo: No) => void, corte: Partial<Corte> = {}) {
  const props = {
    projetoId: 'p1',
    corte: { ...CORTE, ...corte } as unknown as Corte,
    status: statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Pedro II e a Igreja' }),
    podeSubir: true,
    podeDescer: true,
    reordenando: false,
    onMover: vi.fn(),
    onEnviarYoutube: vi.fn(),
    onInformarUrl: vi.fn(),
    onLiberarPublicacao: vi.fn(),
    enviando: false,
  };
  let primeiro = true;
  function Sonda() {
    const artigo = CorteLinhaAp(props) as No;
    if (primeiro) passo?.(artigo);
    primeiro = false;
    return artigo;
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
  return h.args as ArgsDoRiscar;
}

const linha = (seguinte: unknown, anterior: unknown): Linha => ({
  focus: vi.fn(),
  nextElementSibling: seguinte,
  previousElementSibling: anterior,
});

const teclar = (alvo: Linha, tecla = 'r', closest: (s: string) => unknown = () => null) => (artigo: No) =>
  (artigo.props.onKeyDown as (e: unknown) => void)({
    key: tecla,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: alvo,
    target: { closest },
  });

describe('CorteLinhaAp · R risca direto (D-1096)', () => {
  it('R chama o riscar do corte da linha, sem abrir diálogo', () => {
    const [corte, cortes, projetoId] = desenhar(teclar(linha(null, null)));

    expect(h.riscarCorte).toHaveBeenCalledOnce();
    expect(h.portais).toBe(0);
    expect(corte?.id).toBe('c7');
    expect(projetoId).toBe('p1');
    // A linha não escolhe o próximo pela lista: segue a vizinha na tela.
    expect(cortes).toEqual([]);
  });

  it('o R maiúsculo também risca', () => {
    desenhar(teclar(linha(null, null), 'R'));
    expect(h.riscarCorte).toHaveBeenCalledOnce();
  });

  it('riscado, o foco segue para a linha de baixo', () => {
    const seguinte = { focus: vi.fn() };
    const anterior = { focus: vi.fn() };
    const [, , , seguir] = desenhar(teclar(linha(seguinte, anterior)));

    seguir(-1);

    expect(seguinte.focus).toHaveBeenCalledOnce();
    expect(anterior.focus).not.toHaveBeenCalled();
  });

  it('na última linha, o foco sobe para a de cima', () => {
    const anterior = { focus: vi.fn() };
    const [, , , seguir] = desenhar(teclar(linha(null, anterior)));

    seguir(-1);

    expect(anterior.focus).toHaveBeenCalledOnce();
  });

  it('o Desfazer devolve o foco à linha, sem sair do Workspace', () => {
    const propria = linha({ focus: vi.fn() }, null);
    const [, , , , aoDesfazer] = desenhar(teclar(propria));

    expect(aoDesfazer).toBeTypeOf('function');
    aoDesfazer!();

    expect(propria.focus).toHaveBeenCalledOnce();
  });

  it('digitando num campo, R não risca', () => {
    desenhar(teclar(linha(null, null), 'r', (s) => (s.includes('input') ? {} : null)));
    expect(h.riscarCorte).not.toHaveBeenCalled();
  });

  it('com o ⋯ da linha aberto, R não risca o corte de trás', () => {
    desenhar(teclar(linha(null, null), 'r', (s) => (s.includes('menu') ? {} : null)));
    expect(h.riscarCorte).not.toHaveBeenCalled();
  });

  it('o corte no YouTube chega ao riscar com o id do vídeo, que o recusa', () => {
    const [corte] = desenhar(undefined, { youtube_video_id: 'abc' });
    expect(corte?.youtube_video_id).toBe('abc');
  });
});
