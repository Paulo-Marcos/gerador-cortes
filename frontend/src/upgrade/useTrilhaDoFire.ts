import { useLocation } from 'react-router-dom';
import { useFires } from '@/features/shorts/useFires';
import { trilhaDoFire } from './trilhaDoFire';
import { corteDaRota, type TelaId } from './upgradeRoutes';
import { useTrilhaDaLive } from './useTrilhaDaLive';

/** D-1051: conta pela lista dos Fires, que aprovar, renderizar e publicar já mandam reler. */
export function useTrilhaDoFire(tela: TelaId) {
  const corteId = corteDaRota(useLocation().pathname);
  const noFire = tela === 'fire' || tela === 'prateleira';
  const fires = useFires(noFire).data?.fires;
  return trilhaDoFire(tela, corteId, fires?.find((f) => f.corte_id === corteId));
}

/** A faixa de etapas da tela aberta: a da live ou a do Fire. As duas nunca valem juntas. */
export function useTrilhaDaTela(tela: TelaId, projetoId: string | null) {
  const daLive = useTrilhaDaLive(tela, projetoId);
  const doFire = useTrilhaDoFire(tela);
  return doFire.length > 0 ? doFire : daLive;
}
