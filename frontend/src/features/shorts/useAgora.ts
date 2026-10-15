// O relógio do aviso de horário (D-580). Saiu do modal de lote de shorts quando
// os lotes horizontais passaram a usar a mesma seção "Quando" (D-934).
import { useEffect, useState } from 'react';

// De quanto em quanto tempo o aviso do horário reavalia sozinho. Trinta segundos
// bastam: a margem do backend é de cinco minutos, não de segundos.
const RELOGIO_MS = 30_000;

/**
 * O "agora" que o aviso do horário usa, avançando enquanto `ligado`.
 *
 * Sem ele o aviso só mudaria quando o operador mexesse na data — e o problema
 * que ele existe para pegar é justamente o horário que envelhece parado.
 */
export function useAgora(ligado: boolean): [Date, () => void] {
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    if (!ligado) return;
    const id = window.setInterval(() => setAgora(new Date()), RELOGIO_MS);
    return () => window.clearInterval(id);
  }, [ligado]);

  return [agora, () => setAgora(new Date())];
}
