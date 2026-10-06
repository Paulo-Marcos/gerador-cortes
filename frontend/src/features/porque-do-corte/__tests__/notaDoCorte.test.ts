import { describe, expect, it } from 'vitest';
import { dicaDaNota, lerNotaDoCorte, tomDaNota } from '../notaDoCorte';

// D-886 · a nota que a IA deu ao corte: o `score` da proposta (D-302), lido
// como "22/30" com as três partes.
describe('lerNotaDoCorte', () => {
  it('lê o total e as três partes, na ordem gancho, fluxo, valor', () => {
    const nota = lerNotaDoCorte({ value: 8, hook: 7, total: 22, flow: 7 });
    expect(nota).toEqual({
      total: 22,
      texto: '22/30',
      tom: 'info',
      partes: [
        { rotulo: 'Gancho', pergunta: 'O começo segura o scroll?', valor: 7 },
        { rotulo: 'Fluxo', pergunta: 'Constrói e resolve a tensão?', valor: 7 },
        { rotulo: 'Valor', pergunta: 'Quem assiste sai com algo?', valor: 8 },
      ],
    });
  });

  it('sem o total, soma as partes que vieram', () => {
    expect(lerNotaDoCorte({ hook: 9, flow: 8 })?.total).toBe(17);
  });

  it('só o total, sem partes, ainda é nota', () => {
    expect(lerNotaDoCorte({ total: 25 })).toMatchObject({ texto: '25/30', partes: [] });
  });

  it('sem nota nenhuma (corte manual, análise antiga) não há nota — nem "0/30"', () => {
    expect(lerNotaDoCorte({})).toBeNull();
    expect(lerNotaDoCorte(undefined)).toBeNull();
    expect(lerNotaDoCorte({ outra: 3 })).toBeNull();
  });
});

describe('tomDaNota', () => {
  it.each([
    [29, 'ok'],
    [24, 'ok'],
    [23, 'info'],
    [20, 'info'],
    [19, 'aviso'],
    [0, 'aviso'],
  ] as const)('total %i → %s', (total, tom) => {
    expect(tomDaNota(total)).toBe(tom);
  });
});

describe('dicaDaNota', () => {
  it('as três notas numa linha e a tecla que explica', () => {
    const nota = lerNotaDoCorte({ hook: 7, flow: 6, value: 8, total: 21 })!;
    expect(dicaDaNota(nota)).toBe('Nota da IA 21/30 (Gancho 7 · Fluxo 6 · Valor 8) — W explica por quê');
  });

  it('sem partes, só o total', () => {
    expect(dicaDaNota(lerNotaDoCorte({ total: 25 })!)).toBe('Nota da IA 25/30 — W explica por quê');
  });
});
