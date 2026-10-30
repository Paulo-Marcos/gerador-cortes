import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PedidoConfirmacao } from '@/components/ui/confirm-dialog';
import { ToastProvider } from '@/components/ui/toaster';
import { MOTIVOS_APAGADO } from '@/features/editor/motivoApagado';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { Corte } from '@/types/models';
import { CorteLinhaAp } from '../CorteLinhaAp';

// D-993: excluir pela tecla R, na lista do projeto, leva o motivo escolhido no
// diálogo até o apagar. Mesma sonda do teste de comportamento da linha (D-878):
// sem DOM, cada quadro aciona um handler e o setState redesenha.

const h = vi.hoisted(() => ({
  deletar: vi.fn(),
  portais: [] as ReactElement<DialogoProps>[],
}));

type DialogoProps = { pedido: PedidoConfirmacao; onConfirm: (escolha?: string) => void };

vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (filho: ReactElement<DialogoProps>) => {
    h.portais.push(filho);
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

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  h.portais = [];
});

type No = ReactElement<Record<string, unknown>>;
type Passo = (artigo: No) => void;

function encenar(passos: Passo[], origemAnalise: string | null) {
  const props = {
    projetoId: 'p1',
    corte: { id: 'c7', numero: 7, status: 'proposto', inicio_seg: 0, fim_seg: 60, origem_analise: origemAnalise } as unknown as Corte,
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
  let quadro = 0;
  function Sonda() {
    const artigo = CorteLinhaAp(props) as No;
    passos[quadro++]?.(artigo);
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
}

const teclarR: Passo = (artigo) =>
  (artigo.props.onKeyDown as (e: unknown) => void)({
    key: 'r',
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    currentTarget: { focus: vi.fn(), nextElementSibling: null, previousElementSibling: null },
    target: { closest: () => null },
  });
const confirmarCom = (motivo?: string) => () => h.portais[h.portais.length - 1].props.onConfirm(motivo);

describe('CorteLinhaAp · motivo de excluir (D-993)', () => {
  it('a proposta da IA pergunta o motivo', () => {
    vi.stubGlobal('document', { querySelector: () => null, body: {} });
    encenar([teclarR], 'claude');
    expect(h.portais[0].props.pedido.escolha?.opcoes).toEqual(MOTIVOS_APAGADO);
  });

  it('o motivo escolhido segue para o apagar', () => {
    vi.stubGlobal('document', { querySelector: () => null, body: {} });
    encenar([teclarR, confirmarCom('repetido')], 'claude');
    expect(h.deletar).toHaveBeenCalledOnce();
    expect(h.deletar.mock.calls[0][0]).toBe('repetido');
  });

  it('confirmar sem motivo apaga do mesmo jeito', () => {
    vi.stubGlobal('document', { querySelector: () => null, body: {} });
    encenar([teclarR, confirmarCom()], 'claude');
    expect(h.deletar).toHaveBeenCalledOnce();
    expect(h.deletar.mock.calls[0][0]).toBeUndefined();
  });

  it('o corte criado na mão não pergunta motivo', () => {
    vi.stubGlobal('document', { querySelector: () => null, body: {} });
    encenar([teclarR], null);
    expect(h.portais[0].props.pedido.escolha).toBeUndefined();
  });
});
