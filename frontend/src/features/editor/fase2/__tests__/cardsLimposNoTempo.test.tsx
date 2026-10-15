import { Thumbnail } from '@remotion/player';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstiloDasCenasProvider, FrameOffsetContext, renderCenaV2 } from '@video-renderer/public-api';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import type { CenaRemotion } from '@/types/models';

// D-926: no estilo limpo, um card que começa depois da própria duração sumia
// da prévia do editor (e do Studio). Lá não há `<Sequence>`: o quadro é o do
// vídeo inteiro, e o limpo contava a cena a partir do quadro 0 do vídeo. Este
// teste desenha o card como a prévia desenha — offset 0, relógio global.

const FPS = 30;
const DEFINICAO = {
  tipo: 'definicao_termo',
  inicio: 77.4,
  fim: 83.4,
  texto: 'Mitologia de esquerda universitária',
  subtexto: 'Expressão usada pelo apresentador',
  contexto: 'A imagem romântica do militante batendo de porta em porta.',
} as unknown as CenaRemotion;

function desenharNoQuadro(estilo: 'limpo' | 'atual', segundos: number): string {
  const estiloCenas = estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo });
  function Previa() {
    return (
      <EstiloDasCenasProvider valor={estiloCenas}>
        <FrameOffsetContext.Provider value={0}>{renderCenaV2(DEFINICAO)}</FrameOffsetContext.Provider>
      </EstiloDasCenasProvider>
    );
  }
  return renderToStaticMarkup(
    <Thumbnail
      component={Previa}
      compositionWidth={1920}
      compositionHeight={1080}
      frameToDisplay={Math.round(segundos * FPS)}
      durationInFrames={Math.round(90 * FPS)}
      fps={FPS}
    />,
  );
}

describe('card do estilo limpo no meio do corte (D-926)', () => {
  it('aparece na prévia quando a cena está no ar', () => {
    expect(desenharNoQuadro('limpo', 79)).toContain('Mitologia de esquerda universitária');
  });

  it('some depois que a cena acaba', () => {
    expect(desenharNoQuadro('limpo', 84.5)).not.toContain('Mitologia de esquerda universitária');
  });

  it('o estilo de sempre continua aparecendo no mesmo quadro', () => {
    expect(desenharNoQuadro('atual', 79)).toContain('Mitologia de esquerda universitária');
  });
});
