import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { useEditorPage } from '../useEditorPage';

// D-1033: ficar no editor ao trocar de corte manteve viva a seleção de trecho.
// Medido no navegador: selecionar um trecho no corte 5, dar K e apertar
// Ctrl+Delete riscava um trecho do corte 6, que nunca foi selecionado. Este teste
// roda o hook de verdade, com a rota e a instância por corte, sobre um DOM mínimo:
// o render de servidor dos outros testes não guarda estado entre uma tela e outra.

const h = vi.hoisted(() => {
  const desvio = (inicio: string, fim: string) => ({ inicio_hms: inicio, fim_hms: fim, motivo: 'teste', origem: 'claude' });
  const corteDe = (id: string, numero: number, inicio: string, fim: string) => ({
    id,
    numero,
    projeto_id: 'p1',
    status: 'aprovado',
    titulo_proposto: id,
    inicio_seg: 0,
    fim_seg: 600,
    desvios: [desvio(inicio, fim)],
  });
  return {
    riscar: vi.fn(),
    cortes: [corteDe('c5', 5, '00:04:50.000', '00:04:56.000'), corteDe('c6', 6, '00:05:50.000', '00:05:55.000')],
    mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  };
});
const NO_TRECHO_DO_5 = 292;

vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({
  useAbrirPasta: h.mutacao,
  useExportStatus: () => ({ data: { cortes: [] } }),
  useProjeto: () => ({ data: { titulo_live: 'Live' } }),
}));
vi.mock('@/features/settings', () => ({
  useContextoCorte: () => ({ antesSeg: 0, depoisSeg: 0 }),
  useVelocidadePlayerPadrao: () => 1,
}));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosVisiveis: () => [] }));
vi.mock('@/features/editor/useCortes', async (original) => ({
  ...(await original<typeof import('@/features/editor/useCortes')>()),
  useAdicionarDesvio: h.mutacao,
  useAtualizarCorte: h.mutacao,
  useCorte: (id: string) => ({ data: h.cortes.find((c) => c.id === id), isLoading: false, isError: false }),
  useCortesProjeto: () => ({ data: h.cortes, isLoading: false, isError: false }),
  useDeletarCorte: h.mutacao,
  useDividirCorte: h.mutacao,
  useJuntarCortes: h.mutacao,
  useSincronizarTranscricao: h.mutacao,
  useToggleFire: h.mutacao,
  useToggleLeitura: h.mutacao,
}));
vi.mock('@/features/editor/useBruto', () => ({
  avisarSeBrutoOcupado: () => false,
  useGerarBruto: h.mutacao,
  useStatusBruto: () => ({ data: undefined, dataUpdatedAt: 0 }),
}));
vi.mock('@/features/editor/useGeracoesDaIa', () => ({
  useGerarMetadadosClaude: h.mutacao,
  useGerarTrechosClaude: h.mutacao,
  useStatusMetadadosClaude: () => undefined,
  useTrechosClaudeEmAndamento: () => false,
}));
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirmacao: () => ({ pedir: vi.fn() }) }));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({
  useTrechosRiscados: (corteId: string) => ({ riscar: (idx: number) => h.riscar(corteId, idx) }),
}));

let tela: ReturnType<typeof useEditorPage>;
function Sonda() {
  tela = useEditorPage();
  return null;
}

/** O que o React DOM pede do contêiner quando a tela não desenha nada. */
function conteiner(dono: unknown) {
  return {
    nodeType: 1,
    nodeName: 'DIV',
    tagName: 'DIV',
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: dono,
    childNodes: [],
    firstChild: null,
    lastChild: null,
    addEventListener() {},
    removeEventListener() {},
  };
}

/** Deixa rodar as tarefas que o React e o roteador agendaram. */
const assentar = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
};

const atalho = (descricao: string) => {
  const achado = tela.bindings.find((b) => b.description === descricao);
  expect(achado).toBeDefined();
  return achado!.action;
};

const global = globalThis as Record<string, unknown>;
let raiz: Root;

beforeEach(async () => {
  const documento = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
  global.window = globalThis;
  global.document = documento;
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  global.addEventListener = () => undefined;
  global.removeEventListener = () => undefined;
  vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
  h.riscar.mockClear();

  const roteador = createMemoryRouter(
    [{ path: '/projetos/:id/cortes/:corteId', element: <UmaTelaPorCorte><Sonda /></UmaTelaPorCorte> }],
    { initialEntries: ['/projetos/p1/cortes/c5'] },
  );
  raiz = createRoot(conteiner(documento) as unknown as HTMLElement);
  raiz.render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  await assentar();
});

afterEach(async () => {
  raiz.unmount();
  await assentar();
  vi.unstubAllGlobals();
  for (const nome of ['window', 'document', 'HTMLIFrameElement', 'IS_REACT_ACT_ENVIRONMENT', 'addEventListener', 'removeEventListener']) {
    delete global[nome];
  }
});

describe('D-1033 · a seleção de trecho não passa para o corte seguinte', () => {
  it('no próprio corte, Ctrl+Delete risca o trecho selecionado', async () => {
    tela.onSelectDesvioByTime(NO_TRECHO_DO_5);
    await assentar();
    expect(tela.selectedDesvioIdx).toBe(0);

    atalho('Remover trecho selecionado')();
    expect(h.riscar).toHaveBeenCalledWith('c5', 0);
  });

  it('trecho selecionado no corte 5, K, e Ctrl+Delete não toca o corte 6', async () => {
    tela.onSelectDesvioByTime(NO_TRECHO_DO_5);
    await assentar();
    expect(tela.selectedDesvioIdx).toBe(0);

    atalho('Próximo corte')();
    await assentar();
    expect(tela.corteId).toBe('c6');
    expect(tela.selectedDesvioIdx).toBeNull();

    atalho('Remover trecho selecionado')();
    expect(h.riscar).not.toHaveBeenCalled();
  });
});
