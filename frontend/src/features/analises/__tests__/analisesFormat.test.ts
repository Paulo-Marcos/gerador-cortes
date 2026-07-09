import { describe, it, expect } from 'vitest';
import {
  formatarSeg,
  formatarDelta,
  tomDelta,
  formatarPct,
  formatarNumero,
  rotuloSituacao,
  somarOrigens,
  resumirOrigens,
} from '../analisesFormat';

describe('formatarSeg', () => {
  it('formata M:SS abaixo de uma hora', () => {
    expect(formatarSeg(62)).toBe('1:02');
    expect(formatarSeg(9)).toBe('0:09');
  });
  it('formata H:MM:SS acima de uma hora', () => {
    expect(formatarSeg(3723)).toBe('1:02:03');
  });
  it('devolve travessão para nulo/NaN', () => {
    expect(formatarSeg(null)).toBe('—');
    expect(formatarSeg(undefined)).toBe('—');
  });
});

describe('formatarDelta', () => {
  it('usa sinal e uma casa decimal', () => {
    expect(formatarDelta(2.5)).toBe('+2.5s');
    expect(formatarDelta(-1)).toBe('−1.0s');
  });
  it('zera sem sinal', () => {
    expect(formatarDelta(0)).toBe('0s');
  });
  it('nulo vira travessão', () => {
    expect(formatarDelta(null)).toBe('—');
  });
});

describe('tomDelta', () => {
  it('classifica o sentido do delta', () => {
    expect(tomDelta(3)).toBe('pos');
    expect(tomDelta(-3)).toBe('neg');
    expect(tomDelta(0)).toBe('zero');
    expect(tomDelta(null)).toBe('nulo');
  });
});

describe('formatarPct / formatarNumero', () => {
  it('formata percentual e número', () => {
    expect(formatarPct(45.234)).toBe('45.2%');
    expect(formatarPct(null)).toBe('—');
    expect(formatarNumero(12345)).toBe('12.345');
    expect(formatarNumero(null)).toBe('—');
  });
});

describe('rotuloSituacao', () => {
  it('traduz as três situações', () => {
    expect(rotuloSituacao('com_snapshot')).toBe('Proposta da IA');
    expect(rotuloSituacao('sem_proposta_ia')).toBe('Feito na mão');
    expect(rotuloSituacao('sem_snapshot')).toBe('Legado (sem snapshot)');
  });
});

describe('somarOrigens / resumirOrigens', () => {
  it('soma as contagens', () => {
    expect(somarOrigens({ claude: 2, manual: 1 })).toBe(3);
    expect(somarOrigens(null)).toBe(0);
  });
  it('resume ordenado por contagem desc', () => {
    expect(resumirOrigens({ manual: 1, claude: 3 })).toBe('claude 3 · manual 1');
    expect(resumirOrigens({})).toBe('—');
    expect(resumirOrigens(null)).toBe('—');
  });
});
