import { Thumbnail } from '@remotion/player';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstiloDasCenasProvider, FrameOffsetContext, SharedCardZoneFrame, renderCenaV2 } from '@video-renderer/public-api';
import { ModosDoCard, cardsEditaveisDe } from '@/features/channels/CardsDoCanal';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import type { CenaRemotion } from '@/types/models';

// D-926: o card do estilo limpo dentro da zona dos cards (compartilhada):
// sentado onde o canal escolheu, e a tela oferece os modos.

const ZONA = { x: 1180, y: 80, w: 680, h: 920 };
const CENA = {
  tipo: 'definicao_termo',
  inicio: 0,
  fim: 5,
  texto: 'Clericalismo',
  contexto: 'Doutrina que defende a influência do clero sobre o Estado.',
  layout_card: 'vertical',
  layout_youtube_modo: 'compartilhada',
  layout_card_zone: ZONA,
} as unknown as CenaRemotion;

function desenhar(alinhamento_vertical: 'topo' | 'centro' | 'base') {
  const cards = { ...COMPONENTES_PADRAO.cards, alinhamento_vertical };
  const estiloCenas = estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo', cards });
  function Previa() {
    return (
      <EstiloDasCenasProvider valor={estiloCenas}>
        <FrameOffsetContext.Provider value={0}>
          <SharedCardZoneFrame cena={CENA}>{renderCenaV2(CENA)}</SharedCardZoneFrame>
        </FrameOffsetContext.Provider>
      </EstiloDasCenasProvider>
    );
  }
  return renderToStaticMarkup(
    <Thumbnail component={Previa} compositionWidth={1920} compositionHeight={1080} frameToDisplay={45} durationInFrames={150} fps={30} />,
  );
}

describe('card limpo na zona dos cards (D-926)', () => {
  it('ocupa a zona inteira e senta no alinhamento escolhido', () => {
    const html = desenhar('centro');
    expect(html).toContain('left:1180px;top:80px;width:680px;height:920px');
    expect(html).toContain('align-items:center');
    expect(desenhar('base')).toContain('align-items:flex-end');
  });

  it('o padrão do canal no limpo é ocupar o espaço, no centro; o estilo de sempre não leva modo', () => {
    expect(estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo' })).toMatchObject({
      ajuste: 'preencher',
      alinhamento_vertical: 'centro',
      alinhamento_horizontal: 'centro',
    });
    expect(estiloDasCenasDe(COMPONENTES_PADRAO)).not.toHaveProperty('ajuste');
  });

  it('valor desconhecido do servidor vira o padrão na tela', () => {
    const cards = cardsEditaveisDe({ ...COMPONENTES_PADRAO.cards, ajuste: 'esticar', alinhamento_vertical: null });
    expect([cards.ajuste, cards.alinhamento_vertical]).toEqual(['preencher', 'centro']);
  });

  it('a tela oferece ajuste e alinhamentos', () => {
    const html = renderToStaticMarkup(
      <ModosDoCard valor={cardsEditaveisDe(COMPONENTES_PADRAO.cards)} onMudar={() => undefined} />,
    );
    for (const rotulo of ['Ocupar o espaço', 'Tamanho natural', 'Topo', 'Centro', 'Base', 'Esquerda', 'Direita']) {
      expect(html).toContain(rotulo);
    }
  });
});
