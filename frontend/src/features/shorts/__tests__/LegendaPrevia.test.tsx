import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { LegendaPrevia } from '../LegendaPrevia';
import { lugarEfetivo, POSICAO_Y_PADRAO } from '../previaLegenda';
import type { PalavraTranscrita } from '../shortsApi';

// D-605: a prévia é a PROVA de onde a legenda vai sair, então a geometria dela
// precisa de guarda própria. O teste de `previaLegenda` cuida da cascata (que
// número vale); este cuida da tradução daquele número em CSS — e é exatamente aí
// que uma inversão de eixo passa despercebida, porque o tipo é `number` dos dois
// lados e nada quebra: a legenda só aparece no lugar errado no arquivo.

const palavras: PalavraTranscrita[] = [
  { texto: 'ninguem', inicio_seg: 10, fim_seg: 10.4 },
  { texto: 'te', inicio_seg: 10.4, fim_seg: 10.6 },
  { texto: 'conta', inicio_seg: 10.6, fim_seg: 11 },
  { texto: 'isso', inicio_seg: 11, fim_seg: 11.4 },
];

function desenhar(lugar?: { x: number; y: number; largura: number }) {
  return renderToStaticMarkup(
    <LegendaPrevia
      palavras={palavras}
      inicioSeg={10}
      fimSeg={40}
      tempoAtualSeg={10.5}
      lugar={lugar}
    />,
  );
}

describe('onde a legenda e desenhada', () => {
  it('sem lugar, cai no rodape de sempre — a base no alto da safe zone', () => {
    const html = desenhar();

    // `bottom` vem de `100 - y`: com a base em 82% do topo, sobram 18% embaixo,
    // que é o `height * SAFE_ZONE` que o renderer sempre usou.
    expect(html).toContain('bottom:18%');
    expect(100 - POSICAO_Y_PADRAO).toBe(18);
    expect(html).toContain('left:50%');
    expect(html).toContain('width:80%');
  });

  it('com lugar proprio, desenha nele', () => {
    const html = desenhar(lugarEfetivo({ x: 30, y: 45, largura: 60 }, null));

    expect(html).toContain('left:30%');
    expect(html).toContain('bottom:55%');
    expect(html).toContain('width:60%');
  });

  it('a palavra corrente sai realcada e o resto branco', () => {
    // A legenda é o conteúdo (85% assiste no mudo), e é o realce que faz o olho
    // seguir em vez de reler. Mover a caixa não pode custar isso.
    const html = desenhar();

    expect(html).toContain('ninguem');
    expect(html).toContain('#ffffff');
  });

  it('sem arraste e sem pagina, nao desenha nada', () => {
    const html = renderToStaticMarkup(
      <LegendaPrevia palavras={palavras} inicioSeg={10} fimSeg={40} tempoAtualSeg={30} />,
    );

    expect(html).toBe('');
  });

  it('em modo arraste a caixa sobrevive ao silencio da fala', () => {
    // Sem isto, a legenda sumiria da mão do operador no primeiro trecho sem
    // palavra — e ele perderia o que estava posicionando no meio do gesto.
    const html = renderToStaticMarkup(
      <LegendaPrevia
        palavras={palavras}
        inicioSeg={10}
        fimSeg={40}
        tempoAtualSeg={30}
        onMover={vi.fn()}
      />,
    );

    expect(html).toContain('cursor-grab');
    expect(html).toContain('min-height');
  });

  it('sem onMover a previa continua passiva — nada de agarrar', () => {
    // É esta prévia que desenha no card e no player, onde um arraste sem querer
    // seria uma edição silenciosa.
    expect(desenhar()).not.toContain('cursor-grab');
  });
});
