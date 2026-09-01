import { describe, expect, it } from 'vitest';
import {
  arrastar,
  diferenca,
  DURACAO_MINIMA_SEG,
  foraDaFaixaRecomendada,
  posicaoPct,
  segundoNoPonteiro,
} from '../linhaDoTempoShort';

const FAIXA = { left: 100, width: 800 };
const BRUTO_SEG = 600;

describe('segundoNoPonteiro', () => {
  it('o meio da faixa e a metade do bruto', () => {
    expect(segundoNoPonteiro(500, FAIXA, BRUTO_SEG)).toBe(300);
  });

  it('ponteiro que saiu pela esquerda encosta no zero, nao vira negativo', () => {
    // Acontece o tempo todo: durante o arraste o ponteiro passa da faixa.
    expect(segundoNoPonteiro(-40, FAIXA, BRUTO_SEG)).toBe(0);
  });

  it('ponteiro que saiu pela direita para no fim do bruto', () => {
    expect(segundoNoPonteiro(9999, FAIXA, BRUTO_SEG)).toBe(BRUTO_SEG);
  });

  it('faixa ainda sem largura nao quebra a tela', () => {
    // O primeiro render vem antes do layout.
    expect(segundoNoPonteiro(500, { left: 0, width: 0 }, BRUTO_SEG)).toBe(0);
  });
});

describe('posicaoPct', () => {
  it('converte o instante em porcentagem da faixa', () => {
    expect(posicaoPct(150, BRUTO_SEG)).toBe(25);
  });

  it('duracao desconhecida nao gera NaN no style', () => {
    expect(posicaoPct(150, 0)).toBe(0);
  });
});

describe('arrastar', () => {
  const bordas = { inicio: 100, fim: 140 };

  it('move a borda arrastada e deixa a outra parada', () => {
    expect(arrastar(bordas, 'inicio', 120, BRUTO_SEG)).toEqual({ inicio: 120, fim: 140 });
    expect(arrastar(bordas, 'fim', 200, BRUTO_SEG)).toEqual({ inicio: 100, fim: 200 });
  });

  it('o inicio nao atravessa o fim: para a um segundo dele', () => {
    // Sem isso as duas alcas se empilham e nao ha como pegar so uma de novo.
    expect(arrastar(bordas, 'inicio', 999, BRUTO_SEG)).toEqual({
      inicio: 140 - DURACAO_MINIMA_SEG,
      fim: 140,
    });
  });

  it('o fim nao atravessa o inicio', () => {
    expect(arrastar(bordas, 'fim', 0, BRUTO_SEG)).toEqual({
      inicio: 100,
      fim: 100 + DURACAO_MINIMA_SEG,
    });
  });

  it('nenhuma borda sai do arquivo', () => {
    expect(arrastar(bordas, 'inicio', -50, BRUTO_SEG).inicio).toBe(0);
    expect(arrastar(bordas, 'fim', BRUTO_SEG + 300, BRUTO_SEG).fim).toBe(BRUTO_SEG);
  });

  it('permite sair da faixa de 15-90s, porque o backend permite', () => {
    // `services/shorts.atualizar_short` valida contra o BRUTO de proposito: a
    // faixa disciplina a IA, nao o humano que assistiu ao trecho. Travar aqui
    // seria a tela inventando uma regra que a API nao tem.
    const longo = arrastar({ inicio: 0, fim: 40 }, 'fim', 300, BRUTO_SEG);

    expect(longo.fim).toBe(300);
  });
});

describe('foraDaFaixaRecomendada', () => {
  it('avisa no curto demais e no longo demais', () => {
    expect(foraDaFaixaRecomendada(9)).toBe(true);
    expect(foraDaFaixaRecomendada(120)).toBe(true);
  });

  it('cala a boca no que esta dentro, inclusive nas pontas', () => {
    expect(foraDaFaixaRecomendada(15)).toBe(false);
    expect(foraDaFaixaRecomendada(45)).toBe(false);
    expect(foraDaFaixaRecomendada(90)).toBe(false);
  });
});

describe('diferenca', () => {
  it('manda so o campo que mudou', () => {
    expect(diferenca({ inicio: 10, fim: 40 }, { inicio: 12, fim: 40 })).toEqual({ inicio: 12 });
  });

  it('arraste que nao moveu nada nao gasta um PATCH', () => {
    expect(diferenca({ inicio: 10, fim: 40 }, { inicio: 10, fim: 40 })).toBeNull();
  });

  it('diferenca abaixo do centesimo nao conta como mudanca', () => {
    // O ponteiro produz fracoes longas; o backend arredonda em 2 casas. Sem
    // isso, mover meio pixel geraria escrita que o banco descartaria.
    expect(diferenca({ inicio: 10, fim: 40 }, { inicio: 10.001, fim: 40 })).toBeNull();
  });

  it('arredonda o que manda, no mesmo passo do backend', () => {
    expect(diferenca({ inicio: 10, fim: 40 }, { inicio: 11.5678, fim: 40 })).toEqual({
      inicio: 11.57,
    });
  });
});
