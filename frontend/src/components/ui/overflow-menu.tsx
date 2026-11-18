import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Icon, type IconName } from '@/upgrade/Icon';
import { ITEM_DO_MENU, ITEM_DO_MENU_PERIGOSO, PAINEL_DO_MENU } from '@/components/ui/menu';

// ─────────────────────────────────────────────────────────────
// OverflowMenu (⋯) — princípio anti-poluição do redesign v3:
// "utilitários raros vão para um ⋯ (overflow) ou um cluster com
// divisória — nunca uma fileira solta de ícones coloridos".
// Usado no ProjetoCard (Biblioteca) e no MetadataCard (header e
// coluna da thumb).
//
// D-1122 (E-069 H-11b): a pele do painel e dos itens vem do `menu.tsx` (a mesma do
// menu da Sala escura). O MOTOR continua aqui: o teste travado deste menu (D-867/
// D-868) prende a forma do componente — `GatilhoDoMenu`, `ItemDoMenu`,
// `ouvirFechamento`, o `useEffectEvent` — e ler o código-fonte; por isso ele não pôde
// virar um `DropdownMenu` do Radix sem reescrever o contrato. A API é a mesma.
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
  /** D-868: avisa quando o menu abre e fecha — a linha do corte sobe de
   *  camada enquanto o seu ⋯ está aberto. */
  onAbertoMudou?: (aberto: boolean) => void;
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
      data-sala=""
      title={label}
      aria-haspopup="menu"
      aria-expanded={open}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-pilula transition-colors duration-150 motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco',
        compact ? 'h-[26px] w-[26px]' : grande ? 'h-8 w-8' : 'h-7 w-7',
        open ? 'bg-vidro-3 text-fg' : 'bg-vidro-2 text-fg-2 hover:bg-vidro-3 hover:text-fg',
      )}
    >
      <Icon name="more-horizontal" />
    </button>
  );
}

// O ícone leva a classe do tema antigo (o teste do menu a confere) e a pele nova
// a repinta por cima: `[&_svg]` vence a classe do próprio <svg>.
const itemClass = ITEM_DO_MENU + ' [&_svg]:text-fg-3';
const itemPerigosoClass = ITEM_DO_MENU_PERIGOSO + ' [&_svg]:text-erro';

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
        <span className="font-mono text-micro text-fg-3">{item.kbd}</span>
      )}
    </>
  );

  // Item de upload: <label> com input de arquivo escondido.
  if (item.accept && item.onFile) {
    return (
      <label role="menuitem" className={cn(itemClass, 'cursor-pointer')}>
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
      data-sala=""
      title={item.title}
      aria-disabled={item.disabled || undefined}
      onClick={() => {
        if (item.disabled) return;
        onFechar();
        item.onClick?.();
      }}
      className={cn(
        itemClass,
        item.danger && itemPerigosoClass,
      )}
    >
      {conteudo}
    </button>
  );
}

/**
 * Menu aberto fecha com Esc e com clique fora dele. Fora do componente para
 * ter teste: fechar por aqui também avisa quem pediu (`onAbertoMudou`) — sem
 * isso a linha do corte ficava com as teclas mudas até reabrir o ⋯ (D-868).
 */
export function ouvirFechamento(
  doc: Pick<Document, 'addEventListener' | 'removeEventListener'>,
  menu: () => HTMLElement | null,
  fechar: () => void,
): () => void {
  const onPointerDown = (event: MouseEvent) => {
    if (!menu()?.contains(event.target as Node)) fechar();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') fechar();
  };
  doc.addEventListener('mousedown', onPointerDown);
  doc.addEventListener('keydown', onKey);
  return () => {
    doc.removeEventListener('mousedown', onPointerDown);
    doc.removeEventListener('keydown', onKey);
  };
}

export function OverflowMenu({
  items,
  label = 'Mais ações',
  align = 'right',
  compact = false,
  grande,
  texto,
  className,
  onAbertoMudou,
}: Props) {
  const [open, setOpen] = useState(false);
  const mudar = (aberto: boolean) => {
    setOpen(aberto);
    onAbertoMudou?.(aberto);
  };
  const fechar = useEffectEvent(() => mudar(false));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    return ouvirFechamento(document, () => wrapRef.current, fechar);
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
        onAlternar={() => mudar(!open)}
      />

      {open && (
        <div
          role="menu"
          className={cn(
            PAINEL_DO_MENU,
            'absolute top-[calc(100%+4px)] z-40 w-[220px]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, idx) => (
            <ItemDoMenu key={`${item.label}-${idx}`} item={item} onFechar={() => mudar(false)} />
          ))}
        </div>
      )}
    </div>
  );
}
