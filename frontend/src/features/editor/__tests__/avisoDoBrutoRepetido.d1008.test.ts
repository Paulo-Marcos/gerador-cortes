import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { avisarSeBrutoOcupado } from '../useBruto';

// D-1008: o teclado repete a tecla segurada e o atalho não filtra a repetição;
// cada uma virava um toast, e segurar Ctrl+G empilhava avisos iguais na tela.

describe('D-1008 · o aviso de ocupado não se repete', () => {
  // O relógio anda entre os casos: o último aviso de um não cala o seguinte.
  let agora = Date.now();
  beforeEach(() => {
    agora += 60_000;
    vi.useFakeTimers({ now: agora });
  });
  afterEach(() => vi.useRealTimers());

  it('segurar a tecla dá um aviso só, e ela segue contando como ocupado', () => {
    const notify = vi.fn();
    for (let repeticao = 0; repeticao < 15; repeticao += 1) {
      expect(avisarSeBrutoOcupado(true, notify)).toBe(true);
      vi.advanceTimersByTime(33);
    }
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it('com o aviso anterior já fora da tela, o próximo aperto avisa de novo', () => {
    const notify = vi.fn();
    avisarSeBrutoOcupado(true, notify);
    vi.advanceTimersByTime(3200);
    avisarSeBrutoOcupado(true, notify);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});
