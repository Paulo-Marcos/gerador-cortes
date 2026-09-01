import { describe, expect, it } from 'vitest';
import {
  aplicarTempoDigitado,
  empurrar,
  interpretarTempo,
  PASSOS_FINOS,
} from '../bordasFinas';
import { DURACAO_MINIMA_SEG } from '../linhaDoTempoShort';

const BRUTO_SEG = 600;
const UM_FRAME = 1 / 30;
const [FRAME, MEIO_SEG] = PASSOS_FINOS;

describe('empurrar', () => {
  const bordas = { inicio: 100, fim: 140 };

  it('um quadro move o minimo que o video enxerga', () => {
    expect(empurrar(bordas, 'inicio', FRAME, 1, BRUTO_SEG).inicio).toBeCloseTo(100 + UM_FRAME, 5);
    expect(empurrar(bordas, 'inicio', FRAME, -1, BRUTO_SEG).inicio).toBeCloseTo(100 - UM_FRAME, 5);
  });

  it('meio segundo move meio segundo, nos dois sentidos', () => {
    expect(empurrar(bordas, 'fim', MEIO_SEG, 1, BRUTO_SEG).fim).toBeCloseTo(140.5, 5);
    expect(empurrar(bordas, 'fim', MEIO_SEG, -1, BRUTO_SEG).fim).toBeCloseTo(139.5, 5);
  });

  it('empurrar uma borda nao mexe na outra', () => {
    expect(empurrar(bordas, 'inicio', MEIO_SEG, 1, BRUTO_SEG).fim).toBe(140);
    expect(empurrar(bordas, 'fim', MEIO_SEG, -1, BRUTO_SEG).inicio).toBe(100);
  });

  it('herda as travas do arraste: nao sai do arquivo', () => {
    // A trava nao e reimplementada aqui — `empurrar` chama a mesma `arrastar`
    // que a alca usa. Este teste garante que essa delegacao continua valendo.
    expect(empurrar({ inicio: 0, fim: 40 }, 'inicio', MEIO_SEG, -1, BRUTO_SEG).inicio).toBe(0);
    expect(
      empurrar({ inicio: 500, fim: BRUTO_SEG }, 'fim', MEIO_SEG, 1, BRUTO_SEG).fim,
    ).toBe(BRUTO_SEG);
  });

  it('herda as travas do arraste: nao atravessa a outra borda', () => {
    const colado = { inicio: 100, fim: 100 + DURACAO_MINIMA_SEG };

    expect(empurrar(colado, 'inicio', MEIO_SEG, 1, BRUTO_SEG).inicio).toBe(100);
  });
});

describe('interpretarTempo', () => {
  it('le o formato que o resto do app escreve', () => {
    expect(interpretarTempo('00:01:23.500')).toBeCloseTo(83.5, 3);
  });

  it('le mm:ss, sem a hora que e sempre zero', () => {
    expect(interpretarTempo('01:23')).toBeCloseTo(83, 3);
    expect(interpretarTempo('01:23.5')).toBeCloseTo(83.5, 3);
  });

  it('le o numero cru', () => {
    expect(interpretarTempo('83.5')).toBeCloseTo(83.5, 3);
    expect(interpretarTempo('0')).toBe(0);
  });

  it('aceita virgula, porque o teclado aqui e brasileiro', () => {
    expect(interpretarTempo('83,5')).toBeCloseTo(83.5, 3);
  });

  it('devolve null no que nao e tempo, em vez de zero', () => {
    // `hmsParaSeg` engole lixo e responde 0. Um campo que vira 00:00 sozinho ao
    // receber um erro de digitacao move a borda para o comeco sem avisar.
    for (const lixo of ['', '   ', 'abc', '1:2:3:4', '--', '12:', ':30']) {
      expect(interpretarTempo(lixo), `deveria recusar ${JSON.stringify(lixo)}`).toBeNull();
    }
  });
});

describe('aplicarTempoDigitado', () => {
  const bordas = { inicio: 100, fim: 140 };

  it('grava o tempo lido, ja travado no arquivo', () => {
    expect(aplicarTempoDigitado(bordas, 'inicio', '00:02:00', BRUTO_SEG)).toEqual({
      inicio: 120,
      fim: 140,
    });
  });

  it('tempo alem do arquivo encosta no fim, nao estoura', () => {
    expect(aplicarTempoDigitado(bordas, 'fim', '99:00:00', BRUTO_SEG)?.fim).toBe(BRUTO_SEG);
  });

  it('texto invalido devolve null, e a tela mantem o que tinha', () => {
    expect(aplicarTempoDigitado(bordas, 'inicio', 'sei la', BRUTO_SEG)).toBeNull();
  });
});
