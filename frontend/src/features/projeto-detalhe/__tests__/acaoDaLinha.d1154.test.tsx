import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkDeAcao } from '@/components/ui/link-de-acao';
import { ToastProvider } from '@/components/ui/toaster';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-1154 · DIRECAO §5: na linha, o proposto pede "Editar" e o riscado "Trazer de volta".
// Aprovar sai do botão da linha e segue na tecla A (o lote e a barra têm os testes deles).
const h = vi.hoisted(() => ({ navegar: vi.fn(), aprovar: vi.fn(), atualizar: vi.fn() }));

vi.mock('react-router-dom', async (original) => ({
  ...(await original<typeof import('react-router-dom')>()),
  useNavigate: () => h.navegar,
}));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAprovar: () => ({ mutate: h.aprovar }),
  useAtualizarCorte: () => ({ mutate: h.atualizar }),
}));
vi.mock('@/upgrade/medidas', async (original) => ({
  ...(await original<typeof import('@/upgrade/medidas')>()),
  useJanelaMin: () => true,
}));
vi.mock('@/components/ui/overflow-menu', async (original) => ({
  ...(await original<typeof import('@/components/ui/overflow-menu')>()),
  OverflowMenu: () => null,
}));

type No = ReactElement<{
  children?: unknown;
  onClick?: () => void;
  onKeyDown?: (e: unknown) => void;
}>;

function elementos(raiz: unknown): No[] {
  if (Array.isArray(raiz)) return raiz.flatMap(elementos);
  if (!raiz || typeof raiz !== 'object' || !('props' in raiz)) return [];
  const no = raiz as No;
  return [no, ...elementos(no.props.children)];
}

const textoDe = (no: unknown): string => {
  if (typeof no === 'string') return no;
  if (Array.isArray(no)) return no.map(textoDe).join('');
  if (no && typeof no === 'object' && 'props' in no) return textoDe((no as No).props.children);
  return '';
};

/** A linha chamada dentro de uma sonda: devolve o <article> com os handlers de verdade. */
function linhaDe(status: Corte['status']) {
  let artigo: No | undefined;
  function Sonda() {
    artigo = CorteLinhaAp({
      projetoId: 'p1',
      corte: { id: 'c7', numero: 7, status, inicio_seg: 0, fim_seg: 60 } as unknown as Corte,
      status: statusExportPendente({ corte_id: 'c7', numero: 7, titulo: 'Corte' }),
      podeSubir: true,
      podeDescer: true,
      reordenando: false,
      onMover: vi.fn(),
      onEnviarYoutube: vi.fn(),
      onInformarUrl: vi.fn(),
      onLiberarPublicacao: vi.fn(),
      enviando: false,
    }) as No;
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
  const acoes = elementos(artigo).filter((e) => e.type === LinkDeAcao);
  expect(acoes).toHaveLength(1);
  return { artigo: artigo!, acao: acoes[0], rotulo: textoDe(acoes[0]).trim() };
}

function teclarA(artigo: No) {
  const alvo = { closest: () => null, parentElement: null };
  artigo.props.onKeyDown!({
    key: 'a',
    target: alvo,
    currentTarget: alvo,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  });
}

describe('D-1154 · a ação da linha segue a §5', () => {
  beforeEach(() => vi.clearAllMocks());

  it('a linha de um proposto mostra "Editar" e abre o editor, sem aprovar', () => {
    const { acao, rotulo } = linhaDe('proposto');
    expect(rotulo).toBe('Editar');
    acao.props.onClick!();
    expect(h.navegar).toHaveBeenCalledWith('/projetos/p1/cortes/c7');
    expect(h.aprovar).not.toHaveBeenCalled();
    expect(h.atualizar).not.toHaveBeenCalled();
  });

  it('a linha de um riscado mostra "Trazer de volta" e o desfaz', () => {
    const { acao, rotulo } = linhaDe('rejeitado');
    expect(rotulo).toBe('Trazer de volta');
    acao.props.onClick!();
    expect(h.atualizar).toHaveBeenCalledOnce();
    expect(h.atualizar.mock.calls[0][0]).toEqual({ status: 'proposto' });
    expect(h.navegar).not.toHaveBeenCalled();
  });

  it('a tecla A ainda aprova o proposto, e a falha avisa (D-746)', () => {
    const { artigo } = linhaDe('proposto');
    teclarA(artigo);
    expect(h.aprovar).toHaveBeenCalledOnce();
    expect(typeof h.aprovar.mock.calls[0][1].onError).toBe('function');
  });
});
