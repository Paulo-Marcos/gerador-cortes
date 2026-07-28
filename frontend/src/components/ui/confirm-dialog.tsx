import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

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
}

export function ConfirmDialog({
  pedido,
  onCancel,
  onConfirm,
}: {
  pedido: PedidoConfirmacao | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const perigoso = pedido?.tone === 'danger';
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
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[var(--wb-warn)]" aria-hidden />
        )}
        <p className="text-[13px] leading-relaxed text-[var(--wb-text)]">{pedido?.descricao}</p>
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={onConfirm}
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
    acao: () => void;
  } | null>(null);

  const cancelar = useCallback(() => setPendente(null), []);

  // A acao roda FORA do updater: em StrictMode o updater e' invocado duas
  // vezes, o que dispararia a regeracao em dobro.
  const confirmar = useCallback(() => {
    if (!pendente) return;
    const { acao } = pendente;
    setPendente(null);
    acao();
  }, [pendente]);

  /** `pedido` null (primeira execucao) dispara direto; senao abre o dialogo. */
  const executarOuPedir = useCallback((pedido: PedidoConfirmacao | null, acao: () => void) => {
    if (pedido === null) acao();
    else setPendente({ pedido, acao });
  }, []);

  return { pedido: pendente?.pedido ?? null, cancelar, confirmar, executarOuPedir };
}
