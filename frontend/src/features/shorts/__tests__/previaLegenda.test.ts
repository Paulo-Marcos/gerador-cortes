import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGRUPAMENTO_MS,
  captionsDaColagem,
  captionsDoTrecho,
  LARGURA_MAX,
  LARGURA_MIN,
  LARGURA_PADRAO,
  lugarArrastado,
  lugarDaLegenda,
  lugarEfetivo,
  paginaEm,
  paginasDoTrecho,
  POSICAO_X_MAX,
  POSICAO_X_MIN,
  POSICAO_X_PADRAO,
  POSICAO_Y_MAX,
  POSICAO_Y_MIN,
  POSICAO_Y_PADRAO,
  SAFE_ZONE,
  temLugarProprio,
} from '../previaLegenda';
import type { PalavraTranscrita } from '../shortsApi';

const LEGENDA_DO_RENDERER = resolve(
  __dirname,
  '../../../../../video-renderer/src/cenas-shorts/LegendaShort.tsx',
);

// D-605: o lugar da legenda vive em TRÊS cópias — este arquivo, o domínio do
// backend e o renderer —, porque os projetos não compartilham módulo. Estes
// testes são o teto contra a divergência: eles leem os outros dois arquivos.
const LEGENDA_DO_BACKEND = resolve(
  __dirname,
  '../../../../../backend/app/domain/legenda_short.py',
);

function constanteDoBackend(nome: string): number {
  const fonte = readFileSync(LEGENDA_DO_BACKEND, 'utf-8');
  // A classe vem de `String.raw`: numa template string comum o `\d` seria lido
  // como escape desconhecido e viraria um `d` literal — a regex casaria a letra
  // "d" em vez de dígito, e todo valor voltaria nulo.
  const encontrado = new RegExp(`^${nome} = (${String.raw`[\d.]`}+)`, 'm').exec(fonte);
  expect(encontrado, `${nome} sumiu do domínio do backend`).not.toBeNull();
  return Number(encontrado?.[1]);
}

function palavra(texto: string, inicio: number, fim: number): PalavraTranscrita {
  return { texto, inicio_seg: inicio, fim_seg: fim };
}

// A prévia só vale se for a MESMA legenda que o render queima. Duas coisas
// garantem isso: o agrupamento vem do pacote real (`@remotion/captions`), e as
// duas constantes copiadas são conferidas contra o arquivo do renderer aqui.
describe('acordo com o renderer', () => {
  it('o agrupamento e o mesmo que o LegendaShort usa', () => {
    const fonte = readFileSync(LEGENDA_DO_RENDERER, 'utf-8');
    const encontrado = /AGRUPAMENTO_MS\s*=\s*(\d+)/.exec(fonte);

    expect(encontrado, 'AGRUPAMENTO_MS sumiu do renderer').not.toBeNull();
    expect(Number(encontrado?.[1])).toBe(AGRUPAMENTO_MS);
  });

  it('a safe zone e a mesma que o LegendaShort usa', () => {
    const fonte = readFileSync(LEGENDA_DO_RENDERER, 'utf-8');
    const encontrado = /SAFE_ZONE\s*=\s*([\d.]+)/.exec(fonte);

    expect(encontrado, 'SAFE_ZONE sumiu do renderer').not.toBeNull();
    expect(Number(encontrado?.[1])).toBe(SAFE_ZONE);
  });

  // D-605: a largura deixou de ser `'80%'` cravado no parágrafo e virou o
  // default do lugar. Se o renderer mudar o número sozinho, a prévia passaria a
  // desenhar uma caixa mais larga do que o arquivo terá.
  it('a largura padrao e a mesma que o LegendaShort usa', () => {
    const fonte = readFileSync(LEGENDA_DO_RENDERER, 'utf-8');
    const encontrado = /const LARGURA = ([\d.]+)/.exec(fonte);

    expect(encontrado, 'LARGURA sumiu do renderer').not.toBeNull();
    expect(Number(encontrado?.[1])).toBe(LARGURA_PADRAO);
  });
});

// D-605: a faixa útil do lugar é decidida no domínio do backend — é ele que
// normaliza o que vai ao banco. A tela só pode oferecer o MESMO intervalo: um
// mínimo menor aqui deixaria o operador arrastar para um lugar que o backend
// corrige em silêncio depois de salvar.
describe('acordo com o dominio do backend', () => {
  it.each([
    ['POSICAO_X_PADRAO', POSICAO_X_PADRAO],
    ['POSICAO_X_MIN', POSICAO_X_MIN],
    ['POSICAO_X_MAX', POSICAO_X_MAX],
    ['POSICAO_Y_MIN', POSICAO_Y_MIN],
    ['POSICAO_Y_MAX', POSICAO_Y_MAX],
    ['LARGURA_PADRAO', LARGURA_PADRAO],
    ['LARGURA_MIN', LARGURA_MIN],
    ['LARGURA_MAX', LARGURA_MAX],
  ])('%s e o mesmo dos dois lados', (nome, daTela) => {
    expect(constanteDoBackend(nome)).toBe(daTela);
  });

  // `POSICAO_Y_PADRAO` é derivado da safe zone nos dois lados, e não um literal
  // — por isso ele é conferido pelo VALOR, e não pela linha do arquivo.
  it('a base padrao da legenda e o alto da safe zone', () => {
    expect(POSICAO_Y_PADRAO).toBe(100 - SAFE_ZONE * 100);
    expect(POSICAO_Y_PADRAO).toBe(82);
  });
});

