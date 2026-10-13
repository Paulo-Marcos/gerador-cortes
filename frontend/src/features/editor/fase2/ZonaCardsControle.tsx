import { ModePicker } from './posicionamentoControls';

/**
 * D-904: Automática ou Manual para a zona dos cards no modal de posicionamento.
 *
 * Em Automática a chave não existe no layout e o card segue a regra de sempre
 * (RN-28); Manual fixa o retângulo onde a regra o colocaria agora, e o
 * operador o arrasta no palco a partir dali.
 */
export function ZonaCardsControle({
  manual,
  onAutomatica,
  onManual,
}: {
  manual: boolean;
  onAutomatica: () => void;
  onManual: () => void;
}) {
  return (
    <section
      data-testid="zona-cards"
      className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2"
    >
      <div className="mb-1.5 font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        Posição dos cards
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <ModePicker active={!manual} label="Automática" onClick={onAutomatica} />
        <ModePicker active={manual} label="Manual" onClick={onManual} />
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-[var(--wb-text-dim)]">
        {manual
          ? 'Arraste o retângulo Cards no palco e ajuste largura e altura aqui. O card encolhe para caber nele.'
          : 'O card fica à esquerda, acima da tela menor, e cresce conforme as telas deixam espaço. Passe para Manual para escolher a coluna.'}
      </p>
    </section>
  );
}
