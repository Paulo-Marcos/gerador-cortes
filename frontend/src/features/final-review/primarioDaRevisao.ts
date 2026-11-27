import { cortesParaYoutube } from '@/features/projeto-detalhe/listasDePublicacao';
import type { StatusExportCorte } from '@/types/models';
import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import type { ChromeBarra } from '@/upgrade/UpgradeChrome';

/**
 * D-1171 (DIRECAO §5): a primária da Revisão é "Publicar N cortes". N segue a mesma regra
 * de Metadados e de Cortes da live: pronto para publicar e ainda fora do YouTube.
 */
export function primarioDaRevisao(
  cortes: StatusExportCorte[],
  aoPublicar: () => void,
): ChromeBarra['primario'] {
  const total = cortesParaYoutube(cortes).length;
  return {
    texto: `Publicar ${total} ${total === 1 ? 'corte' : 'cortes'}`,
    icone: ICONE_DO_CONCEITO.publicar,
    onClick: aoPublicar,
    desabilitado: total === 0,
    motivo: total === 0 ? 'Nenhum corte pronto que ainda falte no YouTube' : undefined,
  };
}