// D-605: a cascata do lugar — o trecho decide, senão o palco padrão do corte,
// senão a base no alto da safe zone, que era o ponto fixo de antes.
describe('lugarEfetivo', () => {
  it('sem nada decidido, e o lugar de sempre', () => {
    expect(lugarEfetivo(null, null)).toEqual({
      x: POSICAO_X_PADRAO,
      y: POSICAO_Y_PADRAO,
      largura: LARGURA_PADRAO,
    });
  });

  it('o primeiro vence o segundo, campo a campo', () => {
    expect(lugarEfetivo({ y: 55 }, { x: 30, y: 82, largura: 60 })).toEqual({
      x: 30,
      y: 55,
      largura: 60,
    });
  });

  it('zero e heranca, e nao o topo do quadro', () => {
    expect(lugarEfetivo({ x: 0, y: 0, largura: 0 }, { y: 40 }).y).toBe(40);
  });

  it('valor fora da faixa e grudado nela, nao recusado', () => {
    expect(lugarEfetivo({ y: 300, largura: 5 }, null)).toEqual({
      x: POSICAO_X_PADRAO,
      y: POSICAO_Y_MAX,
      largura: LARGURA_MIN,
    });
  });
});

describe('lugarDaLegenda', () => {
  it('o plano vence o short, porque ele ja traz a heranca resolvida', () => {
    const lugar = lugarDaLegenda({ y: 45 }, { legenda_y: 70 });
    expect(lugar.y).toBe(45);
  });

  it('sem plano ainda, desenha com o que o short tem', () => {
    expect(lugarDaLegenda(null, { legenda_y: 70 }).y).toBe(70);
  });
});

describe('lugarArrastado', () => {
  const partida = { x: 50, y: 82, largura: 80 };

  it('o gesto move nos dois eixos e preserva a largura', () => {
    expect(lugarArrastado(partida, -10, -30)).toEqual({ x: 40, y: 52, largura: 80 });
  });

  // A diferença com a cascata: lá zero é "não decidi" e vira o padrão; aqui isso
  // seria a legenda pulando de volta para o rodapé na mão do operador.
  it('puxar para fora do quadro para na borda, nao volta ao padrao', () => {
    expect(lugarArrastado(partida, -999, -999)).toEqual({
      x: POSICAO_X_MIN,
      y: POSICAO_Y_MIN,
      largura: 80,
    });
  });
});

describe('temLugarProprio', () => {
  it('zero em tudo e heranca do palco', () => {
    expect(temLugarProprio({ legenda_x: 0, legenda_y: 0, legenda_largura: 0 })).toBe(false);
    expect(temLugarProprio({})).toBe(false);
  });

  it('um campo decidido basta', () => {
    expect(temLugarProprio({ legenda_y: 55 })).toBe(true);
  });
});

describe('captionsDoTrecho', () => {
  const palavras = [
    palavra('antes', 5, 5.4),
    palavra('olá', 10, 10.4),
    palavra('mundo', 10.4, 10.9),
    palavra('depois', 30, 30.5),
  ];

  it('deixa de fora o que esta fora das bordas', () => {
    expect(captionsDoTrecho(palavras, 10, 20).map((c) => c.text.trim())).toEqual([
      'olá',
      'mundo',
    ]);
  });

  it('rebaseia para o zero do short', () => {
    // Sem isto a legenda apareceria minutos depois do que devia — o mesmo erro
    // que a `transcricao_final` ja resolveu no corte.
    expect(captionsDoTrecho(palavras, 10, 20)[0].startMs).toBe(0);
  });

  it('poe espaco a esquerda em toda palavra menos a primeira', () => {
    // Espelha `services/legendas_short.para_captions`: sem o espaco o Remotion
    // concatena os tokens crus e a linha vira "olamundo".
    const captions = captionsDoTrecho(palavras, 10, 20);

    expect(captions[0].text).toBe('olá');
    expect(captions[1].text).toBe(' mundo');
  });

  it('trecho sem fala nao gera caption nenhuma', () => {
    expect(captionsDoTrecho(palavras, 15, 25)).toEqual([]);
  });
});

