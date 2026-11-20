import { useSyncExternalStore } from 'react';
import { useProjeto } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { useMiniaturaDaCapa } from '@/hooks/useMiniaturaDaCapa';
import { useUpgradeTheme } from '@/lib/tema';
import { thumbnailUrl } from '@/lib/utils';
import { luzDaSala, type LuzDaSala } from './luzDaSala';
import { dentroDeUmaLive } from './trilhaDaLive';
import type { TelaId } from './upgradeRoutes';

// D-1137 (E-069 H-13) · A luz da sala com os dados: a capa da live aberta, a
// preferência "Reduzir efeitos" e a transparência reduzida do sistema. A regra é
// pura (`luzDaSala`); aqui só se junta o que ela precisa.

const TRANSPARENCIA_REDUZIDA = '(prefers-reduced-transparency: reduce)';

function assinarTransparencia(avisar: () => void) {
  try {
    const consulta = window.matchMedia(TRANSPARENCIA_REDUZIDA);
    consulta.addEventListener('change', avisar);
    return () => consulta.removeEventListener('change', avisar);
  } catch {
    return () => {};
  }
}

function transparenciaReduzida(): boolean {
  try {
    return window.matchMedia(TRANSPARENCIA_REDUZIDA).matches;
  } catch {
    return false;
  }
}

/** A capa de uma live é a do vídeo no YouTube (a mesma do cartão da Biblioteca). */
export function capaDaLive(projeto: { youtube_url?: string | null } | undefined): string | null {
  return projeto?.youtube_url ? thumbnailUrl(projeto.youtube_url, 'mq') : null;
}

export function useLuzDaSala(tela: TelaId, projetoId: string | null, foco: boolean): LuzDaSala & { src: string | null } {
  const { glass } = useUpgradeTheme();
  const reduzida = useSyncExternalStore(assinarTransparencia, transparenciaReduzida, () => false);
  const projeto = useProjeto(projetoId && dentroDeUmaLive(tela) ? projetoId : undefined).data;
  const capa = capaDaLive(projeto);
  // "Reduzir efeitos" é o vidro desligado: a mesma preferência, gravada em `upgrade-glass`.
  const luz = luzDaSala({ tela, temCapa: Boolean(capa), reduzirEfeitos: !glass, transparenciaReduzida: reduzida, foco });
  const comCapa = luz.aurora === 'capa' && capa !== null;
  // A mesma consulta da miniatura que o resto do app usa (D-1131): uma busca por capa.
  const miniatura = useMiniaturaDaCapa(comCapa ? capa : null);
  return { ...luz, src: miniatura };
}
