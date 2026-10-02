import { Modal } from '@/components/ui/modal';
import { formatShortcut, type ShortcutBinding } from '@/shared/atalhos/shortcuts';
import { Icon, type IconName } from '@/upgrade/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  bindings: ShortcutBinding[];
}

const GROUP_LABELS: Record<ShortcutBinding['group'], { rotulo: string; icone: IconName }> = {
  player: { rotulo: 'Player', icone: 'play' },
  navegacao: { rotulo: 'Navegação', icone: 'compass' },
  edicao: { rotulo: 'Edição', icone: 'scissors' },
  global: { rotulo: 'Global', icone: 'globe' },
};

export function ShortcutsHelpModal({ open, onClose, bindings }: Props) {
  const grupos = (Object.keys(GROUP_LABELS) as ShortcutBinding['group'][]).map((g) => ({
    grupo: g,
    label: GROUP_LABELS[g].rotulo,
    icone: GROUP_LABELS[g].icone,
    items: bindings.filter((b) => b.group === g),
  }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Atalhos de teclado"
      description="Pressione ? a qualquer momento para abrir esse painel."
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {grupos.map(
          (g) =>
            g.items.length > 0 && (
              <div key={g.grupo} className="flex flex-col gap-1">
                <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-text-400">
                  <Icon name={g.icone} />
                  {g.label}
                </h3>
                <ul className="flex flex-col divide-y divide-[var(--border)] rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900/40">
                  {g.items.map((b) => (
                    <li
                      key={b.key + (b.mod ?? '')}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 text-[12px]"
                    >
                      <span className="text-text-200">{b.description}</span>
                      <kbd className="rounded border border-[var(--border)] bg-bg-800 px-1.5 py-0.5 font-mono text-[10px] text-text-100">
                        {formatShortcut(b)}
                      </kbd>
                    </li>
                  ))}
                </ul>
              </div>
            ),
        )}
      </div>
    </Modal>
  );
}
