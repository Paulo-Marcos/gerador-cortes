import { describe, expect, it } from 'vitest';
import {
  ESPERA_MAXIMA_PARA_RELIGAR_MS,
  deveReligar,
  esperaParaReligar,
} from '../useProjetoDetalhe';

// D-661: o WebSocket de progresso religa quando a conexão CAI — e só aí. O
// backend fecha de propósito depois de `pronto`/`erro` e responde
// `sem_progresso` + fecha quando não há nada rodando (o caso comum).

describe('quando religar o progresso (D-661)', () => {
  it('queda sem mensagem nenhuma religa', () => {
    expect(deveReligar(null)).toBe(true);
  });

  it('queda no meio do download religa', () => {
    expect(deveReligar('baixando')).toBe(true);
    expect(deveReligar('transcrevendo')).toBe(true);
  });

  it('fim declarado pelo servidor não religa', () => {
    expect(deveReligar('pronto')).toBe(false);
    expect(deveReligar('erro')).toBe(false);
  });

  it('projeto sem nada rodando não vira laço de reconexão', () => {
    expect(deveReligar('sem_progresso')).toBe(false);
  });
});

describe('espera entre tentativas (D-661)', () => {
  it('dobra a cada tentativa: 1 s, 2 s, 4 s, 8 s', () => {
    expect([0, 1, 2, 3].map(esperaParaReligar)).toEqual([1000, 2000, 4000, 8000]);
  });

  it('para de crescer em 30 s', () => {
    expect(esperaParaReligar(5)).toBe(ESPERA_MAXIMA_PARA_RELIGAR_MS);
    expect(esperaParaReligar(50)).toBe(ESPERA_MAXIMA_PARA_RELIGAR_MS);
  });
});
