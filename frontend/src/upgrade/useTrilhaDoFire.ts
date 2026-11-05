import { useLocation } from 'react-router-dom';
import { useFires } from '@/features/shorts/useFires';
import { usePublicacoesDoCorte, useRelerPublicacoesDoLote } from '@/features/shorts/useLotePublicacao';
import { useShortsDoCorte } from '@/features/shorts/useShortsDoCorte';
import { comOQueATelaVe, trilhaDoFire } from './trilhaDoFire';
import { corteDaRota, type TelaId } from './upgradeRoutes';
import { useTrilhaDaLive } from './useTrilhaDaLive';

/** D-1051: conta pelas consultas dos cartões da tela; a lista dos Fires dá o resto. */
export function useTrilhaDoFire(tela: TelaId) {
  const corteId = corteDaRota(useLocation().pathname);
  const noFire = tela === 'fire' || tela === 'prateleira';
  const doCorte = noFire ? (corteId ?? '') : '';
  const fire = useFires(noFire).data?.fires.find((f) => f.corte_id === corteId);
  const shorts = useShortsDoCorte(doCorte).data?.shorts;
  const publicacoes = usePublicacoesDoCorte(doCorte, noFire).data?.publicacoes;
  useRelerPublicacoesDoLote(doCorte);
  return trilhaDoFire(tela, corteId, fire && comOQueATelaVe(fire, shorts, publicacoes));
}

/** A faixa de etapas da tela aberta: a da live ou a do Fire. As duas nunca valem juntas. */
export function useTrilhaDaTela(tela: TelaId, projetoId: string | null) {
  const daLive = useTrilhaDaLive(tela, projetoId);
  const doFire = useTrilhaDoFire(tela);
  return doFire.length > 0 ? doFire : daLive;
}
