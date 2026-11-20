import { useEffect, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ErroDaApi } from '@/shared/api/problem';

// D-1160 · O estado de sincronização do app inteiro, lido do cache de consultas.
//
// "Sincronizado" = nenhuma consulta em voo; "atualizando" = alguma busca em voo;
// "erro" = alguma consulta em uso falhou DE VERDADE (`falhaDeSincronia`). É o que o chip da TopBar dizia
// e que sumiu com ela (D-1137).
export type Sincronia = 'sincronizado' | 'atualizando' | 'erro';

/** Busca que acaba antes disto não vira "atualizando": a live repete as consultas
 *  a cada 3 s, e um aviso que pisca a cada volta é ruído, não informação. */
export const ESPERA_DO_ATUALIZANDO_MS = 600;

/** Falha de sincronização é o backend fora do ar (rede, sem resposta) ou quebrado (5xx).
 *  Um 4xx é o backend respondendo "não tem" (ex.: `useOndaDoBruto`, 404 sem bruto): a tela
 *  trata, e acender o aviso no app inteiro por isso seria alarme falso. */
export function falhaDeSincronia(erro: unknown): boolean {
  return !(erro instanceof ErroDaApi) || erro.status >= 500;
}

export function useSincroniaBruta(): Sincronia {
  const cache = useQueryClient().getQueryCache();
  const ler = (): Sincronia => {
    const consultas = cache.getAll();
    if (consultas.some((q) => q.getObserversCount() > 0 && q.state.status === 'error' && q.state.fetchStatus !== 'fetching' && falhaDeSincronia(q.state.error))) return 'erro';
    return consultas.some((q) => q.state.fetchStatus === 'fetching') ? 'atualizando' : 'sincronizado';
  };
  return useSyncExternalStore((avisar) => cache.subscribe(avisar), ler, ler);
}

/** Decide o que mostrar quando o estado bruto muda: erro e "em dia" valem na hora;
 *  "atualizando" só depois de `esperaMs` ininterruptos (se o bruto mudar antes, o
 *  chamador cancela). Devolve o cancelamento. Fora do hook para testar com timers falsos. */
export function agendarSincronia(bruta: Sincronia, aplicar: (s: Sincronia) => void, esperaMs = ESPERA_DO_ATUALIZANDO_MS): () => void {
  if (bruta !== 'atualizando') {
    aplicar(bruta);
    return () => undefined;
  }
  const t = setTimeout(() => aplicar('atualizando'), esperaMs);
  return () => clearTimeout(t);
}

export function useSincronia(esperaMs = ESPERA_DO_ATUALIZANDO_MS): Sincronia {
  const bruta = useSincroniaBruta();
  const [mostrada, setMostrada] = useState<Sincronia>(bruta === 'atualizando' ? 'sincronizado' : bruta);
  useEffect(() => agendarSincronia(bruta, setMostrada, esperaMs), [bruta, esperaMs]);
  return mostrada;
}
