import { describe, expect, it } from 'vitest';
import type { Corte, Desvio } from '@/types/models';
import { applyDesvioChange, mergeDirtyPatch, resolveWaveformWindow } from '../editorEditState';

function desvio(inicio: string, fim: string, motivo = 'trecho'): Desvio {
  return { inicio_hms: inicio, fim_hms: fim, motivo };
}

describe('estado sujo do editor', () => {
  it('acumula várias alterações de trechos antes de salvar', () => {
    const persisted = [
      desvio('00:00:10', '00:00:20', 'primeiro'),
      desvio('00:00:30', '00:00:40', 'segundo'),
    ];

    const afterFirst = applyDesvioChange(persisted, {}, 0, '00:00:11', '00:00:21');
    expect(afterFirst?.desvios?.[0]).toMatchObject({ inicio_hms: '00:00:11', fim_hms: '00:00:21' });

    const afterSecond = applyDesvioChange(persisted, afterFirst ?? {}, 1, '00:00:31', '00:00:41');

    expect(afterSecond?.desvios).toEqual([
      { inicio_hms: '00:00:11', fim_hms: '00:00:21', motivo: 'primeiro' },
      { inicio_hms: '00:00:31', fim_hms: '00:00:41', motivo: 'segundo' },
    ]);
  });

  it('preserva outras mudanças pendentes ao alterar um trecho', () => {
    const currentDirty: Partial<Corte> = mergeDirtyPatch({}, { titulo_proposto: 'Novo titulo' });

    const next = applyDesvioChange(
      [desvio('00:00:10', '00:00:20')],
      currentDirty,
      0,
      '00:00:12',
      '00:00:22',
    );

    expect(next).toMatchObject({
      titulo_proposto: 'Novo titulo',
      desvios: [{ inicio_hms: '00:00:12', fim_hms: '00:00:22', motivo: 'trecho' }],
    });
  });
});

describe('janela incremental da waveform', () => {
  it('reusa a janela carregada quando o corte salvo ainda cabe no buffer existente', () => {
    const initial = resolveWaveformWindow({
      current: null,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    const next = resolveWaveformWindow({
      current: initial,
      corteId: 'corte-1',
      inicioSeg: 80,
      fimSeg: 230,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    expect(next).toBe(initial);
  });

  it('cria uma nova janela quando o corte sai do buffer carregado', () => {
    const initial = resolveWaveformWindow({
      current: null,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    const next = resolveWaveformWindow({
      current: initial,
      corteId: 'corte-1',
      inicioSeg: 30,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    expect(next).not.toBe(initial);
    expect(next).toMatchObject({ startSec: 0, endSec: 500 });
  });

  it('força nova janela quando o usuário pede atualização da onda', () => {
    const initial = resolveWaveformWindow({
      current: null,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 0,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    const next = resolveWaveformWindow({
      current: initial,
      corteId: 'corte-1',
      inicioSeg: 100,
      fimSeg: 200,
      refreshKey: 123,
      preloadBeforeSec: 60,
      preloadAfterSec: 300,
    });

    expect(next).not.toBe(initial);
    expect(next.version).toBe('40_500_123');
  });
});
