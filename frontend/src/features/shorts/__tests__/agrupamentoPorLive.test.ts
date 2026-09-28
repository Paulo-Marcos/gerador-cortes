import { describe, expect, it } from 'vitest';
import { agruparPorLive, estaPendente } from '../agrupamentoPorLive';
import type { FireComBruto } from '../shortsApi';

function fire(parcial: Partial<FireComBruto> & { corte_id: string }): FireComBruto {
  return {
    projeto_id: 'p1',
    projeto_titulo: 'Live 1',
    numero: 1,
    titulo: '',
    tema_central: '',
    duracao_seg: 60,
    tem_bruto: true,
    bruto_mb: 10,
    is_fire: true,
    indicado: false,
    tem_video_final: false,
    live_em_disco: true,
    tem_edicao: false,
    finalizado_em: null,
    shorts: { total: 3, sugerido: 3, aprovado: 0, rejeitado: 0, renderizado: 0 },
    ...parcial,
  } as FireComBruto;
}

describe('estaPendente — a mesma regra que a fábrica da live usa no backend', () => {
  it('sem bruto ou sem candidato, e ainda aberto', () => {
    expect(estaPendente(fire({ corte_id: 'a', tem_bruto: false }))).toBe(true);
    expect(
      estaPendente(fire({ corte_id: 'b', shorts: { total: 0, sugerido: 0, aprovado: 0, rejeitado: 0, renderizado: 0 } })),
    ).toBe(true);
    expect(estaPendente(fire({ corte_id: 'c' }))).toBe(false);
    expect(estaPendente(fire({ corte_id: 'd', tem_bruto: false, finalizado_em: '2026-09-01' }))).toBe(false);
  });
});

describe('agruparPorLive', () => {
  it('junta os cortes da mesma live na ordem em que a lista trouxe as lives', () => {
    const lista = [
      fire({ corte_id: 'x2', projeto_id: 'p2', projeto_titulo: 'Live 2', numero: 5 }),
      fire({ corte_id: 'x1', numero: 3 }),
      fire({ corte_id: 'y2', projeto_id: 'p2', projeto_titulo: 'Live 2', numero: 2 }),
    ];

    const grupos = agruparPorLive(lista, lista);

    expect(grupos.map((g) => g.projetoId)).toEqual(['p2', 'p1']);
    // Dentro da live, na ordem dos cortes — a que o operador conhece.
    expect(grupos[0].fires.map((f) => f.numero)).toEqual([2, 5]);
  });

  it('conta os pendentes pela live INTEIRA, não só pelo que o filtro mostra', () => {
    const todos = [
      fire({ corte_id: 'a', tem_bruto: false, live_em_disco: false }),
      fire({ corte_id: 'b', tem_bruto: false, live_em_disco: false }),
      fire({ corte_id: 'c', live_em_disco: false }),
    ];

    const [grupo] = agruparPorLive([todos[2]], todos);

    expect(grupo.fires.map((f) => f.corte_id)).toEqual(['c']);
    expect(grupo.totalDaLive).toBe(3);
    expect(grupo.pendentes).toBe(2);
    expect(grupo.precisaBaixar).toBe(true);
  });

  it('com a live no disco, gerar não precisa baixar', () => {
    const todos = [fire({ corte_id: 'a', tem_bruto: false })];

    expect(agruparPorLive(todos, todos)[0].precisaBaixar).toBe(false);
  });
});
