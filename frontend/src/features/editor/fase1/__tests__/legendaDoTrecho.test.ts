import { describe, expect, it } from 'vitest';
import { janelaDo, legendaEm, rotuloDo, trechoEm } from '../legendaDoTrecho';
import type { Desvio } from '@/types/models';

// D-511/D-514: a justificativa do trecho que vai ser removido.
//
// A D-511 mostrava tambem a fala recortada da transcricao, e a D-514 tirou: o
// operador ja esta OUVINDO a fala; o que ele nao sabia era por que aquele
// pedaco foi marcado. Os testes do recorte sairam junto — codigo que nao existe
// mais nao precisa de guarda.
//
// O que sobra e a fronteira do trecho, que ainda erra em silencio: um limite
// trocado faz a legenda aparecer sobre a fala vizinha, e o operador julga o
// corte pelo motivo errado.

const desvio = (inicio: string, fim: string, motivo = 'digressao'): Desvio => ({
  inicio_hms: inicio,
  fim_hms: fim,
  motivo,
});

const TRECHO = desvio('00:00:10.000', '00:00:20.000');

describe('trechoEm', () => {
  it('acha o trecho que contem o instante', () => {
    expect(trechoEm([TRECHO], 12)?.motivo).toBe('digressao');
  });

  it('o inicio entra e o fim NAO', () => {
    // Mesmo criterio do `findDesvioAtTime`, que ja governa o salto automatico.
    // Dois criterios diferentes fariam a legenda piscar meio quadro depois.
    expect(trechoEm([TRECHO], 10)).not.toBeNull();
    expect(trechoEm([TRECHO], 20)).toBeNull();
  });

  it('fora de qualquer trecho nao ha legenda', () => {
    expect(trechoEm([TRECHO], 25)).toBeNull();
  });

  it('lista vazia nao quebra', () => {
    expect(trechoEm([], 12)).toBeNull();
  });
});

describe('legendaEm', () => {
  it('mostra a justificativa do trecho', () => {
    expect(legendaEm([TRECHO], 12)?.texto).toBe('digressao');
  });

  it('o motivo vai INTEIRO, sem corte', () => {
    // O pedido que originou tudo isto: "tem um texto e fica pela metade".
    const longo = 'x'.repeat(300);

    expect(legendaEm([desvio('00:00:10.000', '00:00:20.000', longo)], 12)?.texto).toBe(longo);
  });

  it('fora de trecho nao ha legenda nenhuma', () => {
    expect(legendaEm([TRECHO], 25)).toBeNull();
  });

  it('trecho sem motivo devolve texto vazio, nao quebra', () => {
    const semMotivo = desvio('00:00:10.000', '00:00:20.000', '');

    expect(legendaEm([semMotivo], 12)?.texto).toBe('');
  });
});

describe('rotuloDo', () => {
  it('a categoria manda quando existe', () => {
    expect(rotuloDo({ ...TRECHO, categoria: 'tangente', motivo: 'texto longo' })).toBe('tangente');
  });

  it('sem categoria, motivo curto vira rotulo', () => {
    expect(rotuloDo(desvio('00:00:10.000', '00:00:20.000', 'repeticao'))).toBe('repeticao');
  });

  it('motivo longo NAO vira rotulo', () => {
    // Um rotulo de tres linhas ocuparia meio quadro, tapando justamente o video
    // que se esta avaliando. O motivo tem lugar: a legenda.
    expect(rotuloDo(desvio('00:00:10.000', '00:00:20.000', 'x'.repeat(80)))).toBe('');
  });
});

describe('janelaDo', () => {
  it('converte hms em segundos', () => {
    expect(janelaDo(desvio('00:01:05.000', '00:01:10.500'))).toEqual({ inicio: 65, fim: 70.5 });
  });
});
