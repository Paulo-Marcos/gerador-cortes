import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rawEditorPath } from '@/features/post-production/postProductionNavigation';
import { UmaTelaPorCorte } from '@/upgrade/UmaTelaPorCorte';
import { CabecalhoDoCorte } from '../CabecalhoDoCorte';
import { useEditorPage } from '../useEditorPage';
import { clicar, montarComFoco, type No } from './domComFoco';
import { assentar } from './domMinimo';

// D-1201 (DIRECAO §8.2, Foco): riscar ou trocar de corte recria a tela (D-1033), e
// o botão que tinha o foco some com a antiga. Quem usa o teclado caía no <body> e
// recomeçava do topo. O foco vai para o título do corte novo, já montado. A troca
// aqui é a de verdade: a rota muda, o `corte.id` muda e a instância é outra.

const h = vi.hoisted(() => {
  const corteDe = (id: string, numero: number) => ({
    id,
    numero,
    projeto_id: 'p1',
    status: 'proposto',
    titulo_proposto: `Corte ${id}`,
    inicio_seg: numero * 600,
    fim_seg: numero * 600 + 300,
    desvios: [],
    motivo_riscado: [],
  });
  return {
    cortes: [corteDe('a', 1), corteDe('b', 2), corteDe('c', 3)],
    notify: vi.fn((..._args: unknown[]) => 'aviso-1'),
    mutacao: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  };
});

vi.mock('@/features/editor/api/cortes', async (original) => {
  const real = await original<typeof import('@/features/editor/api/cortes')>();
  return {
    cortesApi: {
      ...real.cortesApi,
      riscarCorte: async () => ({ status_anterior: 'proposto', liberado_mb: 0, retido_mb: 0 }),
      trazerDeVolta: async () => ({}),
    },
  };
});
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
vi.mock('@/components/ui/toaster', () => ({ useToast: () => ({ notify: h.notify, dismiss: vi.fn() }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirmacao: () => ({ pedir: vi.fn() }) }));
vi.mock('@/shared/atalhos/shortcuts', () => ({ useShortcuts: () => undefined }));
vi.mock('../useTrechosRiscados', () => ({ useTrechosRiscados: () => ({ riscar: vi.fn() }) }));

let editor: ReturnType<typeof useEditorPage>;

/** O corpo do editor, como a EditorPage: primeiro "Carregando", o cabeçalho só depois. */
function Tela() {
  editor = useEditorPage();
  const [carregou, setCarregou] = useState(false);
  useEffect(() => {
    const relogio = setTimeout(() => setCarregou(true), 0);
    return () => clearTimeout(relogio);
  }, []);
  if (!carregou || !editor.corte) return <p>Carregando o corte…</p>;
  return (
    <>
      <CabecalhoDoCorte
        projetoId="p1"
        tituloLive="Live"
        duracaoLiveSeg={3600}
        cortes={editor.cortes}
        corte={editor.corte}
        caminhoDoCorte={(c) => rawEditorPath('p1', c.id)}
        comRiscados
      />
      <button type="button" aria-label="Riscar corte" onClick={editor.riscar.riscarCorte}>
        Riscar corte
      </button>
    </>
  );
}

let limpar: () => Promise<void> = async () => undefined;
beforeEach(() => h.notify.mockClear());
afterEach(async () => {
  await limpar();
  limpar = async () => undefined;
});

async function abrir(corteId: string) {
  const roteador = createMemoryRouter(
    [{ path: '/projetos/:id/cortes/:corteId', element: <UmaTelaPorCorte><Tela /></UmaTelaPorCorte> }],
    { initialEntries: [`/projetos/p1/cortes/${corteId}`] },
  );
  const montada = montarComFoco(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={roteador} />
    </QueryClientProvider>,
  );
  limpar = montada.limpar;
  const { documento } = montada;
  const pelo = (rotulo: string) => documento.body.achar((n: No) => n.getAttribute('aria-label') === rotulo)!;
  const foco = () => `${documento.activeElement.nodeName} ${documento.activeElement.textContent}`;
  const corteAberto = () => roteador.state.location.pathname.split('/').pop();
  /** Espera o corte abrir e a tela nova terminar de montar (sob carga o React demora mais). */
  const abriu = async (id: string) => {
    const montou = () => corteAberto() === id && !!documento.body.achar((n) => n.textContent === `Corte ${id}` && n.nodeName === 'H2');
    await vi.waitFor(() => expect(montou()).toBe(true), { timeout: 4000, interval: 5 });
    await assentar();
  };
  await abriu(corteId);
  return { documento, pelo, foco, abriu };
}

const tecla = (descricao: string) => editor.bindings.find((b) => b.description === descricao)!.action();

describe('D-1201 · o foco segue para o título do corte novo', () => {
  it('na primeira abertura o foco não é tomado: o Tab começa no "Pular para o conteúdo"', async () => {
    const tela = await abrir('a');
    expect(tela.documento.activeElement).toBe(tela.documento.body);
  });

  it('riscado pelo botão, o foco vai para o título do próximo corte', async () => {
    const tela = await abrir('a');
    clicar(tela.pelo('Riscar corte'));
    await tela.abriu('b');
    expect(tela.foco()).toBe('H2 Corte b');
  });

  it('o Desfazer do aviso volta ao corte riscado, com o foco no título dele', async () => {
    const tela = await abrir('a');
    clicar(tela.pelo('Riscar corte'));
    await tela.abriu('b');
    const opcoes = h.notify.mock.calls[0][1] as { conteudo: ReactElement<{ onDesfazer: () => void }> };
    opcoes.conteudo.props.onDesfazer();
    await tela.abriu('a');
    expect(tela.foco()).toBe('H2 Corte a');
  });

  it.each([
    ['a seta "Próximo corte" do mapa', 'Próximo corte', 'c'],
    ['a seta "Corte anterior" do mapa', 'Corte anterior', 'a'],
  ])('trocado por %s, o foco vai para o título do corte novo', async (_nome, seta, destino) => {
    const tela = await abrir('b');
    clicar(tela.pelo(seta));
    await tela.abriu(destino);
    expect(tela.foco()).toBe(`H2 Corte ${destino}`);
  });

  it('trocado pela pílula do mapa, o foco vai para o título do corte novo', async () => {
    const tela = await abrir('a');
    clicar(tela.documento.body.achar((n) => n.getAttribute('data-corte') === 'c')!);
    await tela.abriu('c');
    expect(tela.foco()).toBe('H2 Corte c');
  });

  it('trocado pelo K, o foco vai para o título do corte novo', async () => {
    const tela = await abrir('a');
    tecla('Próximo corte');
    await tela.abriu('b');
    expect(tela.foco()).toBe('H2 Corte b');
  });
});
