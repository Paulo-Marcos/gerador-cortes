import { describe, expect, it, vi } from 'vitest';
import { ESPERA_DO_ATUALIZANDO_MS, agendarSincronia, type Sincronia } from '../useSincronia';

// D-1160 (auditoria, rodada 1) · A espera de 600 ms do "atualizando" é o que impede o leitor
// de tela de anunciar cada volta de 3 s da live; precisa de prova com timers falsos.

describe('a espera do "atualizando" (a live repete as buscas a cada 3 s)', () => {
  it('busca que acaba antes da espera nunca vira "atualizando"; a que dura, vira', () => {
    vi.useFakeTimers();
    try {
      const mostradas: Sincronia[] = [];
      const cancelar = agendarSincronia('atualizando', (s) => mostradas.push(s));
      vi.advanceTimersByTime(ESPERA_DO_ATUALIZANDO_MS - 1);
      expect(mostradas).toEqual([]);
      cancelar(); // a busca acabou: o chamador cancela
      vi.advanceTimersByTime(10_000);
      expect(mostradas).toEqual([]);

      agendarSincronia('atualizando', (s) => mostradas.push(s));
      vi.advanceTimersByTime(ESPERA_DO_ATUALIZANDO_MS);
      expect(mostradas).toEqual(['atualizando']);
    } finally {
      vi.useRealTimers();
    }
  });

  it('erro e "em dia" valem na hora, sem esperar', () => {
    const mostradas: Sincronia[] = [];
    agendarSincronia('erro', (s) => mostradas.push(s));
    agendarSincronia('sincronizado', (s) => mostradas.push(s));
    expect(mostradas).toEqual(['erro', 'sincronizado']);
  });

  it('o hook usa a espera padrão de 600 ms', () => {
    expect(ESPERA_DO_ATUALIZANDO_MS).toBe(600);
  });
});
