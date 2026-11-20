import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { idDaLinha } from './leituraDoMapa';

/**
 * D-1149 (§7.2) · O corte aberto, que o mapa e a lista mostram juntos (`aria-current` nos
 * dois). Começa no `?corte=` da chegada (quem volta do editor ou do Fire). Clicar no mapa
 * abre o corte e leva o foco à linha dele, que vem à vista; a linha que recebe o foco abre
 * o seu corte no mapa. Não grava na URL: o `?corte=` é a chegada, e reescrevê-lo a cada
 * foco faria a linha pular para o centro (ver `useFocoDaLinhaNaUrl`).
 */
export function useCorteAberto() {
  const [parametros] = useSearchParams();
  const [abertoId, setAbertoId] = useState<string | null>(() => parametros.get('corte'));

  const abrirPeloMapa = useCallback((corteId: string) => {
    setAbertoId(corteId);
    const linha = document.getElementById(idDaLinha(corteId));
    linha?.scrollIntoView({ block: 'nearest' });
    linha?.focus({ preventScroll: true });
  }, []);

  const abrirPelaLinha = useCallback((corteId: string) => setAbertoId(corteId), []);

  return { abertoId, abrirPeloMapa, abrirPelaLinha };
}
