import { describe, expect, it } from 'vitest';
import type { FaixaDoPublico } from '../api/escalonamento';
import {
  faixasDaGrade,
  gradeDasFaixas,
  gradesIguais,
  proximaIntensidade,
  resumoDoDia,
  trocarCelula,
} from '../escalonamentoPublico';

/**
 * D-908. A tela desenha uma grade; o backend guarda faixas. Se a ida e volta
 * perdesse uma hora, o operador pintaria "forte das 15h às 23h" e o canal
 * gravaria outra coisa — sem ninguém ver.
 */
const FAIXAS: FaixaDoPublico[] = [
  { dia: 0, inicio: 0, fim: 9, intensidade: 'fraco' },
  { dia: 0, inicio: 9, fim: 15, intensidade: 'medio' },
  { dia: 0, inicio: 15, fim: 23, intensidade: 'forte' },
  { dia: 0, inicio: 23, fim: 24, intensidade: 'medio' },
];

describe('faixas → grade → faixas', () => {
  it('a grade tem 7 dias de 24 horas e pinta o que as faixas dizem', () => {
    const grade = gradeDasFaixas(FAIXAS);

    expect(grade).toHaveLength(7);
    expect(grade[0]).toHaveLength(24);
    expect(grade[0][3]).toBe('fraco');
    expect(grade[0][12]).toBe('medio');
    expect(grade[0][20]).toBe('forte');
    // Dia sem faixa nenhuma vale "médio", como o domínio assume.
    expect(grade[3][20]).toBe('medio');
  });

  it('a volta junta horas vizinhas iguais e reconstrói as faixas', () => {
    const faixasDaSegunda = faixasDaGrade(gradeDasFaixas(FAIXAS)).filter((f) => f.dia === 0);

    expect(faixasDaSegunda).toEqual(FAIXAS);
  });

  it('faixa fora do dia não derruba a grade', () => {
    const grade = gradeDasFaixas([{ dia: 9, inicio: 0, fim: 30, intensidade: 'forte' }]);

    expect(grade.every((linha) => linha.every((v) => v === 'medio'))).toBe(true);
  });
});

describe('o clique', () => {
  it('gira fraco → médio → forte → fraco', () => {
    expect(proximaIntensidade('fraco')).toBe('medio');
    expect(proximaIntensidade('medio')).toBe('forte');
    expect(proximaIntensidade('forte')).toBe('fraco');
  });

  it('troca uma célula só, sem mexer no resto', () => {
    const antes = gradeDasFaixas(FAIXAS);
    const depois = trocarCelula(antes, 0, 20);

    expect(depois[0][20]).toBe('fraco');
    expect(depois[0][19]).toBe('forte');
    expect(gradesIguais(antes, depois)).toBe(false);
    expect(gradesIguais(antes, trocarCelula(trocarCelula(trocarCelula(antes, 0, 20), 0, 20), 0, 20))).toBe(
      true,
    );
  });
});

describe('o resumo do dia', () => {
  it('lê como o relatório: forte e fraco, por faixa', () => {
    expect(resumoDoDia(gradeDasFaixas(FAIXAS)[0])).toBe('fraco 0h–9h · forte 15h–23h');
    expect(resumoDoDia(gradeDasFaixas([])[0])).toBe('médio o dia inteiro');
  });
});
