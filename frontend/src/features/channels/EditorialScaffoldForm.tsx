// D-297: formulário "burro" de edição de UM scaffold do canal. Sem I/O: recebe o
// scaffold (valor-do-canal + default) e devolve o texto via `onSave`; o reset é
// delegado via `onReset`. Ressincroniza o estado local quando o scaffold muda.
//
// O guardrail do contrato é VALIDADO no backend (422); aqui a UI só ORIENTA:
// mostra os placeholders obrigatórios e o marcador do contrato de saída, para o
// editor não removê-los sem querer.
import { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { EditorialScaffold } from '@/features/channels/api/scaffolds';

interface Props {
  scaffold: EditorialScaffold;
  pending: boolean;
  onSave: (texto: string) => void;
  onReset: () => void;
  onCancel: () => void;
}

const textareaClasses = cn(
  'flex w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-bg-900 px-3 py-2 text-sm text-text-100 placeholder:text-text-400',
  'transition-colors focus-visible:outline-none focus-visible:border-accent-500 focus-visible:ring-1 focus-visible:ring-accent-500',
);

/** Placeholder está presente no texto atual do editor? (para sinalizar ausência). */
function placeholderPresente(texto: string, nome: string): boolean {
  return texto.includes(`{${nome}}`);
}

export function EditorialScaffoldForm({ scaffold, pending, onSave, onReset, onCancel }: Props) {
  const [texto, setTexto] = useState(scaffold.scaffold);

  // Ressincroniza quando o scaffold muda (troca de item ou reset persistido).
  useEffect(() => {
    setTexto(scaffold.scaffold);
  }, [scaffold]);

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    onSave(texto);
  };

  const faltando = scaffold.placeholders.filter((p) => !placeholderPresente(texto, p));
  const marcadorAusente =
    scaffold.marcador.length > 0 &&
    !texto.toLowerCase().includes(scaffold.marcador.toLowerCase());

  return (
    <form onSubmit={submeter} className="grid gap-5">
      <div className="grid gap-2 rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3">
        <p className="text-xs text-[var(--wb-text-mute)]">
          Este é o invólucro (contrato de saída) desta etapa. Você pode reescrevê-lo, mas{' '}
          <strong className="text-[var(--wb-text)]">mantenha o formato de retorno</strong>: os
          placeholders obrigatórios e o marcador do contrato. Salvar sem eles é bloqueado.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {scaffold.placeholders.map((p) => {
            const ausente = faltando.includes(p);
            return (
              <span
                key={p}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-[11px]',
                  ausente
                    ? 'border-error/40 bg-[color-mix(in_oklch,var(--error)_12%,transparent)] text-error'
                    : 'border-[var(--wb-border-soft)] text-[var(--wb-text-dim)]',
                )}
                title={ausente ? 'Ausente no texto atual' : 'Presente'}
              >
                {`{${p}}`}
              </span>
            );
          })}
          {scaffold.marcador && (
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[11px]',
                marcadorAusente
                  ? 'border-error/40 bg-[color-mix(in_oklch,var(--error)_12%,transparent)] text-error'
                  : 'border-[var(--wb-border-soft)] text-[var(--wb-text-dim)]',
              )}
              title="Marcador do contrato de saída"
            >
              contrato: {scaffold.marcador}
            </span>
          )}
        </div>
        {(faltando.length > 0 || marcadorAusente) && (
          <p className="flex items-center gap-1.5 text-[11px] text-error">
            <AlertTriangle size={12} aria-hidden />
            Faltam itens obrigatórios — o backend vai recusar o salvamento até incluí-los.
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="scaffold-texto">Scaffold (contrato de saída)</Label>
          <button
            type="button"
            onClick={onReset}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs text-[var(--wb-text-mute)] hover:text-[var(--wb-text)] disabled:opacity-40"
          >
            <RotateCcw size={12} aria-hidden />
            Resetar para o padrão
          </button>
        </div>
        <textarea
          id="scaffold-texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={18}
          spellCheck={false}
          className={cn(textareaClasses, 'font-mono text-xs leading-relaxed')}
        />
        <p className="text-xs text-[var(--wb-text-dim)]">
          Os campos entre chaves ({'{...}'}) são preenchidos em tempo de execução — não os
          renomeie nem invente novos.
        </p>
      </div>

      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Salvar scaffold
        </Button>
      </div>
    </form>
  );
}
