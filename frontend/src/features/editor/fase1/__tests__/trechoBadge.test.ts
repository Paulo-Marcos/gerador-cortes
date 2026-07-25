import { describe, expect, it } from 'vitest';
import { inferirCategoriaDoMotivo, resolverBadgeTrecho } from '../trechoBadge';
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

describe('resolverBadgeTrecho — desvios legados (sem categoria)', () => {
  it('infere a categoria pelo motivo de cortes já analisados', () => {
    expect(
      resolverBadgeTrecho(desvio({ origem: 'claude', motivo: 'desvio ESTRUTURAL: digressão sobre' }))
        .label,
    ).toBe('tangente');
    expect(
      resolverBadgeTrecho(
        desvio({ origem: 'claude', motivo: 'muletas e reações soltas após o vídeo' }),
      ).label,
    ).toBe('muleta');
    expect(
      resolverBadgeTrecho(desvio({ origem: 'tecnico', motivo: 'Silêncio Detectado (IA/Técnico)' }))
        .label,
    ).toBe('silencio');
  });

  it('cai no badge por origem quando o motivo não diz nada — comportamento pré-D-422', () => {
    expect(resolverBadgeTrecho(desvio({ origem: 'claude', motivo: 'algo qualquer' })).label).toBe(
      'IA',
    );
    expect(resolverBadgeTrecho(desvio({ origem: 'manual', motivo: 'Trecho manual' })).label).toBe(
      'manual',
    );
    expect(resolverBadgeTrecho(desvio({ origem: 'gemini', motivo: '' })).label).toBe('IA Gemini');
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

describe('inferirCategoriaDoMotivo', () => {
  it('reconhece o aviso de imprecisão escrito pela skill', () => {
    expect(inferirCategoriaDoMotivo('Possível imprecisão — data da guerra')).toBe('imprecisao');
  });

  it('devolve null sem pista no texto', () => {
    expect(inferirCategoriaDoMotivo('')).toBeNull();
    expect(inferirCategoriaDoMotivo('trecho')).toBeNull();
  });
});