// O agrupamento do `createTikTokStyleCaptions` nao e o que o nome sugere: ele
// NAO quebra a pagina quando ha um silencio grande entre duas palavras. Ele
// quebra quando a pagina ACUMULADA ja passou de `combineTokensWithinMilliseconds`
// — o parametro e o tamanho maximo da pagina, nao o buraco maximo entre tokens.
//
// Descoberto rodando o pacote de verdade contra um caso que eu tinha escrito
// esperando o contrario. Os testes abaixo fixam o comportamento REAL, porque e
// ele que vai para o arquivo: uma previa que "corrigisse" isso mentiria.
describe('paginasDoTrecho', () => {
  it('quebra quando a pagina acumulada passa de 1200ms', () => {
    const palavras = [
      palavra('uma', 0, 0.3),
      palavra('frase', 0.5, 0.9),
      palavra('curta', 1.0, 1.4),
      // Aqui a pagina ja tem 1400ms: a proxima palavra abre pagina nova.
      palavra('outra', 1.6, 2.0),
    ];
    const paginas = paginasDoTrecho(palavras, 0, 10);

    expect(paginas).toHaveLength(2);
    expect(paginas[0].tokens.map((t) => t.texto.trim())).toEqual(['uma', 'frase', 'curta']);
    expect(paginas[1].tokens.map((t) => t.texto.trim())).toEqual(['outra']);
  });

  it('silencio longo NAO quebra a pagina — e assim que o render se comporta', () => {
    // Tres palavras somando 1000ms, e um silencio de 3 segundos depois. A
    // pagina nao fechou (1000 < 1200), entao a palavra de depois do silencio
    // entra na MESMA pagina — e o texto fica na tela durante o silencio todo.
    const paginas = paginasDoTrecho(
      [
        palavra('uma', 0, 0.3),
        palavra('frase', 0.3, 0.7),
        palavra('curta', 0.7, 1.0),
        palavra('outra', 4.0, 4.4),
      ],
      0,
      10,
    );

    expect(paginas).toHaveLength(1);
  });

  it('sem palavras nao ha pagina', () => {
    expect(paginasDoTrecho([], 0, 10)).toEqual([]);
  });
});

describe('paginaEm', () => {
  const paginas = paginasDoTrecho(
    [palavra('olá', 10, 10.4), palavra('mundo', 10.4, 10.9)],
    10,
    20,
  );

  it('acha a pagina do instante', () => {
    expect(paginaEm(paginas, 0.2)?.tokens).toHaveLength(2);
  });

  it('silencio devolve nada, em vez de repetir a ultima frase', () => {
    // Legenda que fica na tela depois que a fala acabou e a previa mentindo
    // sobre o arquivo.
    expect(paginaEm(paginas, 8)).toBeNull();
  });
});

// D-604: a legenda de um short COLADO. O defeito que isto previne não dá erro:
// a prévia leria a fala do BURACO — o material que o operador tirou fora — por
// cima de um vídeo que pulou, e ele aprovaria um texto que o arquivo não tem.
describe('captionsDaColagem', () => {
  const fala: PalavraTranscrita[] = [
    { texto: 'zero', inicio_seg: 2, fim_seg: 2.5 },
    { texto: 'buraco', inicio_seg: 35, fim_seg: 35.5 },
    { texto: 'cinquenta', inicio_seg: 52, fim_seg: 52.5 },
  ];
  // 0-30 e depois 45-60: o vão de 30 a 45 fica fora.
  const janelas = [
    { inicio: 0, fim: 30, offset: 0 },
    { inicio: 45, fim: 60, offset: 30 },
  ];

  it('a fala do buraco nao entra', () => {
    const textos = captionsDaColagem(fala, janelas).map((c) => c.text.trim());
    expect(textos).toEqual(['zero', 'cinquenta']);
  });

  it('o segundo pedaco e deslocado pelo offset, e nao rebaseado no zero', () => {
    // Sem o offset, "cinquenta" (52s no bruto) cairia aos 7s do short, por cima
    // da fala do primeiro pedaço.
    const cinquenta = captionsDaColagem(fala, janelas).find((c) => c.text.includes('cinquenta'));
    expect(cinquenta?.startMs).toBe(37_000);
  });

  it('uma janela so devolve o mesmo que o recorte simples', () => {
    expect(captionsDaColagem(fala, [{ inicio: 0, fim: 30, offset: 0 }])).toEqual(
      captionsDoTrecho(fala, 0, 30),
    );
  });

  it('a ordem livre poe a fala de cada pedaco no lugar certo', () => {
    const ganchoPrimeiro = [
      { inicio: 45, fim: 60, offset: 0 },
      { inicio: 0, fim: 30, offset: 15 },
    ];
    const textos = captionsDaColagem(fala, ganchoPrimeiro).map((c) => c.text.trim());
    expect(textos).toEqual(['cinquenta', 'zero']);
  });

  it('sai ordenado pelo tempo do short', () => {
    // Fora de ordem, o agrupamento em páginas do renderer montaria frases
    // embaralhadas — e a prévia deixaria de valer como prova.
    const tempos = captionsDaColagem(fala, [
      { inicio: 45, fim: 60, offset: 0 },
      { inicio: 0, fim: 30, offset: 15 },
    ]).map((c) => c.startMs);
    expect(tempos).toEqual([...tempos].sort((a, b) => a - b));
  });

  it('paginasDoTrecho com janelas nao pagina a fala do buraco', () => {
    const paginas = paginasDoTrecho(fala, 0, 60, janelas);
    const textos = paginas.flatMap((p) => p.tokens.map((t) => t.texto.trim()));
    expect(textos).not.toContain('buraco');
  });
});
