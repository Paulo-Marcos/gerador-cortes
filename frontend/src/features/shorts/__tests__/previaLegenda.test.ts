import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AGRUPAMENTO_MS,
  captionsDoTrecho,
  paginaEm,
  paginasDoTrecho,
  SAFE_ZONE,
} from '../previaLegenda';
import type { PalavraTranscrita } from '../shortsApi';

const LEGENDA_DO_RENDERER = resolve(
  __dirname,
  '../../../../../video-renderer/src/cenas-shorts/LegendaShort.tsx',
);

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
