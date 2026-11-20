import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Corte } from '@/types/models';
import type { Chrome } from '@/upgrade/UpgradeChrome';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { assentar, montar } from './domMinimo';

// D-1150 (achados 3 e 4 da auditoria do PR #413):
// - a tela do editor, desenhada de verdade, pede o mapa no cabeçalho e dispensa a lista
//   lateral (antes o teste só lia a fonte, e `semLista={false}` passava verde);
// - o atalho dos metadados do corte (D-746), que morava na lista, volta no menu ⋯ como
//   "Editar metadados deste corte" e abre o mesmo modal de metadados.

const h = vi.hoisted(() => ({
  publicado: null as Chrome | null,
  modalDeMetadados: [] as unknown[],
}));

vi.mock('@/upgrade/UpgradeChrome', async (original) => ({
  ...(await original<typeof import('@/upgrade/UpgradeChrome')>()),
  useDefinirChrome: (chrome: Chrome) => {
    h.publicado = chrome;
  },
}));
vi.mock('@/features/projeto-detalhe/useProjetoDetalhe', () => ({ useProjeto: () => ({ data: undefined }) }));
vi.mock('@/features/channels/useMotivosDeExclusao', () => ({ useMotivosDeExclusao: () => ({ data: undefined }) }));
// As peças pesadas do miolo (player, onda, painéis) não são o assunto aqui.
vi.mock('../fase1/EditorFase1', () => ({ EditorFase1: () => null }));
vi.mock('../fase1/BrutoContextStrip', () => ({ BrutoContextStrip: () => null }));
vi.mock('../fase1/TrechosManualModal', () => ({ TrechosManualModal: () => null }));
vi.mock('../ShortcutsHelpModal', () => ({ ShortcutsHelpModal: () => null }));
vi.mock('@/components/ui/confirm-dialog', async (original) => ({
  ...(await original<typeof import('@/components/ui/confirm-dialog')>()),
  ConfirmDialog: () => null,
}));
vi.mock('@/features/editor/CommonTopBar', () => ({ ReadingModal: () => null }));
vi.mock('@/features/metadata/MetadadosDoCorteModal', () => ({
  statusMinimo: (c: Corte) => ({ corte_id: c.id }),
  MetadadosDoCorteModal: (props: unknown) => {
    h.modalDeMetadados.push(props);
    return null;
  },
}));

const corteDe = (id: string, numero: number, status = 'aprovado') =>
  ({
    id,
    numero,
    projeto_id: 'p1',
    titulo_proposto: `Corte ${id}`,
    status,
    inicio_seg: numero * 600,
    inicio_hms: '00:10:00',
    fim_seg: numero * 600 + 300,
    fim_hms: '00:15:00',
    desvios: [],
    motivo_riscado: [],
  }) as unknown as Corte;
const CORTES = [corteDe('a', 1), corteDe('b', 2, 'rejeitado'), corteDe('c', 3, 'proposto')];

// O hook da página devolve o estado de um corte aberto; o que a página não usa aqui
// vira uma mutação vazia.
vi.mock('../useEditorPage', () => {
  const mutacao = () => Object.assign(vi.fn(), { mutate: vi.fn(), isPending: false, data: undefined });
  const estado: Record<string, unknown> = {
    projetoId: 'p1',
    corteId: 'a',
    corte: CORTES[0],
    corteUI: CORTES[0],
    cortes: CORTES,
    corteQuery: { isLoading: false, isError: false },
    cortesQuery: { isLoading: false, isError: false },
    projeto: { data: { titulo_live: 'Live 267', duracao_segundos: 3600 } },
    contextoCorte: { antesSeg: 0, depoisSeg: 0 },
    waveformWindowRef: { current: null },
    waveformRefreshKey: 0,
    statusBruto: { data: undefined },
    exportStatusQ: { data: { cortes: [] } },
    brutoStatusAtual: 'idle',
    brutoMutationPendenteNoCorteAtual: false,
    brutoPronto: true,
    isDirty: false,
    liquidoSeg: 280,
    currentTime: 0,
    intervaloAberto: false,
    previousCut: null,
    nextCut: null,
    riscar: { riscarCorte: vi.fn(), bloqueio: null },
    confirmacao: { pedido: null, cancelar: vi.fn(), confirmar: vi.fn() },
    qc: { invalidateQueries: vi.fn() },
  };
  return { useEditorPage: () => new Proxy(estado, { get: (alvo, k: string) => (k in alvo ? alvo[k] : mutacao()) }) };
});

