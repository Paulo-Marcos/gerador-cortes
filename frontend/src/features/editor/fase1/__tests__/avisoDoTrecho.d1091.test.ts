import { describe, expect, it } from 'vitest';
import type { Desvio } from '@/types/models';
import { avisoDoTrechoEm, blocoQueSaiEm, formatarDuracao } from '../avisoDoTrecho';

// D-1091: com o cursor num trecho que sai, o preview diz "SAI · 17 s · SILÊNCIO",
// a justificativa e onde a emenda volta.

const trecho = (inicio: string, fim: string, extra: Partial<Desvio> = {}): Desvio => ({
  inicio_hms: inicio,
  fim_hms: fim,
  motivo: 'Vídeo sem diálogo útil.',
  categoria: 'silencio',
  ...extra,
});

describe('avisoDoTrechoEm (D-1091)', () => {
  it('dentro do trecho: duração, categoria, justificativa e emenda', () => {
    const aviso = avisoDoTrechoEm([trecho('00:05:05', '00:05:22')], 310);
    expect(aviso).toEqual({
      titulo: 'sai · 17 s · silencio',
      justificativa: 'Vídeo sem diálogo útil.',
      inicio: 305,
      emenda: 322,
    });
  });

  it('fora de qualquer trecho, não há aviso', () => {
    const desvios = [trecho('00:05:05', '00:05:22')];
    expect(avisoDoTrechoEm(desvios, 304.9)).toBeNull();
    expect(avisoDoTrechoEm(desvios, 322)).toBeNull();
  });

  it('o trecho dentro de outro conta uma vez: a emenda é a do bloco inteiro', () => {
    const desvios = [trecho('00:16:45', '00:18:41', { motivo: 'fora' }), trecho('00:17:35', '00:18:34')];
    const aviso = avisoDoTrechoEm(desvios, 17 * 60 + 40);
    expect(aviso?.emenda).toBe(18 * 60 + 41);
    expect(aviso?.titulo).toBe('sai · 1:56 · silencio');
  });

  it('trechos que se encostam saem juntos: a emenda é depois do último', () => {
    const desvios = [trecho('00:00:10', '00:00:20'), trecho('00:00:20', '00:00:25'), trecho('00:01:00', '00:01:05')];
    expect(blocoQueSaiEm(desvios, 12)).toEqual({ inicio: 10, fim: 25 });
    expect(blocoQueSaiEm(desvios, 61)).toEqual({ inicio: 60, fim: 65 });
    expect(blocoQueSaiEm(desvios, 30)).toBeNull();
  });

  it('sem categoria nem motivo curto, o título fica só com a duração', () => {
    const longo = 'um motivo muito comprido que não cabe numa etiqueta';
    const aviso = avisoDoTrechoEm([trecho('00:00:10', '00:00:20', { categoria: undefined, motivo: longo })], 15);
    expect(aviso?.titulo).toBe('sai · 10 s');
  });
});

describe('formatarDuracao (D-1091)', () => {
  it('décimos abaixo de 10 s, segundos até 1 min, minutos depois', () => {
    expect(formatarDuracao(0.8)).toBe('0,8 s');
    expect(formatarDuracao(17)).toBe('17 s');
    expect(formatarDuracao(116)).toBe('1:56');
    expect(formatarDuracao(60)).toBe('1:00');
  });
});
