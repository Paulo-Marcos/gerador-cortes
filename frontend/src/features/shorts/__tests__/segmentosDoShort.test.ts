import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  comOffsets,
  comSegmentoMovido,
  comSegmentoNovo,
  duracaoLiquida,
  efetivos,
  MAX_SEGMENTOS,
  noShort,
  resumo,
  semOSegmento,
  temColagem,
  type Segmento,
} from '../segmentosDoShort';
import type { ShortSugerido } from '../shortsApi';

// D-604: a tela e o backend precisam contar a MESMA história sobre a colagem —
// quantos pedaços cabem, quanto tempo o short tem, em que ordem ele toca. Este
// arquivo lê o domínio do backend e compara, porque os projetos não compartilham
// módulo e duas cópias da mesma regra sempre divergem (a lição da D-558).
const DOMINIO_DO_BACKEND = resolve(
  __dirname,
  '../../../../../backend/app/domain/segmentos_short.py',
);

function constanteDoBackend(nome: string): number {
  const fonte = readFileSync(DOMINIO_DO_BACKEND, 'utf-8');
  const encontrado = new RegExp(`^${nome} = (${String.raw`[\d.]`}+)`, 'm').exec(fonte);
  expect(encontrado, `${nome} sumiu do domínio do backend`).not.toBeNull();
  return Number(encontrado?.[1]);
}

/** Um short de mentira, só com o que estas funções leem. */
function short(campos: Partial<ShortSugerido>): ShortSugerido {
  return { inicio_seg: 0, fim_seg: 60, ...campos } as ShortSugerido;
}

// O caso do relato: 0-30 e depois 45-60. E o mesmo invertido, que a ordem livre
// permite — abrir com o gancho que só acontece aos 45s.
const PEDIDO: Segmento[] = [
  { inicio_seg: 0, fim_seg: 30 },
  { inicio_seg: 45, fim_seg: 60 },
];
const GANCHO_PRIMEIRO: Segmento[] = [
  { inicio_seg: 45, fim_seg: 60 },
  { inicio_seg: 0, fim_seg: 30 },
];

describe('acordo com o dominio do backend', () => {
  it('o teto de segmentos e o mesmo dos dois lados', () => {
    // A tela para de oferecer "somar segmento" no teto; um teto diferente do
    // backend deixaria o operador marcar um segmento que volta 422.
    expect(constanteDoBackend('MAX_SEGMENTOS')).toBe(MAX_SEGMENTOS);
  });
});

describe('nao regressao: sem colagem, nada muda', () => {
  it('lista vazia e a janela unica', () => {
    expect(efetivos(short({ inicio_seg: 10, fim_seg: 40 }))).toEqual([
      { inicio_seg: 10, fim_seg: 40 },
    ]);
  });

  it('a duracao e o span', () => {
    expect(duracaoLiquida(short({ inicio_seg: 10, fim_seg: 40 }))).toBe(30);
  });

  it('o tempo do short e o do bruto menos o inicio', () => {
    expect(noShort(25, short({ inicio_seg: 10, fim_seg: 40 }))).toBe(15);
  });

  it('um segmento so nao conta como colagem', () => {
    expect(temColagem(short({ segmentos: [{ inicio_seg: 0, fim_seg: 30 }] }))).toBe(false);
    expect(temColagem(short({ segmentos: PEDIDO }))).toBe(true);
  });
});

describe('duracaoLiquida', () => {
  it('soma o que toca e ignora o buraco', () => {
    expect(duracaoLiquida(short({ segmentos: PEDIDO }))).toBe(45);
  });

  it('nao e o span do envelope', () => {
    // A prova explícita de que os dois números divergem — num limite de 60s do
    // Shorts, usar o span mentiria para cima, que é o pior lado.
    expect(duracaoLiquida(short({ segmentos: PEDIDO }))).not.toBe(60);
  });

  it('a ordem nao muda a duracao', () => {
    expect(duracaoLiquida(short({ segmentos: GANCHO_PRIMEIRO }))).toBe(45);
  });
});

