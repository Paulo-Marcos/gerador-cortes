import { describe, expect, it } from 'vitest';
import { resumirCorte } from '../trilhaDaLive';

// D-1090: a casa Cortes diz quanto do bruto fica e quanto sai — "fica 17:43 · sai 2:28".

const resumoDosCortes = (
  inicio_seg: number,
  fim_seg: number,
  desvios: { inicio_hms: string; fim_hms: string }[] = [],
  alertas_conferir: { conferido?: boolean }[] = [],
) => resumirCorte({ inicio_seg, fim_seg, desvios, alertas_conferir }, undefined).cortes;

describe('D-1090 · fica e sai no resumo da etapa Cortes', () => {
  it('diz a duração líquida e o total que sai, em minutos e segundos', () => {
    // Bruto de 20:11; saem 2:28 em dois trechos (1:00 + 1:28).
    expect(
      resumoDosCortes(0, 1211, [
        { inicio_hms: '00:01:00.000', fim_hms: '00:02:00.000' },
        { inicio_hms: '00:10:00.000', fim_hms: '00:11:28.000' },
      ]),
    ).toBe('fica 17:43 · sai 2:28');
  });

  it('trecho dentro de outro conta uma vez', () => {
    expect(
      resumoDosCortes(0, 600, [
        { inicio_hms: '00:01:00.000', fim_hms: '00:03:00.000' },
        { inicio_hms: '00:01:30.000', fim_hms: '00:02:00.000' },
      ]),
    ).toBe('fica 8:00 · sai 2:00');
  });

  it('sem trecho, nada sai', () => {
    expect(resumoDosCortes(100, 190)).toBe('fica 1:30 · nada sai');
  });

  it('trecho fora do intervalo do corte também é nada sai', () => {
    expect(resumoDosCortes(0, 100, [{ inicio_hms: '00:10:00.000', fim_hms: '00:10:30.000' }])).toBe(
      'fica 1:40 · nada sai',
    );
  });

  it('sem trecho e com alerta aberto, o conferir continua', () => {
    expect(resumoDosCortes(0, 100, [], [{ conferido: false }])).toBe('fica 1:40 · nada sai, 1 conferir');
  });

  it('trecho de menos de meio segundo ainda aparece no que sai', () => {
    expect(resumoDosCortes(0, 100, [{ inicio_hms: '00:00:10.000', fim_hms: '00:00:10.300' }])).toBe(
      'fica 1:40 · sai 0:01',
    );
  });

  it('mantém o "N conferir" quando há alerta aberto', () => {
    expect(
      resumoDosCortes(0, 100, [{ inicio_hms: '00:00:10.000', fim_hms: '00:00:22.000' }], [
        { conferido: false },
        { conferido: false },
        { conferido: true },
      ]),
    ).toBe('fica 1:28 · sai 0:12, 2 conferir');
  });
});
