// Endereço único da API do backend (D-623).
//
// Antes, 17 módulos repetiam `VITE_API_URL ?? 'http://localhost:8000/api'`. A
// porta 8000 é a da produção: um checkout sem `.env` (worktree, clone novo)
// gravava na produção sem aviso. Sem a variável, a base agora é RELATIVA à
// origem do frontend — as chamadas falham à vista em vez de mudar de ambiente,
// e o app segue funcionando atrás de um proxy na mesma origem.

export const API_BASE: string = import.meta.env.VITE_API_URL || '/api';

/** Raiz do backend (sem `/api`) — `''` quando a base é relativa. */
export const ORIGEM_API: string = API_BASE.replace(/\/api$/, '');

/** Arquivos estáticos servidos pelo backend em `/videos`. */
export const VIDEOS_BASE: string = API_BASE.replace(/\/api$/, '/videos');

const BASE_ABSOLUTA_RE = /^https?:/;

/** URL de WebSocket para `caminho` (relativo à base da API). */
export function wsUrl(caminho: string, base: string = API_BASE): string {
  if (BASE_ABSOLUTA_RE.test(base)) {
    return `${base.replace(/^http(s?):/, 'ws$1:')}${caminho}`;
  }
  const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocolo}//${window.location.host}${base}${caminho}`;
}