describe('ordem livre', () => {
  it('o offset cresce na ordem da LISTA, nao do relogio', () => {
    expect(
      comOffsets(short({ segmentos: GANCHO_PRIMEIRO })).map((p) => [
        p.segmento.inicio_seg,
        p.offsetSeg,
      ]),
    ).toEqual([
      [45, 0],
      [0, 15],
    ]);
  });

  it('o instante do bruto e traduzido pela ordem de toque', () => {
    const colado = short({ segmentos: GANCHO_PRIMEIRO });
    expect(noShort(50, colado)).toBe(5);
    expect(noShort(5, colado)).toBe(20);
  });
});

describe('o buraco', () => {
  it('nao tem lugar no short', () => {
    // É este `null` que faz a prévia esconder a legenda de uma fala que o
    // arquivo não vai conter.
    expect(noShort(35, short({ segmentos: PEDIDO }))).toBeNull();
  });

});

describe('editar a colagem', () => {
  it('o segmento novo entra no FIM da ordem de toque', () => {
    // Quem marca um pedaço acabou de decidir onde ele entra; reordenar por conta
    // própria desfaria isso.
    expect(comSegmentoNovo(short({ segmentos: PEDIDO }), 70, 78)).toEqual([
      ...PEDIDO,
      { inicio_seg: 70, fim_seg: 78 },
    ]);
  });

  it('o primeiro segmento de um short sem colagem parte da janela dele', () => {
    expect(comSegmentoNovo(short({ inicio_seg: 10, fim_seg: 40 }), 70, 78)).toEqual([
      { inicio_seg: 10, fim_seg: 40 },
      { inicio_seg: 70, fim_seg: 78 },
    ]);
  });

  it('o teto para de aceitar segmento novo', () => {
    const cheio = Array.from({ length: MAX_SEGMENTOS }, (_, i) => ({
      inicio_seg: i * 2,
      fim_seg: i * 2 + 1,
    }));
    expect(comSegmentoNovo(short({ segmentos: cheio }), 99, 100)).toHaveLength(MAX_SEGMENTOS);
  });

  it('tirar o penultimo manda o que SOBROU, e nao a lista vazia', () => {
    // `[]` significaria "fique com a janela de agora" — e a janela de agora é o
    // envelope 0-60, que ainda cobre o buraco. Mandando o 0-30 que sobrou, o
    // backend colapsa na janela única com as bordas DELE.
    expect(semOSegmento(short({ segmentos: PEDIDO }), 1)).toEqual([{ inicio_seg: 0, fim_seg: 30 }]);
  });

  it('tirar um de tres deixa os outros dois', () => {
    const tres = [...PEDIDO, { inicio_seg: 70, fim_seg: 80 }];
    expect(semOSegmento(short({ segmentos: tres }), 0)).toEqual([
      { inicio_seg: 45, fim_seg: 60 },
      { inicio_seg: 70, fim_seg: 80 },
    ]);
  });

  it('mover troca o segmento com o vizinho na ordem de toque', () => {
    expect(comSegmentoMovido(short({ segmentos: PEDIDO }), 1, -1)).toEqual(GANCHO_PRIMEIRO);
  });

  it('mover para fora da lista nao mexe em nada', () => {
    expect(comSegmentoMovido(short({ segmentos: PEDIDO }), 0, -1)).toEqual(PEDIDO);
    expect(comSegmentoMovido(short({ segmentos: PEDIDO }), 1, 1)).toEqual(PEDIDO);
  });
});

describe('resumo', () => {
  it('um segmento mostra so a duracao', () => {
    expect(resumo(short({ inicio_seg: 10, fim_seg: 40 }))).toBe('30s');
  });

  it('colagem diz quantos e o tempo real', () => {
    expect(resumo(short({ segmentos: PEDIDO }))).toBe('2 segmentos · 45s');
  });
});
