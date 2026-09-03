import { describe, expect, it } from 'vitest';
import { janelaDo, legendaEm, textoDoTrecho, trechoEm } from '../legendaDoTrecho';
import type { Desvio, TranscricaoLinha } from '@/types/models';

// D-511: o texto do trecho que vai ser removido.
//
// O que se guarda aqui e o RECORTE da transcricao. Errar por pouco nao levanta
// erro nenhum: sai uma legenda com a frase do vizinho, e o operador julga o
// corte pelo texto errado — o pior tipo de defeito, porque parece que funciona.

const desvio = (inicio: string, fim: string, motivo = 'digressao'): Desvio => ({
  inicio_hms: inicio,
  fim_hms: fim,
  motivo,
});

const linha = (start: number, end: number, texto: string): TranscricaoLinha => ({
  start,
  end,
  texto,
});

const FALA: TranscricaoLinha[] = [
  linha(0, 5, 'abertura do corte'),
  linha(10, 14, 'aqui comeca a digressao'),
  linha(14, 19, 'e ela continua por aqui'),
  linha(30, 34, 'de volta ao assunto'),
];

const TRECHO = desvio('00:00:10.000', '00:00:20.000');

describe('textoDoTrecho', () => {
  it('junta as linhas que caem na janela', () => {
    expect(textoDoTrecho(FALA, TRECHO)).toBe('aqui comeca a digressao e ela continua por aqui');
  });

  it('deixa de fora o que esta fora', () => {
    const texto = textoDoTrecho(FALA, TRECHO);

    expect(texto).not.toContain('abertura');
    expect(texto).not.toContain('de volta');
  });

  it('a linha que so ENCOSTA na borda nao entra', () => {
    // A transcricao vem em blocos de varios segundos. A linha que termina no
    // instante em que o trecho comeca nao diz nada sobre ele — mostra-la seria
    // atribuir ao corte uma frase que nao e dele.
    const encostando = [linha(5, 10, 'termina exatamente no comeco')];

    expect(textoDoTrecho(encostando, TRECHO)).toBe('');
  });

  it('a linha que atravessa a borda entra', () => {
    // a fala comecou antes e segue dentro do trecho
    const atravessa = [linha(8, 13, 'comecou antes e invade')];

    expect(textoDoTrecho(atravessa, TRECHO)).toBe('comecou antes e invade');
  });

  it('sem transcricao devolve vazio, nao quebra', () => {
    expect(textoDoTrecho([], TRECHO)).toBe('');
  });

  it('janela invertida nao recorta nada', () => {
    expect(textoDoTrecho(FALA, desvio('00:00:20.000', '00:00:10.000'))).toBe('');
  });

  it('ignora linha vazia em vez de somar espacos', () => {
    const comBuraco = [linha(10, 12, '  '), linha(12, 15, 'a que vale')];

    expect(textoDoTrecho(comBuraco, TRECHO)).toBe('a que vale');
  });
});

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
});

describe('legendaEm', () => {
  it('mostra o que foi dito no trecho', () => {
    expect(legendaEm([TRECHO], FALA, 12)?.texto).toContain('digressao');
  });

  it('sem transcricao casada, cai no motivo', () => {
    // Legenda vazia seria indistinguivel de um bug; o motivo ao menos diz por
    // que aquele pedaco foi marcado.
    expect(legendaEm([TRECHO], [], 12)?.texto).toBe('digressao');
  });

  it('o motivo viaja junto do texto', () => {
    const legenda = legendaEm([TRECHO], FALA, 12);

    expect(legenda?.motivo).toBe('digressao');
    expect(legenda?.texto).not.toBe(legenda?.motivo);
  });

  it('fora de trecho nao ha legenda nenhuma', () => {
    expect(legendaEm([TRECHO], FALA, 25)).toBeNull();
  });
});

describe('janelaDo', () => {
  it('converte hms em segundos', () => {
    expect(janelaDo(desvio('00:01:05.000', '00:01:10.500'))).toEqual({ inicio: 65, fim: 70.5 });
  });
});
