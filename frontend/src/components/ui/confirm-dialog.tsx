import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Icon } from '@/upgrade/Icon';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// ConfirmDialog (D-428) — confirmacao explicita para acoes que refazem
// trabalho ja existente. Nasceu porque regerar trechos/cenas/bruto era um
// clique unico: sobrescrevia resultado ja revisado e queimava Claude sem
// intencao. A primeira execucao segue sem dialogo — o gate e' so' para a
// RE-execucao.
// ─────────────────────────────────────────────────────────────

/** Descricao do que sera' confirmado. A acao fica com o hook, nao aqui. */
export interface PedidoConfirmacao {
  titulo: string;
  /** O que exatamente acontece ao confirmar (sobrescreve? acrescenta?). */
  descricao: string;
  /** Detalhe do estado atual que sera' afetado (ex.: "12 cenas"). */
  detalhe?: string;
  confirmLabel: string;
  /** `danger` quando a acao descarta trabalho ja feito. */
  tone?: 'danger' | 'default';
  /**
   * D-993: escolha OPCIONAL que segue com a confirmacao (ex.: o motivo de
   * apagar). Confirmar sem escolher continua valendo: o gesto segue rapido.
   */
  escolha?: { pergunta: string; opcoes: readonly OpcaoConfirmacao[] };
}

export interface OpcaoConfirmacao {
  slug: string;
  rotulo: string;
}

/** Chips de uma escolha so': clicar de novo na marcada desmarca. */
function EscolhaOpcional({
  pergunta,
  opcoes,
  escolhida,
  onEscolher,
}: {
  pergunta: string;
  opcoes: readonly OpcaoConfirmacao[];
  escolhida: string | undefined;
  onEscolher: (slug: string | undefined) => void;
}) {
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      <span className="font-code text-[11px] uppercase tracking-wide text-[var(--wb-text-mute)]">
        {pergunta}
      </span>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={pergunta}>
        {opcoes.map((opcao) => {
          const ativa = opcao.slug === escolhida;
          return (
            <button
              key={opcao.slug}
              type="button"
              aria-pressed={ativa}
              onClick={() => onEscolher(ativa ? undefined : opcao.slug)}
              className={cn(
                'rounded-[7px] border px-2 py-[3px] text-[11px] font-bold transition-colors',
                ativa
                  ? 'border-[var(--sel-line)] bg-[var(--sel-bg)] text-[var(--sel-ink)]'
                  : 'border-[var(--wb-border)] bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              {opcao.rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  pedido,
  onCancel,
  onConfirm,
}: {
  pedido: PedidoConfirmacao | null;
  onCancel: () => void;
  onConfirm: (escolha?: string) => void;
}) {
  const perigoso = pedido?.tone === 'danger';
  // A escolha e' de UM pedido: outro pedido (ou o mesmo reaberto) comeca vazio.
  const [escolha, setEscolha] = useState<{ de: PedidoConfirmacao; slug?: string } | null>(null);
  const escolhida = escolha?.de === pedido ? escolha?.slug : undefined;
  return (
    <Modal
      open={pedido !== null}
      onClose={onCancel}
      size="sm"
      title={pedido?.titulo ?? ''}
      description={pedido?.detalhe}
    >
      <div className="flex items-start gap-2.5">
        {perigoso && (
          <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0 text-[var(--wb-warn)]" />
        )}
        <p className="text-[13px] leading-relaxed text-[var(--wb-text)]">{pedido?.descricao}</p>
      </div>
      {pedido?.escolha && (
        <EscolhaOpcional
          pergunta={pedido.escolha.pergunta}
          opcoes={pedido.escolha.opcoes}
          escolhida={escolhida}
          onEscolher={(slug) => setEscolha({ de: pedido, slug })}
        />
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => (escolhida === undefined ? onConfirm() : onConfirm(escolhida))}
          className={perigoso ? 'bg-[var(--wb-warn)] hover:opacity-90' : ''}
        >
          {pedido?.confirmLabel ?? 'Confirmar'}
        </Button>
      </div>
    </Modal>
  );
}

/**
 * Estado de UMA confirmacao pendente. `executarOuPedir` e' o ponto de uso:
 * sem pedido (primeira execucao) dispara direto; com pedido, abre o dialogo.
 */
export function useConfirmacao() {
  const [pendente, setPendente] = useState<{
    pedido: PedidoConfirmacao;
    acao: (escolha?: string) => void;
  } | null>(null);

  const cancelar = useCallback(() => setPendente(null), []);

  // A acao roda FORA do updater: em StrictMode o updater e' invocado duas
  // vezes, o que dispararia a regeracao em dobro.
  const confirmar = useCallback(
    (escolha?: string) => {
      if (!pendente) return;
      const { acao } = pendente;
      setPendente(null);
      acao(escolha);
    },
    [pendente],
  );

  /** `pedido` null (primeira execucao) dispara direto; senao abre o dialogo. */
  const executarOuPedir = useCallback(
    (pedido: PedidoConfirmacao | null, acao: (escolha?: string) => void) => {
      if (pedido === null) acao();
      else setPendente({ pedido, acao });
    },
    [],
  );

  return { pedido: pendente?.pedido ?? null, cancelar, confirmar, executarOuPedir };
}
