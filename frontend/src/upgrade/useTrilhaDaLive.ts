import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useCortesProjeto } from '@/features/editor/useCortes';
import { useExportStatus, useProjeto } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { dadosDaLive, dentroDeUmaLive, filtroNoArLigado, trilhaDaLive } from './trilhaDaLive';
import { corteDaLive, type TelaId } from './upgradeRoutes';

/**
 * D-866: a trilha da live com os dados de verdade. Leva ao corte aberto, não
 * ao primeiro da live (D-798), e conta pelas mesmas queries que as telas da
 * live já fazem — mesmas chaves, então chegam do cache e o polling do export
 * não dobra. Fora de uma live as queries ficam desligadas.
 */
export function useTrilhaDaLive(tela: TelaId, projetoId: string | null) {
  const { pathname, search } = useLocation();
  const corteId = corteDaLive(pathname, search);
  const filtroNoAr = tela === 'projeto' && filtroNoArLigado(search);
  const daLive = projetoId && dentroDeUmaLive(tela) ? projetoId : undefined;
  const projeto = useProjeto(daLive).data;
  const cortes = useCortesProjeto(daLive).data;
  const exportados = useExportStatus(daLive).data?.cortes;
  return useMemo(
    () =>
      trilhaDaLive(tela, projetoId, corteId, dadosDaLive(projeto, cortes, exportados), filtroNoAr),
    [tela, projetoId, corteId, projeto, cortes, exportados, filtroNoAr],
  );
}
