import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon, type IconName } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

// As peças visuais do corpo de metadados (AUDITORIA-v3 §6, D-821), na escala e nos
// tokens da Sala escura (D-1167, DIRECAO §7.5): rótulo no `pequeno`, contador em mono,
// sugestões como Chip. Servem à tela de Metadados e ao modal do editor.

// Os botões da coluna das capas e do rodapé: 38 px, o degrau do botão (§4.4).
export const MODAL_ASIDE_BUTTON = 'min-w-0';

/**
 * A linha do rótulo de um campo: o nome à esquerda, o contador em mono e, se houver, a
 * ação do campo ("Gerar de novo") à direita. Liga o rótulo ao controle pelo `htmlFor`.
 */
export function ModalFieldLabel({
  label,
  counter,
  over,
  htmlFor,
  acao,
}: {
  label: string;
  counter?: string;
  over?: boolean;
  htmlFor?: string;
  acao?: React.ReactNode;
}) {
  return (
    <div className="mb-1.5 flex min-h-[30px] items-center gap-2">
      <label htmlFor={htmlFor} className="text-pequeno text-fg-2">
        {label}
      </label>
      {counter && (
        <span className={cn('num ml-auto', over ? 'text-erro' : 'text-fg-3')} aria-live="polite">
          {counter}
        </span>
      )}
      {acao && <span className={cn('flex items-center gap-1.5', !counter && 'ml-auto')}>{acao}</span>}
    </div>
  );
}

/**
 * As sugestões da IA, recolhidas até o operador pedir (D-821).
 *
 * Servem para quando o título ou o texto da capa ficou ruim — não para toda vez.
 * Abertas por padrão, empurravam o resto da tela para baixo em todo corte. Fechadas,
 * dizem quantas há, e abrir custa um clique.
 *
 * D-413 continua valendo: a sugestão é chip (escolha) e a ação de geração é botão
 * numa barra própria — as duas nunca dividem a mesma fileira.
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
        data-sala=""
        className="inline-flex w-fit items-center gap-1 rounded-etiqueta text-pequeno text-fg-3 transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco motion-reduce:transition-none"
      >
        <Icon name="chevron-down" className={aberto ? 'rotate-180' : ''} />
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
    <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-dashed border-fio pt-2.5">
      {children}
    </div>
  );
}

// Ação secundária da linha (o "Manual"). A geração por IA mora no AcaoDeIa.
export function ModalActionButton({
  icon,
  onClick,
  children,
}: {
  icon: IconName;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button type="button" variant="secundario" size="pq" onClick={onClick}>
      <Icon name={icon} />
      {children}
    </Button>
  );
}

/**
 * Chip de SUGESTÃO: o escolhido fica ligado (`aria-pressed`, fundo e fio de íris, visto).
 * O Chip da Sala escura tem a cor do par que o tema define; não há branco fixo.
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
    <Chip pressionado={Boolean(active)} onClick={onClick} className="h-auto min-h-[30px] whitespace-normal py-1 text-left">
      {children}
    </Chip>
  );
}

export function SemSugestoes() {
  return (
    <span className="text-pequeno text-fg-3">
      A IA ainda não sugeriu — gere os metadados para ver opções.
    </span>
  );
}
