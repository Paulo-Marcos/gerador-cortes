import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// OverflowMenu (⋯) — princípio anti-poluição do redesign v3:
// "utilitários raros vão para um ⋯ (overflow) ou um cluster com
// divisória — nunca uma fileira solta de ícones coloridos".
// Usado no ProjetoCard (Biblioteca) e no MetadataCard (header e
// coluna da thumb).
// ─────────────────────────────────────────────────────────────

export interface OverflowMenuItem {
  icon?: LucideIcon;
  label: string;
  kbd?: string;
  /** Explicação no hover — usado quando o item está `disabled` e o motivo importa. */
  title?: string;
  disabled?: boolean;
  /** Ação destrutiva: rótulo em --wb-err. */
  danger?: boolean;
  onClick?: () => void;
  /**
   * Torna o item um seletor de arquivo (ex.: "Subir thumbnail").
   * Quando presente, `onClick` é ignorado e `onFile` recebe o arquivo.
   */
  accept?: string;
  onFile?: (file: File) => void;
}

interface Props {
  items: OverflowMenuItem[];
  /** Rótulo acessível do gatilho. */
  label?: string;
  /** Alinhamento do painel em relação ao gatilho. */
  align?: 'left' | 'right';
  /** Gatilho compacto (26px) para cantos apertados. */
  compact?: boolean;
  className?: string;
}

export function OverflowMenu({
  items,
  label = 'Mais ações',
  align = 'right',
  compact = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass =
    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--wb-bg-inset)] disabled:opacity-50';

  return (
    <div
      ref={wrapRef}
      className={cn('relative', className)}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-[7px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
          compact ? 'h-[26px] w-[26px]' : 'h-7 w-7',
          open
            ? 'bg-[var(--wb-bg-inset)] text-[var(--wb-text)]'
            : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
        )}
      >
        <MoreHorizontal size={compact ? 13 : 14} aria-hidden />
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+4px)] z-40 flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2 shadow-[shadow:var(--wb-shadow)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, idx) => {
            const Icon = item.icon;
            const conteudo = (
              <>
                {Icon && (
                  <Icon
                    size={13}
                    aria-hidden
                    className={item.danger ? 'text-[var(--wb-err)]' : 'text-[var(--wb-text-mute)]'}
                  />
                )}
                <span className="flex-1">{item.label}</span>
                {item.kbd && (
                  <span className="font-code text-[10px] text-[var(--wb-text-dim)]">
                    {item.kbd}
                  </span>
                )}
              </>
            );

            // Item de upload: <label> com input de arquivo escondido.
            if (item.accept && item.onFile) {
              return (
                <label
                  key={`${item.label}-${idx}`}
                  role="menuitem"
                  className={cn(itemClass, 'cursor-pointer text-[var(--wb-text)]')}
                >
                  {conteudo}
                  <input
                    type="file"
                    accept={item.accept}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.currentTarget.value = '';
                      setOpen(false);
                      if (file) item.onFile?.(file);
                    }}
                  />
                </label>
              );
            }

            return (
              <button
                key={`${item.label}-${idx}`}
                type="button"
                role="menuitem"
                title={item.title}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false);
                  item.onClick?.();
                }}
                className={cn(
                  itemClass,
                  item.danger ? 'text-[var(--wb-err)]' : 'text-[var(--wb-text)]',
                )}
              >
                {conteudo}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
