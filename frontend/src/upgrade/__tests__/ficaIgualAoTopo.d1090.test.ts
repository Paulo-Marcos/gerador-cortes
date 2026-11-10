import { describe, expect, it } from 'vitest';
import { calcularDuracaoLiquida, hmsParaSeg, segParaMmSs } from '@/features/editor/timeUtils';
import { resumirCorte } from '../trilhaDaLive';

// D-1090 (auditoria r1): com líquida fracionária, o "fica" da trilha arredondava e o
// "líquido" do topo do editor (EditorPage, segParaMmSs) cortava a fração: a mesma tela
// dava 17:43 e 17:42. O fica corta como o topo, e fica + sai fecha com o bruto exibido.

type Trecho = { inicio_hms: string; fim_hms: string };

/** "17:42" ou "1:02:03" em segundos. */
const emSegundos = (texto: string) => texto.split(':').reduce((total, parte) => total * 60 + Number(parte), 0);

function medir(inicio_seg: number, fim_seg: number, desvios: Trecho[]) {
  const resumo = resumirCorte({ inicio_seg, fim_seg, desvios }, undefined).cortes!;
  const [, fica, sai] = /^fica (\S+) · (?:sai (\S+)|nada sai)$/.exec(resumo)!;
  return {
    resumo,
    fica: emSegundos(fica),
    sai: sai ? emSegundos(sai) : 0,
    topo: hmsParaSeg(`00:${segParaMmSs(calcularDuracaoLiquida(inicio_seg, fim_seg, desvios))}`),
    bruto: hmsParaSeg(`00:${segParaMmSs(fim_seg - inicio_seg)}`),
  };
}

describe('D-1090 · o fica da trilha é o líquido do topo', () => {
  // Bruto de 20:11 e 148,4 s de trechos: líquida de 1062,6 s.
  const FRACIONARIA: Trecho[] = [
    { inicio_hms: '00:01:00.000', fim_hms: '00:02:00.000' },
    { inicio_hms: '00:10:00.000', fim_hms: '00:11:28.400' },
  ];

  it('líquida de 1062,6 s: fica 17:42, como o topo, e sai 2:29', () => {
    expect(medir(0, 1211, FRACIONARIA).resumo).toBe('fica 17:42 · sai 2:29');
  });

  it.each([
    ['líquida fracionária', 0, 1211, FRACIONARIA],
    ['trecho de 0,3 s', 0, 100, [{ inicio_hms: '00:00:10.000', fim_hms: '00:00:10.300' }]],
    ['bruto fracionário', 0.4, 1211.9, [{ inicio_hms: '00:05:00.250', fim_hms: '00:06:10.900' }]],
    ['trecho dentro de outro', 0, 600, [
      { inicio_hms: '00:01:00.000', fim_hms: '00:03:00.600' },
      { inicio_hms: '00:01:30.000', fim_hms: '00:02:00.000' },
    ]],
  ] as const)('%s: o topo e a trilha dão o mesmo número, e fica + sai fecha com o bruto', (_, ini, fim, desvios) => {
    const m = medir(ini, fim, [...desvios]);
    expect(m.fica).toBe(m.topo);
    expect(m.fica + m.sai).toBe(m.bruto);
  });
});
