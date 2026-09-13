import { describe, expect, it } from 'vitest';
import {
  combinaComBusca,
  contarPorFiltro,
  filtrarFires,
  passaNoFiltro,
  progressoDaCuradoria,
  temEdicao,
} from '../filtrosDosFires';
import type { FireComBruto } from '../shortsApi';

// D-581: a regra do filtro, testada fora da tela.
//
// Vale a lição da D-516: regra de lista escondida em componente é regra que
// ninguém revisa — foi assim que a lista do TikTok herdou uma condição do
// YouTube e os cortes começaram a sumir dela.

function fire(over: Partial<FireComBruto> = {}): FireComBruto {
  return {
    corte_id: 'c1',
    projeto_id: 'p1',
    projeto_titulo: 'Live de terça',
    numero: 1,
    titulo: 'O juro composto',
    tema_central: 'finanças',
    duracao_seg: 600,
    tem_bruto: true,
    live_em_disco: true,
    bruto_mb: 120,
    is_fire: true,
    indicado: false,
    tem_video_final: false,
    shorts: { total: 0, sugerido: 0, aprovado: 0, rejeitado: 0, renderizado: 0 },
    ...over,
  };
}

describe('temEdicao', () => {
  it('confia no que o backend disse', () => {
    expect(temEdicao(fire({ tem_edicao: true }))).toBe(true);
    // Sinal contrário do backend VENCE as contagens: ele vê gancho e palco,
    // que não aparecem em contagem nenhuma.
    expect(
      temEdicao(
        fire({
          tem_edicao: false,
          shorts: { total: 3, sugerido: 0, aprovado: 3, rejeitado: 0, renderizado: 0 },
        }),
      ),
    ).toBe(false);
  });

  it('sem o campo, cai na curadoria visível', () => {
    expect(
      temEdicao(fire({ shorts: { total: 3, sugerido: 2, aprovado: 1, rejeitado: 0, renderizado: 0 } })),
    ).toBe(true);
    expect(
      temEdicao(fire({ shorts: { total: 3, sugerido: 3, aprovado: 0, rejeitado: 0, renderizado: 0 } })),
    ).toBe(false);
  });
});

describe('passaNoFiltro', () => {
  const intocado = fire({
    tem_edicao: false,
    shorts: { total: 4, sugerido: 4, aprovado: 0, rejeitado: 0, renderizado: 0 },
  });
  const emAndamento = fire({
    tem_edicao: true,
    shorts: { total: 4, sugerido: 2, aprovado: 2, rejeitado: 0, renderizado: 0 },
  });
  const comPronto = fire({
    tem_edicao: true,
    shorts: { total: 2, sugerido: 0, aprovado: 1, rejeitado: 0, renderizado: 1 },
  });

  it('"todos" não exclui ninguém', () => {
    for (const f of [intocado, emAndamento, comPronto]) {
      expect(passaNoFiltro(f, 'todos')).toBe(true);
    }
  });

  it('"estou mexendo" pega só o que tem mão humana', () => {
    expect(passaNoFiltro(emAndamento, 'editando')).toBe(true);
    expect(passaNoFiltro(intocado, 'editando')).toBe(false);
  });

  it('"não comecei" exige ter candidatos', () => {
    expect(passaNoFiltro(intocado, 'novos')).toBe(true);
    expect(passaNoFiltro(emAndamento, 'novos')).toBe(false);
    // Corte sem candidato nenhum não é "não comecei": é "não há o que fazer
    // aqui", e mandá-lo para esta aba abriria um corte vazio.
    expect(passaNoFiltro(fire({ tem_edicao: false }), 'novos')).toBe(false);
  });

  it('"tem pronto" exige MP4 final', () => {
    expect(passaNoFiltro(comPronto, 'prontos')).toBe(true);
    expect(passaNoFiltro(emAndamento, 'prontos')).toBe(false);
  });

  it('"sem bruto" é sobre o disco, não sobre a curadoria', () => {
    expect(passaNoFiltro(fire({ tem_bruto: false }), 'sem_bruto')).toBe(true);
    expect(passaNoFiltro(comPronto, 'sem_bruto')).toBe(false);
  });

  it('D-593: o finalizado sai de toda aba da fila e só aparece na própria', () => {
    const fechado = { ...comPronto, tem_bruto: false, finalizado_em: '2026-09-13T10:00:00' };
    for (const aba of ['todos', 'editando', 'novos', 'prontos', 'sem_bruto'] as const) {
      expect(passaNoFiltro(fechado, aba)).toBe(false);
    }
    expect(passaNoFiltro(fechado, 'finalizados')).toBe(true);
  });

  it('D-593: reaberto (carimbo nulo) volta para a fila', () => {
    const reaberto = { ...comPronto, finalizado_em: null };
    expect(passaNoFiltro(reaberto, 'todos')).toBe(true);
    expect(passaNoFiltro(reaberto, 'finalizados')).toBe(false);
  });
});

describe('contarPorFiltro', () => {
  it('conta cada Fire em todas as abas em que ele cabe', () => {
    const lista = [
      fire({ corte_id: 'a', tem_edicao: false, shorts: { total: 2, sugerido: 2, aprovado: 0, rejeitado: 0, renderizado: 0 } }),
      fire({ corte_id: 'b', tem_edicao: true, shorts: { total: 2, sugerido: 0, aprovado: 1, rejeitado: 0, renderizado: 1 } }),
    ];
    const contagem = contarPorFiltro(lista);
    expect(contagem.todos).toBe(2);
    expect(contagem.editando).toBe(1);
    expect(contagem.novos).toBe(1);
    expect(contagem.prontos).toBe(1);
    expect(contagem.sem_bruto).toBe(0);
    expect(contagem.finalizados).toBe(0);
  });
});

describe('combinaComBusca', () => {
  it('acha pelo título, pela live ou pelo tema', () => {
    const f = fire();
    expect(combinaComBusca(f, 'juro')).toBe(true);
    expect(combinaComBusca(f, 'TERÇA')).toBe(true);
    expect(combinaComBusca(f, 'finanç')).toBe(true);
    expect(combinaComBusca(f, 'imóveis')).toBe(false);
  });

  it('busca vazia não filtra nada', () => {
    expect(combinaComBusca(fire(), '   ')).toBe(true);
  });
});

describe('filtrarFires', () => {
  it('aplica filtro E busca', () => {
    const lista = [
      fire({ corte_id: 'a', titulo: 'juros', tem_edicao: true }),
      fire({ corte_id: 'b', titulo: 'imóveis', tem_edicao: true }),
      fire({ corte_id: 'c', titulo: 'juros', tem_edicao: false }),
    ];
    expect(filtrarFires(lista, 'editando', 'juros').map((f) => f.corte_id)).toEqual(['a']);
  });
});

describe('progressoDaCuradoria', () => {
  it('rejeitado conta como andado — rejeitar é decidir', () => {
    const f = fire({ shorts: { total: 4, sugerido: 1, aprovado: 1, rejeitado: 2, renderizado: 0 } });
    expect(progressoDaCuradoria(f)).toBeCloseTo(0.75);
  });

  it('sem candidato não há progresso a mostrar', () => {
    expect(progressoDaCuradoria(fire())).toBe(0);
  });
});
