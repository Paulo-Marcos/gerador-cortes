// ─────────────────────────────────────────────────────────────────
// D-599 · Os limiares de largura da casca, num lugar só.
//
// RODADA 2 · antes havia dois números para a mesma decisão: a casca
// media `min-width: 1241px` em JS e o CSS escondia `.ctx` em
// `max-width: 1240px`. Dois lugares, um dia discordariam — e o sintoma
// seria a lista de cortes sumindo dos dois lugares ao mesmo tempo.
//
// Agora o JS manda. O `upgrade.css` só guarda o limiar para o que é
// puramente visual (`.two` / `.two-b`), com um comentário apontando
// para cá.
// ─────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

/** A partir daqui cabem trilho + coluna de contexto + miolo. */
export const CONTEXTO_MIN_PX = 1241;

/** Abaixo daqui a busca da barra superior vira só o ícone: a trilha e o
 *  seletor valem mais que o rótulo "Buscar live, tela ou ação…". */
export const BUSCA_LARGA_MIN_PX = 1200;

/**
 * `true` enquanto a janela tiver ao menos `px` de largura.
 *
 * Relê a consulta em vez de confiar no valor do evento: o `change` do
 * matchMedia é o caminho normal e o `resize` é o reforço — medido em
 * 16/09/2026, redimensionar por emulação de viewport não disparava o
 * `change`, e a casca ficava decidindo pela largura errada.
 */
export function useJanelaMin(px: number): boolean {
  const consulta = `(min-width: ${px}px)`;
  const [cabe, setCabe] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia(consulta).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(consulta);
    const reler = () => setCabe(mq.matches);
    mq.addEventListener('change', reler);
    window.addEventListener('resize', reler);
    reler();
    return () => {
      mq.removeEventListener('change', reler);
      window.removeEventListener('resize', reler);
    };
  }, [consulta]);

  return cabe;
}
