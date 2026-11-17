import { describe, expect, it } from 'vitest';
import { marcasDoMapa, posicaoNoMapa, tempoDaLive } from '../posicaoNoMapa';

// Os seis cortes de exemplo da DIRECAO (live de 2:41:00 = 9660 s; a conta bate com o
// MapaDaLive do Design System: corte 1 em 17,33% com 10,32% de largura, corte 2 de
// 0:53:26 a 1:11:38). Início e fim em segundos; o corte 4 não aparece no preview do
// Design System, então o intervalo dele aqui é o único dado inventado.
const DURACAO = 9660;
const CORTES = [
  { n: 1, inicio: 1674, fim: 2671, inicioPct: 17.33, larguraPct: 10.32 },
  { n: 2, inicio: 3206, fim: 4298, inicioPct: 33.19, larguraPct: 11.3 },
  { n: 3, inicio: 4873, fim: 5742, inicioPct: 50.45, larguraPct: 9 },
  { n: 4, inicio: 5760, fim: 6000, inicioPct: 59.63, larguraPct: 2.48 },
  { n: 5, inicio: 6018, fim: 6887, inicioPct: 62.3, larguraPct: 9 },
  { n: 6, inicio: 7728, fim: 8501, inicioPct: 80, larguraPct: 8 },
];

describe('posicaoNoMapa', () => {
  it.each(CORTES)('corte $n: começa em $inicioPct% e ocupa $larguraPct%', (c) => {
    const p = posicaoNoMapa(c.inicio, c.fim, DURACAO);
    expect(p).not.toBeNull();
    expect(p!.inicioPct).toBeCloseTo(c.inicioPct, 1);
    expect(p!.larguraPct).toBeCloseTo(c.larguraPct, 1);
  });

  it('arredonda a duas casas, para o CSS receber um número curto', () => {
    expect(posicaoNoMapa(1, 2, 3)).toEqual({ inicioPct: 33.33, larguraPct: 33.33 });
  });

  it('corte em 0: começa colado na borda esquerda', () => {
    expect(posicaoNoMapa(0, 966, DURACAO)).toEqual({ inicioPct: 0, larguraPct: 10 });
  });

  it('corte no fim: termina exatamente em 100%, sem passar da pista', () => {
    const p = posicaoNoMapa(8694, DURACAO, DURACAO)!;
    expect(p.inicioPct + p.larguraPct).toBeCloseTo(100, 5);
    // E um corte que "passa" do fim (dado sujo) é aparado em vez de estourar.
    const aparado = posicaoNoMapa(9000, 99999, DURACAO)!;
    expect(aparado.inicioPct + aparado.larguraPct).toBeCloseTo(100, 5);
  });

  it('corte que começa no último instante vira um ponto no fim (largura 0)', () => {
    expect(posicaoNoMapa(DURACAO, DURACAO, DURACAO)).toEqual({ inicioPct: 100, larguraPct: 0 });
  });

  it('fim antes do início não vira largura negativa', () => {
    expect(posicaoNoMapa(5000, 4000, DURACAO)!.larguraPct).toBe(0);
  });

  it('live sem duração: não há posição (null), nem para duração negativa ou NaN', () => {
    expect(posicaoNoMapa(10, 20, 0)).toBeNull();
    expect(posicaoNoMapa(10, 20, -5)).toBeNull();
    expect(posicaoNoMapa(10, 20, Number.NaN)).toBeNull();
    expect(posicaoNoMapa(10, 20, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('início não numérico cai no começo da live em vez de propagar NaN', () => {
    expect(posicaoNoMapa(Number.NaN, 966, DURACAO)).toEqual({ inicioPct: 0, larguraPct: 10 });
  });
});

describe('marcasDoMapa', () => {
  it('uma marca a cada 30 min, sem a do 0:00 nem a do fim', () => {
    const marcas = marcasDoMapa(DURACAO);
    expect(marcas.map((m) => m.seg)).toEqual([1800, 3600, 5400, 7200, 9000]);
    expect(marcas[0].pct).toBeCloseTo(18.63, 2);
    expect(marcas[4].pct).toBeCloseTo(93.17, 2);
  });

  it('live de exatamente 30 min não ganha marca (a do fim é a borda)', () => {
    expect(marcasDoMapa(1800)).toEqual([]);
  });

  it('live sem duração não tem marcas', () => {
    expect(marcasDoMapa(0)).toEqual([]);
    expect(marcasDoMapa(Number.NaN)).toEqual([]);
  });
});

describe('tempoDaLive', () => {
  it('mostra sempre a hora, como o mapa do Design System ("0:53:26")', () => {
    expect(tempoDaLive(3206)).toBe('0:53:26');
    expect(tempoDaLive(4298)).toBe('1:11:38');
    expect(tempoDaLive(9660)).toBe('2:41:00');
    expect(tempoDaLive(0)).toBe('0:00:00');
  });

  it('valor ruim vira 0:00:00 em vez de NaN', () => {
    expect(tempoDaLive(Number.NaN)).toBe('0:00:00');
    expect(tempoDaLive(-4)).toBe('0:00:00');
  });
});
