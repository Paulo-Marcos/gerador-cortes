import { UpgradeShell } from '@/upgrade/UpgradeShell';

// ADR-0017: uma casca só. O legado e o Workbench, que conviviam atrás de flags
// como rollback, saíram na v0.4 (D-728).
export function AppShell() {
  return <UpgradeShell />;
}
