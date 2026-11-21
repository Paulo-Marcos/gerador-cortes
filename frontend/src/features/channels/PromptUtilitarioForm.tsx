// D-348: formulário "burro" de edição de UM prompt utilitário do canal. Sem I/O:
// recebe o prompt (valor-do-canal + default) e devolve o texto via `onSave`; o
// reset é delegado via `onReset`. Ressincroniza o estado local quando o prompt muda.
//
// O guardrail do contrato é VALIDADO no backend (422); aqui a UI só ORIENTA:
// mostra os placeholders obrigatórios e o marcador do contrato de saída, para o
// editor não removê-los sem querer.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { PromptUtilitario } from '@/features/channels/api/promptsUtilitarios';
import { Icon } from '@/upgrade/Icon';

interface Props {
  prompt: PromptUtilitario;
  pending: boolean;
  onSave: (texto: string) => void;
  onReset: () => void;
  onCancel: () => void;
}

const textareaClasses = cn(
  'flex w-full rounded-campo border border-campo bg-painel-solido px-3 py-2 text-sm text-fg placeholder:text-fg-3',
  'transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foco',
);

/** Placeholder está presente no texto atual do editor? (para sinalizar ausência). */
function placeholderPresente(texto: string, nome: string): boolean {
  return texto.includes(`{${nome}}`);
}

export function PromptUtilitarioForm({ prompt, pending, onSave, onReset, onCancel }: Props) {
  const [texto, setTexto] = useState(prompt.prompt);

  // Ressincroniza quando o prompt muda (troca de item ou reset persistido).
  useEffect(() => {
    setTexto(prompt.prompt);
  }, [prompt]);

  const submeter = (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    onSave(texto);
  };

  const faltando = prompt.placeholders.filter((p) => !placeholderPresente(texto, p));
  const marcadorAusente =
    prompt.marcador.length > 0 && !texto.toLowerCase().includes(prompt.marcador.toLowerCase());

  return (
    <form onSubmit={submeter} className="grid gap-5">
      <div className="grid gap-2 rounded-campo border border-fio bg-app p-3">
        <p className="text-xs text-fg-2">
          Este é o prompt da etapa. Você pode reescrevê-lo, mas{' '}
          <strong className="text-fg">mantenha o formato de retorno</strong>: os
          placeholders obrigatórios e o marcador do contrato. Salvar sem eles é bloqueado.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {prompt.placeholders.map((p) => {
            const ausente = faltando.includes(p);
            return (
              <span
                key={p}
                className={cn(
                  'rounded border px-1.5 py-0.5 font-mono text-micro',
                  ausente
                    ? 'border-erro/40 bg-[color-mix(in_oklab,var(--cc-erro)_12%,transparent)] text-erro'
                    : 'border-fio text-fg-3',
                )}
                title={ausente ? 'Ausente no texto atual' : 'Presente'}
              >
                {`{${p}}`}
              </span>
            );
          })}
          {prompt.marcador && (
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-micro',
                marcadorAusente
                  ? 'border-erro/40 bg-[color-mix(in_oklab,var(--cc-erro)_12%,transparent)] text-erro'
                  : 'border-fio text-fg-3',
              )}
              title="Marcador do contrato de saída"
            >
              contrato: {prompt.marcador}
            </span>
          )}
        </div>
        {(faltando.length > 0 || marcadorAusente) && (
          <p className="flex items-center gap-1.5 text-micro text-erro">
            <Icon name="triangle-alert" />
            Faltam itens obrigatórios — o backend vai recusar o salvamento até incluí-los.
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="prompt-utilitario-texto">Prompt</Label>
          <button
            type="button"
            onClick={onReset}
            disabled={pending}
            className="inline-flex items-center gap-1 text-xs text-fg-2 hover:text-fg disabled:opacity-40"
          >
            <Icon name="rotate-ccw" />
            Resetar para o padrão
          </button>
        </div>
        <textarea
          id="prompt-utilitario-texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={18}
          spellCheck={false}
          className={cn(textareaClasses, 'font-mono text-xs leading-relaxed')}
        />
        <p className="text-xs text-fg-3">
          Os campos entre chaves ({'{...}'}) são preenchidos em tempo de execução — não os
          renomeie nem invente novos.
        </p>
      </div>

      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Icon name="loader-2" className="animate-spin" />}
          Salvar prompt
        </Button>
      </div>
    </form>
  );
}
