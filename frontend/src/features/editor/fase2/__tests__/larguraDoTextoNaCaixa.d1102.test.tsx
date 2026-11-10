import { Thumbnail } from '@remotion/player';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstiloDasCenasProvider, FrameOffsetContext, renderCenaV2 } from '@video-renderer/public-api';
import { COMPONENTES_PADRAO, estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import type { CenaRemotion } from '@/types/models';

// D-1102 (achado da auditoria): a largura do texto também manda na caixa do vídeo
// cheio — o caminho do CardNaCaixa; o da zona dos cards está em larguraDoTexto.d1102.

const CENA_CHEIA = {
  tipo: 'citacao_autor',
  inicio: 0,
  fim: 5,
  texto: 'O homem está condenado a ser livre.',
  autor: 'Sartre',
} as unknown as CenaRemotion;
const CAIXA = { x: 96, y: 300, w: 1100, h: 480 };

function desenharNaCaixa(ajuste: 'preencher' | 'natural', largura_do_texto: number) {
  const cards = { ...COMPONENTES_PADRAO.cards, ajuste, largura_do_texto, zona_no_cheio: CAIXA };
  const estiloCenas = estiloDasCenasDe({ ...COMPONENTES_PADRAO, estilo: 'limpo', cards });
  function Previa() {
    return (
      <EstiloDasCenasProvider valor={estiloCenas}>
        <FrameOffsetContext.Provider value={0}>{renderCenaV2(CENA_CHEIA)}</FrameOffsetContext.Provider>
      </EstiloDasCenasProvider>
    );
  }
  return renderToStaticMarkup(
    <Thumbnail component={Previa} compositionWidth={1920} compositionHeight={1080} frameToDisplay={45} durationInFrames={150} fps={30} />,
  );
}

describe('largura do texto na caixa do cheio (D-1102)', () => {
  it('a largura pedida vence a da caixa — também no tamanho natural', () => {
    const daCaixa = Math.round(CAIXA.w * 0.92); // "ocupar o espaço" sem pedido: a largura da caixa
    expect(desenharNaCaixa('preencher', 0)).toContain(`width:${daCaixa}px`);
    const pedido = desenharNaCaixa('preencher', 700);
    expect(pedido).toContain('width:700px');
    expect(pedido).not.toContain(`width:${daCaixa}px`);
    expect(desenharNaCaixa('natural', 700)).toContain('width:700px');
    expect(desenharNaCaixa('natural', 0)).toContain('width:440px');
  });
});
