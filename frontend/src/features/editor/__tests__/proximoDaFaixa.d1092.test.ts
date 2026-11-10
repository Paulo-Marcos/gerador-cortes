import { describe, expect, it } from 'vitest';
import type { Corte } from '@/types/models';
import { findNextCorte } from '../useEditorPage';

// D-1092: a faixa "INÍCIO PRÓX" do editor mostra o próximo corte que o J/K
// visita. O riscado não é visitado nem listado, então também não é o próximo.

const corteDe = (id: string, numero: number, status = 'proposto') =>
  ({ id, numero, status }) as unknown as Corte;

describe('o próximo corte da faixa pula os riscados', () => {
  it('com um riscado logo depois, o próximo é o vivo seguinte', () => {
    const aberto = corteDe('a', 1, 'aprovado');
    const cortes = [aberto, corteDe('b', 2, 'rejeitado'), corteDe('c', 3)];
    expect(findNextCorte(cortes, aberto)?.id).toBe('c');
  });

  it('só riscados depois: não há próximo', () => {
    const aberto = corteDe('a', 1);
    expect(findNextCorte([aberto, corteDe('b', 2, 'rejeitado')], aberto)).toBeNull();
  });

  it('sem riscados, segue sendo o de número seguinte', () => {
    const aberto = corteDe('b', 2);
    const cortes = [corteDe('c', 3), corteDe('a', 1), aberto, corteDe('d', 4)];
    expect(findNextCorte(cortes, aberto)?.id).toBe('c');
  });
});
