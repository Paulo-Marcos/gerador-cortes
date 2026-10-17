import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SEM_CAIXA, TiposDeCard, tiposQueODesenha, type CardsEditaveis } from '@/features/channels/CardsDoCanal';
import { cardsDoPreset, cardsMudaram, mudouDesdeOPreset } from '../mudancasDoPreset';

// D-951: o card do vídeo cheio no modal de posição — sempre à vista, ligado ao
// preset, e as cenas que o estilo limpo não desenha.

const cards = (over: Partial<CardsEditaveis> = {}): CardsEditaveis => ({
  ocultos: [],
  escala: 1,
  posicao: { automatica: true, x: 96, y: 112 },
  ajuste: 'preencher',
  alinhamento_vertical: 'centro',
  alinhamento_horizontal: 'centro',
  ...over,
});

const base = {
  configOriginal: { telas: 2 },
  configMudou: () => false,
  extras: {},
  fundo: 'hud',
  placa: { nome: '', papel: '' },
};

describe('a posição dos cards entra no preset (D-951)', () => {
  it('mover os cards acende "Atualizar preset"', () => {
    const doPreset = cards();
    const movido = cards({ posicao: { automatica: false, x: 400, y: 300 } });
    expect(mudouDesdeOPreset({ ...base, cards: { doPreset, atuais: doPreset } })).toBe(false);
    expect(mudouDesdeOPreset({ ...base, cards: { doPreset, atuais: movido } })).toBe(true);
  });

  it('esticar a caixa do cheio também conta', () => {
    const comCaixa = cards({ zona_no_cheio: { x: 96, y: 300, w: 760, h: 420 } });
    expect(cardsMudaram(comCaixa, cards({ zona_no_cheio: { x: 96, y: 300, w: 900, h: 420 } }))).toBe(true);
  });

  it('o "sem caixa" da edição vale o mesmo que nenhuma caixa', () => {
    expect(cardsMudaram(cards({ zona_no_cheio: null }), cards({ zona_no_cheio: SEM_CAIXA }))).toBe(false);
  });

  it('a ordem dos tipos escondidos não é mudança', () => {
    expect(cardsMudaram(cards({ ocultos: ['enfase', 'lista_enumerada'] }), cards({ ocultos: ['lista_enumerada', 'enfase'] }))).toBe(false);
  });

  it('o preset antigo, sem palco, compara com os cards que estão salvos', () => {
    const salvos = cards({ escala: 1.2 });
    expect(cardsDoPreset({ compartilhada: {} }, salvos)).toBe(salvos);
    expect(cardsDoPreset({ palco: { cards: cards() } }, salvos)).toEqual(cards());
  });

  it('sem preset selecionado nada acende', () => {
    expect(mudouDesdeOPreset({ ...base, configOriginal: null, cards: { doPreset: cards(), atuais: cards({ escala: 2 }) } })).toBe(false);
  });
});

describe('o card de exemplo fica sempre na prévia (D-951)', () => {
  it('não depende mais de estar no grupo Cards', () => {
    const fonte = readFileSync('src/features/editor/fase2/PosicionamentoModal.tsx', 'utf-8');
    expect(fonte).toContain('exemplo={exemplo && palco.componentes ?');
    expect(fonte).not.toContain("exemplo={grupoAtivo === 'cards'");
  });
});

describe('a tela cheia não existe no limpo (D-951)', () => {
  const tipos = [
    { id: 'tela_cheia', nome: 'Tela cheia (tese)' },
    { id: 'chamada_final', nome: 'Chamada final' },
  ];

  it('no limpo ela fica desligada e diz por quê', () => {
    const html = renderToStaticMarkup(<TiposDeCard valor={cards()} tipos={tipos} onMudar={vi.fn()} limpo />);
    expect(html).toContain('(não existe no limpo)');
    expect(html.match(/disabled=""/g)).toHaveLength(1);
  });

  it('o card de exemplo da prévia não oferece a tese no limpo', () => {
    expect(tiposQueODesenha(tipos, true).map((t) => t.id)).toEqual(['chamada_final']);
    expect(tiposQueODesenha(tipos, false)).toEqual(tipos);
  });

  it('no estilo de sempre ela continua como era', () => {
    const html = renderToStaticMarkup(<TiposDeCard valor={cards()} tipos={tipos} onMudar={vi.fn()} />);
    expect(html).not.toContain('(não existe no limpo)');
    expect(html).not.toContain('disabled=""');
  });
});
