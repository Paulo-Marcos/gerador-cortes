import { describe, expect, it } from 'vitest';
import { resolverBadgeTrecho } from '../trechoBadge';
import type { Desvio } from '@/types/models';

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
