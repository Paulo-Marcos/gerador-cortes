import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PalcoComponentes, PalcoComponentesEdicao } from '../api/canais';
import { useAplicarPalcoDoPreset, usePalcoDoModal } from '../usePalcoDoModal';

// D-985 · mesmo depois da D-981 os cards só ficavam certos abrindo o modal,
// escolhendo o preset e clicando em Aplicar. Dois furos:
// 1. o atalho "Definir ▾ → preset" da escada gravava as telas, o fundo e a
//    placa, mas deixava o palco (os cards) do preset para trás;
// 2. um preset do Compartilhado trazia a posição dos cards no vídeo cheio
//    (sem caixa, automática) e desarrumava os cortes em Full do mesmo nível —
//    no compartilhado os cards moram na zona do layout, não nessa posição.
//
// O render de servidor não roda efeitos: aqui roda o React DOM de verdade.

const gravarNoCanal = vi.fn();
const gravarNoEscopo = vi.fn();

function palco(cards: PalcoComponentes['cards']): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo: 'limpo',
    estilos: ['atual', 'limpo'],
    fundo: 'reticula-aurora',
    fundos: ['reticula-aurora'],
    cabecalho: {
      ativo: true,
      nome: '',
      handle: '',
      imagem: '',
      nome_efetivo: 'Seu Canal',
      handle_efetivo: '@seucanal',
      imagem_url: '',
      escala: 1,
      posicao: { automatica: true, x: 0, y: 0 },
      posicao_short: { automatica: true, x: 0, y: 0 },
      mostrar_imagem: true,
      mostrar_nome: true,
      mostrar_handle: true,
    },
    placa: { ativo: true, escala: 1, posicao: { automatica: true, x: 0, y: 0 } },
    contorno_short: 32,
    fundo_short: 'palco',
    fundos_do_short: ['palco'],
    estilo_da_legenda: 'contorno',
    estilos_da_legenda: ['contorno'],
    cards,
    tipos_de_cena: [],
  };
}

const cardsDoFull = {
  ocultos: [],
  escala: 1,
  posicao: { automatica: false, x: 23, y: 209 },
  zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 },
};
const cardsDoCompartilhado = {
  ocultos: ['conceito'],
  escala: 1,
  posicao: { automatica: true, x: 96, y: 112 },
  zona_no_cheio: null,
};
const automaticos = { ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } };

// O canal ainda sem os cards do Full; o projeto e o corte já com eles.
const doCanal = palco(automaticos);
const comFull = palco(cardsDoFull);

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../palcoDoEscopo', () => ({
  usePalcoDoEscopo: () => ({ data: { efetivo: comFull, origem: 'projeto' } }),
  useGravarPalcoDoEscopo: () => ({ mutate: gravarNoEscopo, isPending: false }),
}));
vi.mock('../useChannels', () => ({
  usePalcoDoCanalAtivo: () => ({ data: doCanal }),
  useGravarPalco: () => ({ mutate: gravarNoCanal, isPending: false }),
}));

const vazio = () => ({
  nodeType: 1,
  nodeName: 'DIV',
  tagName: 'DIV',
  namespaceURI: 'http://www.w3.org/1999/xhtml',
  childNodes: [],
  firstChild: null,
  addEventListener() {},
  removeEventListener() {},
});

let raiz: Root;
let aplicarDoPreset: ReturnType<typeof useAplicarPalcoDoPreset>;
let modal: ReturnType<typeof usePalcoDoModal>;
const global = globalThis as Record<string, unknown>;

const assentar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function Sonda() {
  aplicarDoPreset = useAplicarPalcoDoPreset('p1', 'c1');
  modal = usePalcoDoModal({ tipo: 'horizontal', projetoId: 'p1', corteId: 'c1', alvo: 'projeto', aberto: true });
  return null;
}

const componentesGravados = () =>
  (gravarNoEscopo.mock.calls[0] as [{ componentes: PalcoComponentesEdicao }])[0].componentes;

beforeEach(async () => {
  gravarNoCanal.mockClear();
  gravarNoEscopo.mockClear();
  global.window = globalThis;
  global.document = vazio();
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  raiz = createRoot({ ...vazio(), ownerDocument: global.document } as unknown as HTMLElement);
  raiz.render(<Sonda />);
  await assentar();
});

afterEach(() => {
  raiz.unmount();
});

describe('o atalho Definir ▾ → preset leva os cards (D-985)', () => {
  it('no projeto, grava os cards do preset Full no palco do projeto', () => {
    aplicarDoPreset('projeto', { cards: cardsDoFull }, 'full');
    expect(gravarNoEscopo).toHaveBeenCalledTimes(1);
    const [corpo] = gravarNoEscopo.mock.calls[0] as [{ escopo: string; projeto_id: string; corte_id: string | null }];
    expect(corpo).toMatchObject({ escopo: 'projeto', projeto_id: 'p1', corte_id: null });
    expect(componentesGravados().cards).toMatchObject({ zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 } });
  });

  it('no global, grava os cards do preset no canal', () => {
    aplicarDoPreset('global', { cards: cardsDoFull }, 'full');
    expect(gravarNoEscopo).not.toHaveBeenCalled();
    const [{ canalId, edicao }] = gravarNoCanal.mock.calls[0] as [{ canalId: string; edicao: PalcoComponentesEdicao }];
    expect(canalId).toBe('default');
    expect(edicao.cards).toMatchObject({ posicao: { automatica: false, x: 23, y: 209 } });
  });

  it('preset antigo, sem palco, não grava nada', () => {
    aplicarDoPreset('corte', undefined, 'full');
    expect(gravarNoEscopo).not.toHaveBeenCalled();
    expect(gravarNoCanal).not.toHaveBeenCalled();
  });
});

describe('preset do Compartilhado não mexe nos cards do Full (D-985)', () => {
  it('pelo atalho: a caixa e a posição do cheio ficam; o que se esconde vem do preset', () => {
    aplicarDoPreset('projeto', { estilo: 'atual', cards: cardsDoCompartilhado }, 'compartilhada');
    const componentes = componentesGravados();
    expect(componentes.estilo).toBe('atual');
    expect(componentes.cards).toMatchObject({
      posicao: { automatica: false, x: 23, y: 209 },
      zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 },
      ocultos: ['conceito'],
    });
  });

  it('pelo modal: o Aplicar mantém a caixa e a posição do cheio', async () => {
    modal.dePreset({ cards: cardsDoCompartilhado }, 'compartilhada');
    await assentar();
    modal.aplicar();
    expect(componentesGravados().cards).toMatchObject({
      posicao: { automatica: false, x: 23, y: 209 },
      zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 },
    });
  });
});
