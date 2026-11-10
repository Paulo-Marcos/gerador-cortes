import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// D-1089: o "+ Trecho no cursor" da aba Decisões é o MESMO gesto do "trecho aqui" da
// linha do tempo (`adicionarTrechoAqui`, useEditorPage). O botão antigo do painel
// criava 00:00–00:05 fixo; este teste fixa o último fio: trocar a função que a tela
// entrega ao painel, ou deixar de entregá-la, derruba aqui.

const recebidos = vi.hoisted(() => ({ painel: [] as unknown[], linhaDoTempo: [] as unknown[] }));

vi.mock('../fase1/PlayerPanel', () => ({ PlayerPanel: () => null }));
vi.mock('../fase1/TimelinePanel', () => ({
  TimelinePanel: (props: { onAdicionarTrechoAqui?: () => void }) => {
    recebidos.linhaDoTempo.push(props.onAdicionarTrechoAqui);
    return null;
  },
}));
vi.mock('../fase1/RightTabsPanel', () => ({
  RightTabsPanel: (props: { onAdicionarTrechoAqui?: () => void }) => {
    recebidos.painel.push(props.onAdicionarTrechoAqui);
    return null;
  },
}));

const { EditorFase1 } = await import('../fase1/EditorFase1');

describe('D-1089 · o "+ Trecho no cursor" chega ao painel', () => {
  it('o painel recebe o mesmo "trecho aqui" que a linha do tempo', () => {
    const adicionarTrechoAqui = vi.fn();
    const props = {
      corte: { id: 'c1', inicio_seg: 0, fim_seg: 60, desvios: [] },
      brutoPronto: true,
      pending: {},
      onAdicionarTrechoAqui: adicionarTrechoAqui,
    } as unknown as Parameters<typeof EditorFase1>[0];

    renderToStaticMarkup(<EditorFase1 {...props} />);

    expect(recebidos.painel).toEqual([adicionarTrechoAqui]);
    expect(recebidos.linhaDoTempo).toEqual([adicionarTrechoAqui]);
  });
});
