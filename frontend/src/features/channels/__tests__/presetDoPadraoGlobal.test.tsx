import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PalcoComponentes, PalcoComponentesEdicao } from '../api/canais';
import { usePalcoDoModal } from '../usePalcoDoModal';

// D-981 · o padrão global do pós dizia "Preset: FULL", mas os cards do corte
// saíam desconfigurados. O "Aplicar" do modal global gravava só a geometria;
// o palco do preset (a posição e a zona dos cards) era jogado fora, e o corte
// seguia com os cards do canal. O palco global é o do canal: é lá que grava.
//
// O render de servidor não roda efeitos: aqui roda o React DOM de verdade.

const gravarNoCanal = vi.fn();
const gravarNoEscopo = vi.fn();

function palco(cards: PalcoComponentes['cards']): PalcoComponentes {
  return {
    canal_id: 'default',
    estilo: 'atual',
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

const doCanal = palco({ ocultos: [], escala: 1, posicao: { automatica: true, x: 96, y: 112 } });
const cardsDoFull = {
  ocultos: [],
  escala: 1,
  posicao: { automatica: false, x: 23, y: 209 },
  zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 },
};

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('../palcoDoEscopo', () => ({
  usePalcoDoEscopo: () => ({ data: { efetivo: doCanal, origem: 'canal' } }),
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
let modal: ReturnType<typeof usePalcoDoModal>;
const global = globalThis as Record<string, unknown>;

const assentar = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function Sonda() {
  modal = usePalcoDoModal({ tipo: 'horizontal', projetoId: 'p1', corteId: 'c1', alvo: 'global', aberto: true });
  return null;
}

beforeEach(() => {
  gravarNoCanal.mockClear();
  gravarNoEscopo.mockClear();
  global.window = globalThis;
  global.document = vazio();
  global.HTMLIFrameElement = class {};
  global.IS_REACT_ACT_ENVIRONMENT = false;
  raiz = createRoot({ ...vazio(), ownerDocument: global.document } as unknown as HTMLElement);
});

afterEach(() => {
  raiz.unmount();
});

describe('preset aplicado no padrão global do pós (D-981)', () => {
  it('o Aplicar grava no canal os cards que o preset traz', async () => {
    raiz.render(<Sonda />);
    await assentar();
    modal.dePreset({ cards: cardsDoFull });
    await assentar();
    modal.aplicar();

    expect(gravarNoEscopo).not.toHaveBeenCalled();
    expect(gravarNoCanal).toHaveBeenCalledTimes(1);
    const [{ canalId, edicao }] = gravarNoCanal.mock.calls[0] as [{ canalId: string; edicao: PalcoComponentesEdicao }];
    expect(canalId).toBe('default');
    expect(edicao.cards).toMatchObject({
      posicao: { automatica: false, x: 23, y: 209 },
      zona_no_cheio: { x: 38, y: 225, w: 395, h: 732 },
    });
  });
});
