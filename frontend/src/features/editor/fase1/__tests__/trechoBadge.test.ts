import { describe, expect, it } from 'vitest';
import { corDoSegmento, resolverBadgeTrecho } from '../trechoBadge';
import type { Desvio, DesvioCategoria } from '@/types/models';

function desvio(patch: Partial<Desvio> = {}): Desvio {
  return { inicio_hms: '00:10:00', fim_hms: '00:10:08', motivo: '', ...patch };
}

describe('resolverBadgeTrecho — categoria manda no badge (D-422)', () => {
  it('badgeia pelo motivo da remoção, não por quem propôs', () => {
    const repeticao = resolverBadgeTrecho(
      desvio({ origem: 'claude', categoria: 'repeticao', motivo: 'reitera a tese' }),
    );
    const tangente = resolverBadgeTrecho(
      desvio({ origem: 'claude', categoria: 'tangente', motivo: 'digressão' }),
    );

    expect(repeticao.label).toBe('repeticao');
    expect(tangente.label).toBe('tangente');
    expect(repeticao.bg).not.toBe(tangente.bg);
  });

  it('destaca o trecho impreciso em cor de aviso, distinta das demais', () => {
    const impreciso = resolverBadgeTrecho(desvio({ origem: 'claude', categoria: 'imprecisao' }));
    const muleta = resolverBadgeTrecho(desvio({ origem: 'claude', categoria: 'disfluencia' }));

    expect(impreciso.label).toBe('impreciso');
    expect(impreciso.bg).toContain('warn');
    expect(impreciso.bg).not.toBe(muleta.bg);
    expect(impreciso.titulo).toMatch(/imprecisa/i);
  });

  it('cada categoria do vocabulário tem rótulo próprio', () => {
    const categorias = [
      'imprecisao',
      'repeticao',
      'tangente',
      'chat',
      'silencio',
      'disfluencia',
      'enrolacao',
      'tom',
    ] as const;
    const labels = categorias.map((categoria) => resolverBadgeTrecho(desvio({ categoria })).label);

    expect(new Set(labels).size).toBe(categorias.length);
  });
});

describe('resolverBadgeTrecho — fallback por origem (sem categoria)', () => {
  // A inferência pelo motivo é do backend (`domain/desvio_categoria.py`, aplicada
  // na serialização do corte): aqui só verificamos que a ausência de categoria
  // degrada para o badge por origem — o comportamento pré-D-422, não um bug.
  it('cai no badge por origem, sem deduzir categoria do texto', () => {
    expect(
      resolverBadgeTrecho(desvio({ origem: 'claude', motivo: 'digressão sobre utilitarismo' }))
        .label,
    ).toBe('IA');
    expect(resolverBadgeTrecho(desvio({ origem: 'manual', motivo: 'Trecho manual' })).label).toBe(
      'manual',
    );
    expect(resolverBadgeTrecho(desvio({ origem: 'gemini', motivo: '' })).label).toBe('IA Gemini');
    expect(resolverBadgeTrecho(desvio({ origem: 'tecnico', motivo: '' })).label).toBe('silencio');
  });

  it('desvio sem origem nem motivo não quebra', () => {
    expect(resolverBadgeTrecho(desvio()).label).toBe('manual');
  });

  it('categoria "outro" (IA não classificou) volta ao badge por origem', () => {
    expect(resolverBadgeTrecho(desvio({ categoria: 'outro', origem: 'gemini' })).label).toBe(
      'IA Gemini',
    );
  });
});

describe('corDoSegmento (D-515)', () => {
  const trecho = (categoria?: DesvioCategoria): Desvio => ({
    inicio_hms: '00:00:01.000',
    fim_hms: '00:00:02.000',
    motivo: 'x',
    categoria,
  });

  it('a barra usa a MESMA cor do badge do card', () => {
    // E o ponto inteiro da demanda: a cor liga as duas metades da tela. Se a
    // timeline tivesse paleta propria, a associacao que ela veio criar seria
    // justamente a que ela quebraria.
    const desvio = trecho('repeticao');

    expect(corDoSegmento(desvio)).toContain(resolverBadgeTrecho(desvio).token);
  });

  it('categorias de familias diferentes pintam diferente', () => {
    expect(corDoSegmento(trecho('repeticao'))).not.toBe(corDoSegmento(trecho('tangente')));
    expect(corDoSegmento(trecho('tom'))).not.toBe(corDoSegmento(trecho('imprecisao')));
  });

  it('o silencio tem cor propria, separada de tangente e chat', () => {
    // Ele dividia o azul com as duas e e a categoria de maior volume: numa
    // timeline cheia, quase tudo ficava azul e a cor parava de distinguir.
    const silencio = corDoSegmento(trecho('silencio'));

    expect(silencio).not.toBe(corDoSegmento(trecho('tangente')));
    expect(silencio).not.toBe(corDoSegmento(trecho('chat')));
  });

  it('a cor e translucida — o segmento marca a regiao, nao tapa a onda', () => {
    expect(corDoSegmento(trecho('silencio'))).toContain('transparent');
  });

  it('trecho sem categoria ainda recebe cor', () => {
    // Desvio legado (anterior a D-422) nao pode sair invisivel na timeline.
    expect(corDoSegmento(trecho(undefined))).toContain('color-mix');
  });
});
