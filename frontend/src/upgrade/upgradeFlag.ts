// ─────────────────────────────────────────────────────────────────
// D-599 · Flag da casca nova.
//
// Mesma mecânica do `workbenchFlag` (env liga, localStorage
// sobrescreve sem rebuild) porque o rollback precisa ser uma tecla,
// não um deploy: enquanto as telas migram, a casca velha tem de
// continuar a um toque de distância.
// ─────────────────────────────────────────────────────────────────

export const UPGRADE_FLAG_STORAGE_KEY = 'upgrade-shell';

export function isUpgradeShellEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(UPGRADE_FLAG_STORAGE_KEY);
    if (stored === '1') return true;
    if (stored === '0') return false;
  } catch {
    // localStorage indisponível — decide só pelo env
  }
  return import.meta.env.VITE_UPGRADE_SHELL === '1';
}

/** Alterna o override local e recarrega (rollback rápido da casca). */
export function toggleUpgradeShell(): void {
  try {
    window.localStorage.setItem(UPGRADE_FLAG_STORAGE_KEY, isUpgradeShellEnabled() ? '0' : '1');
    window.location.reload();
  } catch {
    // sem localStorage não há override — nada a fazer
  }
}