const { EditorPage } = await import('../EditorPage');
const { BancadaChrome } = await import('../BancadaChrome');

function desenharEditor() {
  h.publicado = null;
  const html = renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <EditorPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { html, chrome: h.publicado! };
}

const itensDoMais = (chrome: Chrome) => chrome.acoes?.find((a) => a.texto === 'Mais')?.menu ?? [];

let limpar: (() => Promise<void>) | null = null;
afterEach(async () => {
  await limpar?.();
  limpar = null;
  h.modalDeMetadados = [];
});

describe('a tela do editor troca de corte pelo mapa, sem a lista lateral', () => {
  it('o cabeçalho do corte com o mapa compacto está na tela', () => {
    const { html } = desenharEditor();
    expect(html).toContain('data-parte="cabecalho-do-corte"');
    expect(html).toMatch(/<nav[^>]*aria-label="Mapa da live"[^>]*data-tamanho="mini"/);
    expect(html).toMatch(/data-corte="a"[^>]*aria-current="true"/);
    expect(html).toContain('Corte 1 de 2 · Live 267');
    // A duração da live chega ao mapa: o corte de 10:00 nasce a 1/6 da pista de 1 h.
    expect(html).toMatch(/data-corte="a"[^>]*style="--inicio:16.67%/);
  });

  it('a casca não recebe a lista lateral, mas recebe o `atual` do J/K', () => {
    const { chrome } = desenharEditor();
    expect(chrome.lista).toBeUndefined();
    expect(chrome.atual?.onProximo).toBeTypeOf('function');
  });
});

describe('"Editar metadados deste corte" no menu ⋯ do editor', () => {
  it('o editor leva o item ao Mais, depois do gerar bruto, e a barra segue com uma primária', () => {
    const { chrome } = desenharEditor();
    expect(itensDoMais(chrome).map((i) => i.label)).toEqual(['Regerar bruto', 'Editar metadados deste corte']);
    // O ícone do conceito "editar" (D-858): o mesmo lápis de toda ação de editar do app.
    expect(itensDoMais(chrome)[1].icon).toBe(ICONE_DO_CONCEITO.editar);
    expect(itensDoMais(chrome)[1].danger).toBeFalsy();
  });

  it('o item abre o modal de metadados do corte aberto', async () => {
    let chrome: Chrome | null = null;
    function Sonda() {
      const elemento = (
        <BancadaChrome
          projetoId="p1"
          tituloLive="Live"
          cortes={CORTES}
          corte={CORTES[0]}
          exportStatus={[]}
          caminhoDoCorte={(c) => `/projetos/p1/cortes/${c.id}?fase=1`}
          sub=""
          fire={false}
          sujo={false}
          salvando={false}
          brutoPronto
          brutoOcupado={false}
          onToggleFire={vi.fn()}
          onAprovar={vi.fn()}
          semLista
        />
      );
      return elemento;
    }
    const tela = montar(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <Sonda />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    limpar = tela.limpar;
    await assentar();
    chrome = h.publicado;
    expect(h.modalDeMetadados).toHaveLength(0);
    itensDoMais(chrome!).find((i) => i.label === 'Editar metadados deste corte')!.onClick!();
    await assentar();
    expect(h.modalDeMetadados.at(-1)).toMatchObject({ projetoId: 'p1', corte: { id: 'a' } });
  });

  it('fora do editor (sem `semLista`, a Pós e a Revisão), o Mais não ganha o item', () => {
    h.publicado = null;
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <BancadaChrome
            projetoId="p1"
            tituloLive="Live"
            cortes={CORTES}
            corte={CORTES[0]}
            exportStatus={[]}
            caminhoDoCorte={(c) => `/c/${c.id}`}
            sub=""
            fire={false}
            sujo={false}
            salvando={false}
            brutoPronto
            brutoOcupado={false}
            onToggleFire={vi.fn()}
            onAprovar={vi.fn()}
          />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(h.publicado!.acoes ?? []).toEqual([]);
  });
});
