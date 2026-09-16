import { describe, expect, it } from 'vitest';
import { alcancouOFim, desarmaNoSeek, FOLGA_SEG, proximaJanela } from '../paradaNoFim';
import { mmss } from '../linhaDoTempoShort';

// D-539: o player para no fim do trecho.
//
// O player da curadoria e o BRUTO inteiro, e um short e uma janela dentro dele.
// "Assistir" levava o cursor ao inicio e soltava — dali o video seguia pelo
// assunto seguinte, e o operador so percebia que passou do fim quando o tema
// mudava. Para julgar se um corte FECHA bem, o fim precisa chegar como fim.

describe('alcancouOFim', () => {
  it('nao para antes da hora', () => {
    expect(alcancouOFim(30, 29.5)).toBe(false);
  });

  it('para no fim', () => {
    expect(alcancouOFim(30, 30)).toBe(true);
  });

  it('para um quadro antes, e nao um depois', () => {
    // O primeiro quadro do que vem DEPOIS ja e o assunto errado na tela.
    // Errar para dentro custa 40ms de conteudo; errar para fora custa a
    // impressao de que o corte nao fecha.
    expect(alcancouOFim(30, 30 - FOLGA_SEG)).toBe(true);
    expect(alcancouOFim(30, 30 - FOLGA_SEG * 3)).toBe(false);
  });

  it('sem nada armado nunca para', () => {
    // O player e compartilhado: fora do gesto de assistir um trecho, ele e um
    // player comum e nao pode pausar sozinho no meio de nada.
    expect(alcancouOFim(null, 999)).toBe(false);
  });
});

describe('desarmaNoSeek', () => {
  it('a mao do operador cancela a parada', () => {
    // Sem isto, um `pause` dispararia minutos depois, num ponto que nao tem
    // relacao nenhuma com o trecho que se mandou tocar — uma emboscada.
    expect(desarmaNoSeek(false)).toBe(true);
  });

  it('o nosso proprio seek nao cancela', () => {
    // Nos movemos o cursor ao COMECAR a tocar o trecho. Se esse seek
    // desarmasse, a parada morreria no mesmo instante em que nasce.
    expect(desarmaNoSeek(true)).toBe(false);
  });
});

describe('mmss compartilhado', () => {
  it('mantem o formato que as duas copias antigas produziam', () => {
    // A funcao vivia copiada em dois arquivos e a D-539 precisou de um
    // terceiro. Ao unificar, o formato nao podia mudar: a regua e os botoes
    // novos precisam falar o mesmo relogio.
    expect(mmss(75)).toBe('01:15');
    expect(mmss(9)).toBe('00:09');
    expect(mmss(0)).toBe('00:00');
  });

  it('nao devolve tempo negativo', () => {
    expect(mmss(-5)).toBe('00:00');
  });
});

// D-604: num short COLADO, o fim de uma janela é a DEIXA para a próxima — não o
// fim do short. Pausar no primeiro buraco faria o operador achar que o trecho
// acabou aos 30s, quando ele tem 45s de vídeo.
describe('proximaJanela', () => {
  const colagem = [
    { inicio: 0, fim: 30 },
    { inicio: 45, fim: 60 },
  ];

  it('entrega a janela seguinte na ordem de toque', () => {
    expect(proximaJanela(colagem, 0)).toEqual({ inicio: 45, fim: 60 });
  });

  it('na ultima nao ha para onde pular — ali o fim e fim', () => {
    // Mantém o comportamento da D-539: o fim precisa chegar como fim.
    expect(proximaJanela(colagem, 1)).toBeNull();
  });

  it('janela unica nunca tem proxima', () => {
    expect(proximaJanela([{ inicio: 0, fim: 30 }], 0)).toBeNull();
  });

  it('indice fora da lista nao explode', () => {
    expect(proximaJanela(colagem, 99)).toBeNull();
  });
});
