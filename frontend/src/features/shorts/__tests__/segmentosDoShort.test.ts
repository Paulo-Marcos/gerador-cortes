import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  arrasteDoSegmento,
  comBordaDoSegmento,
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
import { segmentoDaRegiao, shortDaRegiao } from '../ReguaDeOnda';
import type { ShortSugerido } from '../shortsApi';

// D-604: a tela e o backend precisam contar a MESMA história sobre a colagem —
// quantos pedaços cabem, quanto tempo o short tem, em que ordem ele toca. Este
// arquivo lê o domínio do backend e compara, porque os projetos não compartilham
// módulo e duas cópias da mesma regra sempre divergem (a lição da D-558).
const DOMINIO_DO_BACKEND = resolve(
  __dirname,
  '../../../../../backend/app/domain/short/segmentos_short.py',
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

// D-608: ajustar o tamanho de UM segmento depois de somar outro. A D-604 tinha
// tirado isso — o operador somava um segmento e perdia o poder de aumentar ou
// reduzir qualquer um deles.
describe('comBordaDoSegmento', () => {
  const colado = short({ segmentos: PEDIDO }); // 0-30 e 45-60, bruto de 120s

  it('aumenta o fim de um segmento sem tocar no outro', () => {
    expect(comBordaDoSegmento(colado, 0, 'fim', 38, 120)).toEqual([
      { inicio_seg: 0, fim_seg: 38 },
      { inicio_seg: 45, fim_seg: 60 },
    ]);
  });

  it('reduz o inicio do segundo segmento', () => {
    expect(comBordaDoSegmento(colado, 1, 'inicio', 50, 120)).toEqual([
      { inicio_seg: 0, fim_seg: 30 },
      { inicio_seg: 50, fim_seg: 60 },
    ]);
  });

  it('a ordem de toque fica como estava', () => {
    // Encompridar o segundo pedaço para antes do primeiro não pode trocá-los de
    // lugar: a ordem é decisão do operador, não consequência de tamanho.
    const resultado = comBordaDoSegmento(short({ segmentos: GANCHO_PRIMEIRO }), 1, 'fim', 40, 120);
    expect(resultado.map((s) => s.inicio_seg)).toEqual([45, 0]);
  });

  it('a borda nao atravessa a outra — para a um segundo dela', () => {
    // A mesma trava do trecho comum (`arrastar`): empilhadas, as duas alças não
    // teriam mais como ser pegas separadamente.
    expect(comBordaDoSegmento(colado, 0, 'fim', -10, 120)[0]).toEqual({
      inicio_seg: 0,
      fim_seg: 1,
    });
  });

  it('o fim nao passa do bruto', () => {
    expect(comBordaDoSegmento(colado, 1, 'fim', 999, 120)[1].fim_seg).toBe(120);
  });

  it('num short sem colagem ajusta a janela unica', () => {
    expect(comBordaDoSegmento(short({ inicio_seg: 10, fim_seg: 40 }), 0, 'fim', 55, 120)).toEqual([
      { inicio_seg: 10, fim_seg: 55 },
    ]);
  });
});

// D-608: a alça de cada segmento só funciona se a régua souber DE QUEM é a
// região arrastada e QUAL segmento ela é. A D-604 tirou as alças supondo que isso
// não dava para saber — e dava, porque o id carrega os dois.
describe('id da regiao na regua', () => {
  // Um uuid real: tem hífens, e é por isso que o separador é duplo.
  const uuid = '3f2a9c1e-7b4d-4e8a-9c2f-1a2b3c4d5e6f';

  it('devolve o short mesmo com os hifens do uuid', () => {
    expect(shortDaRegiao(`${uuid}__2`)).toBe(uuid);
  });

  it('devolve o indice do segmento na ordem de toque', () => {
    expect(segmentoDaRegiao(`${uuid}__0`)).toBe(0);
    expect(segmentoDaRegiao(`${uuid}__2`)).toBe(2);
  });

  it('id sem sufixo e o primeiro segmento do proprio short', () => {
    expect(shortDaRegiao(uuid)).toBe(uuid);
    expect(segmentoDaRegiao(uuid)).toBe(0);
  });
});

// D-608: a régua entrega o bloco como ficou, e não qual borda foi pega. Errar
// essa leitura é o operador arrastar o fim e ver o início andar.
describe('arrasteDoSegmento', () => {
  const colado = short({ segmentos: PEDIDO }); // 0-30 e 45-60, bruto de 120s

  it('arrastar o fim move so o fim, e o cursor vai ate ele', () => {
    expect(arrasteDoSegmento(colado, 1, 45, 66, 120)).toEqual({
      segmentos: [
        { inicio_seg: 0, fim_seg: 30 },
        { inicio_seg: 45, fim_seg: 66 },
      ],
      focarEm: 66,
    });
  });

  it('arrastar o inicio move so o inicio, e o cursor vai ate ele', () => {
    expect(arrasteDoSegmento(colado, 0, 4, 30, 120)).toEqual({
      segmentos: [
        { inicio_seg: 4, fim_seg: 30 },
        { inicio_seg: 45, fim_seg: 60 },
      ],
      focarEm: 4,
    });
  });

  it('o cursor vai ate a borda JA travada, e nao ate onde o mouse soltou', () => {
    // Puxar o fim para antes do início para a um segundo dele — e é esse o
    // instante que o operador precisa conferir no player.
    expect(arrasteDoSegmento(colado, 0, 0, -5, 120)?.focarEm).toBe(1);
  });

  it('indice que nao existe nao grava nada', () => {
    expect(arrasteDoSegmento(colado, 7, 0, 10, 120)).toBeNull();
  });
});
