import { Thumbnail } from '@remotion/player';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstiloDasCenasProvider, FrameOffsetContext, renderCenaV2 } from '@video-renderer/public-api';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import type { CenaRemotion } from '@/types/models';

// D-1104 × D-1102: a largura do texto pedida pelo canal (e não só a da caixa)
// também é dividida entre os dois lados do comparativo.

const CENA = {
  tipo: 'comparativo_contraponto',
  inicio: 0,
  fim: 5,
  texto: 'Estado laico',
  subtexto: 'Estado confessional',
} as unknown as CenaRemotion;
const CAIXA = { x: 96, y: 300, w: 1100, h: 480 };

function larguras(largura_do_texto: number): number[] {
  const cards = { ...COMPONENTES_PADRAO.cards, ajuste: 'preencher' as const, largura_do_texto, zona_no_cheio: CAIXA };
  const estiloCenas = estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo', cards });
  const Previa = () => (
    <EstiloDasCenasProvider valor={estiloCenas}>
      <FrameOffsetContext.Provider value={0}>{renderCenaV2(CENA)}</FrameOffsetContext.Provider>
    </EstiloDasCenasProvider>
  );
  const html = renderToStaticMarkup(
    <Thumbnail component={Previa} compositionWidth={1920} compositionHeight={1080} frameToDisplay={45} durationInFrames={150} fps={30} />,
  );
  return [...html.matchAll(/display:flex;gap:28px;width:(\d+)px/g)].map((m) => Number(m[1]));
}

describe('comparativo com largura do texto (D-1104)', () => {
  it('os dois lados cabem na largura pedida, não somam o dobro', () => {
    const [a, b] = larguras(900);
    expect(a).toBe(b);
    expect(a * 2 + 80).toBeLessThan(900);
    expect(a).toBeGreaterThan(300);
  });
});
