import { ChevronDown, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// As peças visuais do corpo do modal de metadados (AUDITORIA-v3 §6). Saíram do
// MetadataCard na D-821, quando o modal foi reorganizado em textos × capas e a
// coluna das capas virou componente próprio: as duas metades usam as mesmas.

// D-413: os botões da coluna da capa herdavam o `size=default` do primitivo —
// 11,5px, ilegível ao lado do corpo ampliado. Sobrescrito só aqui: o `Button`
// é compartilhado com o app inteiro.
export const MODAL_ASIDE_BUTTON = 'h-10 px-3.5 text-[13px]';

// Label de campo: mono uppercase à esquerda, contador à direita, na mesma linha.
export function ModalFieldLabel({
  label,
  counter,
  over,
}: {
  label: string;
  counter?: string;
  over?: boolean;
}) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <span className="font-code text-[12px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
        {label}
      </span>
      {counter && (
        <span
          className={cn(
            'ml-auto font-code text-[11.5px] font-semibold text-[var(--wb-text-dim)]',
            over && 'text-[var(--wb-err)]',
          )}
        >
          {counter}
        </span>
      )}
    </div>
  );
}

/**
 * As sugestões da IA, recolhidas até o operador pedir (D-821).
 *
 * Servem para quando o título ou o texto da capa ficou ruim — não para toda
 * vez. Abertas por padrão, empurravam o resto do modal para baixo em todo
 * corte. Fechadas, dizem quantas há, e abrir custa um clique.
 *
 * D-413 continua valendo: a sugestão é pill (escolha) e a ação de geração é
 * retângulo numa barra própria — as duas nunca dividem a mesma fileira.
 */
export function SugestoesRecolhidas({
  quantidade,
  aberto,
  onAlternar,
  children,
}: {
  quantidade: number;
  aberto: boolean;
  onAlternar: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-2 grid gap-1.5">
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={aberto}
        className="inline-flex w-fit items-center gap-1 font-code text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
      >
        <ChevronDown size={12} className={aberto ? 'rotate-180' : ''} aria-hidden />
        sugestões ({quantidade})
      </button>
      {aberto && (
        <div className="flex flex-wrap items-center gap-1.5">
          {quantidade === 0 ? <SemSugestoes /> : children}
        </div>
      )}
    </div>
  );
}

export function ModalActionRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed border-[var(--wb-border-soft)] pt-2.5">
      {children}
    </div>
  );
}

// Ação secundária da linha (o "Manual"). A geração por IA mora no AcaoDeIa.
export function ModalActionButton({
  icon: Icon,
  onClick,
  children,
}: {
  icon: LucideIcon;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-[12.5px] font-semibold text-[var(--wb-text-mute)] transition-colors hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
    >
      <Icon size={14} aria-hidden />
      {children}
    </button>
  );
}

/**
 * Pill de SUGESTÃO (rounded-full, inset).
 *
 * D-821: a escolhida usa o par que o TEMA define para o acento
 * (`--wb-accent-fg`), e não branco fixo — num tema de acento escuro com texto
 * herdado escuro, a opção escolhida ficava ilegível.
 */
export function ModalChip({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-full px-3 py-1.5 text-left text-[12px] font-semibold transition-colors',
        active
          ? 'bg-[var(--wb-accent)] text-[var(--wb-accent-fg)]'
          : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      )}
    >
      {children}
    </button>
  );
}

export function SemSugestoes() {
  return (
    <span className="text-[11.5px] text-[var(--wb-text-mute)]">
      A IA ainda não sugeriu — gere os metadados para ver opções.
    </span>
  );
}
