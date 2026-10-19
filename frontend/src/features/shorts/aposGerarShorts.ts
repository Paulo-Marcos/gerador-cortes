import type { QueryClient } from '@tanstack/react-query';
import { atualizarLegendasDoCorte, esquecerLegendasDosCortes } from './legendasDoCorte';
import { ANDAMENTO_DAS_LIVES_KEY, FIRES_KEY } from './useFires';
import { shortsDoCorteKey } from './useShortsDoCorte';

// D-973: o que a fábrica de shorts descarta depois de gerar. Refazer o bruto
// passa pela salvaguarda de silêncios, que ressincroniza a transcrição do corte
// mesmo sem `refazer_transcricao` — a legenda guardada da prévia fica velha.

export function aoGerarShortsDoFire(qc: QueryClient, corteId: string) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: FIRES_KEY }),
    qc.invalidateQueries({ queryKey: shortsDoCorteKey(corteId) }),
    atualizarLegendasDoCorte(qc, corteId),
  ]);
}

/** A live inteira roda em segundo plano: as legendas ficam marcadas como velhas. */
export function aoDispararLive(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ANDAMENTO_DAS_LIVES_KEY }),
    esquecerLegendasDosCortes(qc),
  ]);
}
