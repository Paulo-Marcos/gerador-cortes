// D-1131 (E-069 H-11c) · A luz do canal para o anel do avatar: paleta cadastrada, depois o `luz`
// que o backend amostra das capas (D-1130), depois nada (anel neutro). Lê a MESMA consulta de
// canais que o resto do app (`useCanais`): não abre requisição própria.
import { useMemo } from 'react';
import { luzDoCanalDe, type LuzDoCanal, type TemaDaLuz } from '@/lib/luzDoCanal';
import { useCanais } from './useChannels';

/** `canalId` ausente = o canal ativo. */
export function useLuzDoCanal(tema: TemaDaLuz, canalId?: string): LuzDoCanal | null {
  const { data } = useCanais();
  const id = canalId ?? data?.ativo ?? null;
  const canal = data?.canais.find((c) => c.id === id);
  return useMemo(() => luzDoCanalDe(canal, tema), [canal, tema]);
}
