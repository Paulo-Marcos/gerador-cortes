import type { LucideIcon } from 'lucide-react';
import { PROJECT_STATUS_META } from '@/components/ui/status-chip';
import type { StatusProjeto } from '@/types/models';

export interface StatusMeta {
  label: string;
  Icon: LucideIcon;
  chipClass: string;
  animate?: boolean;
}

export const STATUS_META: Record<StatusProjeto, StatusMeta> = Object.fromEntries(
  Object.entries(PROJECT_STATUS_META).map(([status, meta]) => [
    status,
    {
      label: meta.label,
      Icon: meta.Icon,
      chipClass:
        status === 'erro'
          ? 'border-error/30 bg-error/15 text-error'
          : 'border-[var(--wb-border-soft)] bg-[var(--wb-pill-bg)] text-[var(--wb-text-mute)]',
      animate: meta.animate,
    },
  ]),
) as Record<StatusProjeto, StatusMeta>;
