import { Thumbnail } from '@remotion/player';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstiloDasCenasProvider, FrameOffsetContext, renderCenaV2 } from '@video-renderer/public-api';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import type { CenaRemotion } from '@/types/models';

// D-965: o contraponto no vídeo cheio com caixa segue o formato da caixa — numa
// caixa em pé, um lado em cima do outro, como já fazia na zona da compartilhada.

// O Bloco já é coluna por dentro: o que importa é a direção da dupla de lados.
const EMPILHADO = 'display:flex;flex-direction:column;gap:20px;align-items:flex-start';
const LADO_A_LADO = 'display:flex;flex-direction:row;gap:40px;align-items:flex-start';

const CENA = {
  tipo: 'comparativo_contraponto',
  inicio: 0,
  fim: 5,
  rotuloA: 'Lucra com o dólar alto',
  texto: 'Máquina exportadora',
  rotuloB: 'Quebra com a mesma economia',
  subtexto: 'Lojinha de hambúrguer',
} as unknown as CenaRemotion;

function desenhar(caixa: { x: number; y: number; w: number; h: number }) {
  const cards = { ...COMPONENTES_PADRAO.cards, zona_no_cheio: caixa };
  const estiloCenas = estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo', cards });
  function Previa() {
    return (
      <EstiloDasCenasProvider valor={estiloCenas}>
        <FrameOffsetContext.Provider value={0}>{renderCenaV2(CENA)}</FrameOffsetContext.Provider>
      </EstiloDasCenasProvider>
    );
  }
  return renderToStaticMarkup(
    <Thumbnail component={Previa} compositionWidth={1920} compositionHeight={1080} frameToDisplay={45} durationInFrames={150} fps={30} />,
  );
}

describe('contraponto na caixa do vídeo cheio (D-965)', () => {
  it('numa caixa em pé, empilha os dois lados', () => {
    const html = desenhar({ x: 60, y: 200, w: 420, h: 760 });
    expect(html).toContain('left:60px;top:200px;width:420px;height:760px');
    expect(html).toContain(EMPILHADO);
    expect(html).not.toContain(LADO_A_LADO);
  });

  it('numa caixa deitada, continua lado a lado', () => {
    const html = desenhar({ x: 96, y: 600, w: 1200, h: 380 });
    expect(html).toContain(LADO_A_LADO);
    expect(html).not.toContain(EMPILHADO);
  });
});
