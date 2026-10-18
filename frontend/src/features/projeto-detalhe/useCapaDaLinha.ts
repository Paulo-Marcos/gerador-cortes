import { useQuery } from '@tanstack/react-query';
import { comVersao, resolveThumbUrl } from '@/lib/api';
import { exportStatusKey } from '@/shared/chavesDeCache';

/** D-969: a capa é regravada no mesmo arquivo e o navegador guarda a imagem pela
 *  URL. A hora da leitura do status de export (só assina a query da tela, sem
 *  buscar) é a versão que fura esse cache. */
export function useCapaDaLinha(projetoId: string, thumbnailPath?: string | null): string | null {
  const lidoEm = useQuery({ queryKey: exportStatusKey(projetoId), enabled: false }).dataUpdatedAt;
  return comVersao(resolveThumbUrl(projetoId, thumbnailPath), lidoEm);
}
