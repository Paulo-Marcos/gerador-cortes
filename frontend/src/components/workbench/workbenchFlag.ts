// ─────────────────────────────────────────────────────────────
// Feature flag do shell Workbench (PLANO-DE-ETAPAS, regra 6).
// `VITE_WORKBENCH=1` liga o shell novo; o localStorage
// `workbench-shell` ('1'/'0') sobrescreve o env para permitir
// ligar/desligar sem rebuild. Removida na Etapa 8.
// ─────────────────────────────────────────────────────────────

import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

export const WORKBENCH_FLAG_STORAGE_KEY = 'workbench-shell';

export function isWorkbenchEnabled(): boolean {
  // D-599: a casca nova SUBSTITUI o shell Workbench (o AppShell já escolhe
  // ela primeiro). Com as duas flags ligadas, as telas pegavam o layout
  // Workbench — que depende do WorkbenchPanelsProvider montado só pelo
  // WorkbenchShell — e o editor quebrava ao abrir um corte.
  if (isUpgradeShellEnabled()) return false;
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
