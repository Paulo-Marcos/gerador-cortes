import type { Corte, Desvio } from '@/types/models';

export type WaveformWindow = {
  corteId: string;
  startSec: number;
  endSec: number;
  version: string;
  // D-451: o respiro com que ESTA janela foi montada. Guardado junto porque a
  // janela e memoizada entre renders: sem isso, um ajuste que chega da API
  // depois do primeiro render nunca seria aplicado, e o `startSec` congelado
  // deslocaria a onda em relacao ao video pela diferenca entre os dois valores.
  preloadBeforeSec: number;
  preloadAfterSec: number;
};

type ResolveWaveformWindowParams = {
  current: WaveformWindow | null;
  corteId: string;
  inicioSeg: number;
  fimSeg: number;
  refreshKey: number;
  preloadBeforeSec: number;
  preloadAfterSec: number;
};

export function mergeDirtyPatch(current: Partial<Corte>, patch: Partial<Corte>): Partial<Corte> {
  return { ...current, ...patch };
}

export function applyDesvioChange(
  persistedDesvios: Desvio[],
  currentDirty: Partial<Corte>,
  idx: number,
  novoInicio: string,
  novoFim: string,
): Partial<Corte> | null {
  const baseDesvios = currentDirty.desvios ?? persistedDesvios;
  const nextDesvios = [...baseDesvios];
  if (!nextDesvios[idx]) return null;

  nextDesvios[idx] = {
    ...nextDesvios[idx],
    inicio_hms: novoInicio,
    fim_hms: novoFim,
  };

  return mergeDirtyPatch(currentDirty, { desvios: nextDesvios });
}

export function resolveWaveformWindow({
  current,
  corteId,
  inicioSeg,
  fimSeg,
  refreshKey,
  preloadBeforeSec,
  preloadAfterSec,
}: ResolveWaveformWindowParams): WaveformWindow {
  const forceRefresh = refreshKey > 0;
  const mesmoContexto =
    current?.preloadBeforeSec === preloadBeforeSec &&
    current?.preloadAfterSec === preloadAfterSec;
  const currentContainsCut =
    current?.corteId === corteId &&
    inicioSeg >= current.startSec &&
    fimSeg <= current.endSec &&
    mesmoContexto &&
    !forceRefresh;

  if (currentContainsCut) return current;

  const startSec = Math.max(0, inicioSeg - preloadBeforeSec);
  const endSec = fimSeg + preloadAfterSec;

  return {
    corteId,
    startSec,
    endSec,
    version: `${startSec}_${endSec}_${refreshKey}`,
    preloadBeforeSec,
    preloadAfterSec,
  };
}
