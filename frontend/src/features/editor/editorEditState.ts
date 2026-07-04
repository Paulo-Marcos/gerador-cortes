import type { Corte, Desvio } from '@/types/models';

export type WaveformWindow = {
  corteId: string;
  startSec: number;
  endSec: number;
  version: string;
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
  const currentContainsCut =
    current?.corteId === corteId &&
    inicioSeg >= current.startSec &&
    fimSeg <= current.endSec &&
    !forceRefresh;

  if (currentContainsCut) return current;

  const startSec = Math.max(0, inicioSeg - preloadBeforeSec);
  const endSec = fimSeg + preloadAfterSec;

  return {
    corteId,
    startSec,
    endSec,
    version: `${startSec}_${endSec}_${refreshKey}`,
  };
}
