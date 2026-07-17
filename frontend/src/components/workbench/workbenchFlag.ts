// ─────────────────────────────────────────────────────────────
// Feature flag do shell Workbench (PLANO-DE-ETAPAS, regra 6).
// `VITE_WORKBENCH=1` liga o shell novo; o localStorage
// `workbench-shell` ('1'/'0') sobrescreve o env para permitir
// ligar/desligar sem rebuild. Removida na Etapa 8.
// ─────────────────────────────────────────────────────────────

export const WORKBENCH_FLAG_STORAGE_KEY = 'workbench-shell';

export function isWorkbenchEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(WORKBENCH_FLAG_STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // localStorage indisponível — decide só pelo env
  }
  return import.meta.env.VITE_WORKBENCH === '1';
}

/** Alterna o override local e recarrega (rollback rápido do shell). */
export function toggleWorkbenchShell(): void {
  try {
    window.localStorage.setItem(WORKBENCH_FLAG_STORAGE_KEY, isWorkbenchEnabled() ? '0' : '1');
    window.location.reload();
  } catch {
    // sem localStorage não há override — nada a fazer
  }
}
