import { Thumbnail } from '@remotion/player';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstiloDasCenasProvider, FrameOffsetContext, renderCenaV2 } from '@video-renderer/public-api';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import type { CenaRemotion } from '@/types/models';

// D-1104: o comparativo lado a lado divide a largura da caixa entre os dois
// lados. Antes, cada lado recebia a largura inteira e o card dobrava.

const CENA = {
  tipo: 'comparativo_contraponto',
  inicio: 0,
  fim: 5,
  texto: 'Estado laico',
  subtexto: 'Estado confessional',
  rotuloA: 'Lado A',
  rotuloB: 'Lado B',
} as unknown as CenaRemotion;

const CAIXA_LARGA = { x: 96, y: 300, w: 1100, h: 480 };
const CAIXA_EM_PE = { x: 96, y: 100, w: 600, h: 900 };

function larguras(html: string): number[] {
  return [...html.matchAll(/display:flex;gap:28px;width:(\d+)px/g)].map((m) => Number(m[1]));
}

function desenhar(caixa: typeof CAIXA_LARGA) {
  const cards = { ...COMPONENTES_PADRAO.cards, ajuste: 'preencher' as const, zona_no_cheio: caixa };
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

describe('comparativo na caixa larga (D-1104)', () => {
  it('lado a lado, os dois lados somam a largura da caixa, não o dobro', () => {
    const daCaixa = Math.round(CAIXA_LARGA.w * 0.92);
    const [a, b] = larguras(desenhar(CAIXA_LARGA));
    // Dois lados + gap de 40 de cada lado do "vs" + o "vs" cabem na largura da caixa.
    expect(a).toBe(b);
    expect(a * 2 + 80).toBeLessThan(daCaixa);
    expect(a * 2 + 80 + 40).toBeGreaterThan(daCaixa - 1);
  });

  it('empilhado (caixa em pé), cada lado leva a largura inteira', () => {
    const daCaixa = Math.round(CAIXA_EM_PE.w * 0.92);
    expect(larguras(desenhar(CAIXA_EM_PE))).toEqual([daCaixa, daCaixa]);
  });

  it('sem pedido de largura (tamanho natural), cada lado fica nos 420 de sempre', () => {
    const cards = { ...COMPONENTES_PADRAO.cards, ajuste: 'natural' as const, zona_no_cheio: CAIXA_LARGA };
    const estiloCenas = estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo', cards });
    const Previa = () => (
      <EstiloDasCenasProvider valor={estiloCenas}>
        <FrameOffsetContext.Provider value={0}>{renderCenaV2(CENA)}</FrameOffsetContext.Provider>
      </EstiloDasCenasProvider>
    );
    const html = renderToStaticMarkup(
      <Thumbnail component={Previa} compositionWidth={1920} compositionHeight={1080} frameToDisplay={45} durationInFrames={150} fps={30} />,
    );
    expect(larguras(html)).toEqual([420, 420]);
  });
});
