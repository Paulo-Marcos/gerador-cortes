import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/upgrade/Icon';

// ─────────────────────────────────────────────────────────────
// OverflowMenu (⋯) — princípio anti-poluição do redesign v3:
// "utilitários raros vão para um ⋯ (overflow) ou um cluster com
// divisória — nunca uma fileira solta de ícones coloridos".
// Usado no ProjetoCard (Biblioteca) e no MetadataCard (header e
// coluna da thumb).
// ─────────────────────────────────────────────────────────────

export interface OverflowMenuItem {
  icon?: IconName;
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
  /** D-868: gatilho de 32 px, o alvo das ações da linha do corte. */
  grande?: boolean;
  /** D-867: gatilho com rótulo ("⋯ Mais"), da família dos botões do
   *  cabeçalho. Sem isto, o gatilho é só o ícone. */
  texto?: string;
  className?: string;
}

/** O botão que abre o menu: só o ⋯, ou "⋯ Mais" com rótulo (D-867), da
 *  família dos botões do cabeçalho — aí o texto visível é o nome dele. */
export function GatilhoDoMenu({
  texto,
  label,
  compact,
  grande = false,
  open,
  onAlternar,
}: {
  texto?: string;
  label: string;
  compact: boolean;
  grande?: boolean;
  open: boolean;
  onAlternar: () => void;
}) {
  if (texto) {
    return (
      <button
        type="button"
        className="btn"
        onClick={onAlternar}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="more-horizontal" />
        {texto}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onAlternar}
      aria-label={label}
      title={label}
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[7px] font-extrabold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        compact ? 'h-[26px] w-[26px]' : grande ? 'h-8 w-8' : 'h-7 w-7',
        open
          ? 'bg-[var(--wb-bg-inset)] text-[var(--wb-text)]'
          : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      )}
    >
      <Icon name="more-horizontal" />
    </button>
  );
}

const itemClass =
  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-[var(--wb-bg-inset)]';

/**
 * Um item do painel. D-867: item desligado é `aria-disabled`, não `disabled`
 * — botão desabilitado não recebe eventos nem foco, e o `title` que explica
 * o motivo nunca aparecia (o mesmo achado da D-439). Ele segue alcançável,
 * mostra o porquê e o clique não faz nada.
 */
export function ItemDoMenu({ item, onFechar }: { item: OverflowMenuItem; onFechar: () => void }) {
  const conteudo = (
    <>
      {item.icon && (
        <Icon
          name={item.icon}
          className={item.danger ? 'text-[var(--wb-err)]' : 'text-[var(--wb-text-mute)]'}
        />
      )}
      <span className="flex-1">{item.label}</span>
      {item.kbd && (
        <span className="font-code text-[10px] text-[var(--wb-text-dim)]">{item.kbd}</span>
      )}
    </>
  );

  // Item de upload: <label> com input de arquivo escondido.
  if (item.accept && item.onFile) {
    return (
      <label role="menuitem" className={cn(itemClass, 'cursor-pointer text-[var(--wb-text)]')}>
        {conteudo}
        <input
          type="file"
          accept={item.accept}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.currentTarget.value = '';
            onFechar();
            if (file) item.onFile?.(file);
          }}
        />
      </label>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      title={item.title}
      aria-disabled={item.disabled || undefined}
      onClick={() => {
        if (item.disabled) return;
        onFechar();
        item.onClick?.();
      }}
      className={cn(
        itemClass,
        item.disabled && 'cursor-not-allowed opacity-50',
        item.danger ? 'text-[var(--wb-err)]' : 'text-[var(--wb-text)]',
      )}
    >
      {conteudo}
    </button>
  );
}

export function OverflowMenu({
  items,
  label = 'Mais ações',
  align = 'right',
  compact = false,
  grande,
  texto,
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

  return (
    <div
      ref={wrapRef}
      className={cn('relative', className)}
      onClick={(event) => event.stopPropagation()}
    >
      <GatilhoDoMenu
        texto={texto}
        label={label}
        compact={compact}
        grande={grande}
        open={open}
        onAlternar={() => setOpen((current) => !current)}
      />

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute top-[calc(100%+4px)] z-40 flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2 shadow-[shadow:var(--wb-shadow)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, idx) => (
            <ItemDoMenu key={`${item.label}-${idx}`} item={item} onFechar={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}
