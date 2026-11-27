import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import { Icon } from '@/upgrade/Icon';

// ─────────────────────────────────────────────────────────────
// F-058 — Influência manual na thumbnail.
// Botão destacado que revela um campo de texto onde o editor escreve
// direções para a capa (pessoas a destacar, relações, ênfases). O texto
// é salvo em `corte.hints_thumbnail` e, ao gerar o prompt da thumbnail, é
// anexado ao raciocínio do capista (skill `thumbnail-prompt-expert`).
//
// Componente auto-suficiente: recebe `corteId` + valor inicial e cuida do
// estado da edição; a gravação é o `salvar` que o pai passa. Usado no Bruto (EditorFase1)
// e no modal de metadados (MetadataCard).
// ─────────────────────────────────────────────────────────────

const PLACEHOLDER =
  'Ex.: Quero que apareça o Fulano em destaque. O tema sobre X é o mais ' +
  'importante. Relacionar Fulano e Cicrano. Clima de tensão.';

interface ThumbnailHintsEditorProps {
  corteId: string;
  /** Valor persistido atual (`corte.hints_thumbnail`). */
  initialValue?: string;
  /** Começa com o campo aberto (default: abre só se já houver texto). */
  defaultOpen?: boolean;
  className?: string;
  /** Grava o texto no corte. Vem do pai: components/ não fala com a API de
   *  uma feature (D-722). */
  salvar: (hints: string) => Promise<unknown>;
  /** Notifica o pai após salvar (ex.: invalidar query do corte). */
  onSaved?: (value: string) => void;
}

export function ThumbnailHintsEditor({
  corteId,
  initialValue,
  defaultOpen,
  className,
  salvar,
  onSaved,
}: ThumbnailHintsEditorProps) {
  const { notify } = useToast();
  const [value, setValue] = useState(initialValue ?? '');
  const [saved, setSaved] = useState(initialValue ?? '');
  const [open, setOpen] = useState(defaultOpen ?? Boolean((initialValue ?? '').trim()));

  // Ressincroniza ao trocar de corte ou quando o backend devolve novo valor.
  // Comparação por string evita sobrescrever digitação em andamento quando o
  // pai refaz o fetch sem mudança real no texto.
  useEffect(() => {
    setValue(initialValue ?? '');
    setSaved(initialValue ?? '');
  }, [corteId, initialValue]);

  const hasHints = saved.trim().length > 0;
  const dirty = value.trim() !== saved.trim();

  const saveMutation = useMutation({
    mutationFn: (next: string) => salvar(next),
    onSuccess: (_data, next) => {
      setSaved(next);
      onSaved?.(next);
      notify('Influência da capa salva.', { tone: 'success' });
    },
    onError: (error) =>
      notify(error instanceof Error ? error.message : 'Erro ao salvar a influência da capa.', {
        tone: 'error',
      }),
  });

  return (
    <div className={cn('grid gap-2', className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'group inline-flex items-center gap-2 rounded-campo border px-3 py-2 text-pequeno font-semibold transition-colors',
          hasHints
            ? 'border-iris bg-iris-suave text-iris'
            : 'border-dashed border-iris text-iris hover:bg-iris-suave',
        )}
        aria-expanded={open}
      >
        <Icon name="image-plus" />
        Influenciar a capa
        {hasHints && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-iris"
            aria-label="com sugestões salvas"
          />
        )}
        <Icon
          name="chevron-down"
          className={cn('ml-auto transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="grid gap-2 rounded-campo border border-fio bg-painel-solido p-3">
          <p className="text-micro leading-snug text-fg-2">
            O que você escrever aqui é somado à inteligência do agente ao gerar o prompt da
            thumbnail.
          </p>
          <textarea name="hints"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={PLACEHOLDER}
            rows={4}
            className="resize-y rounded-etiqueta border border-fio-2 bg-poco p-2.5 text-pequeno leading-relaxed text-fg outline-none focus:border-iris focus-visible:ring-2 focus-visible:ring-foco"
          />
          <div className="flex items-center justify-between">
            <span className="font-code text-micro text-fg-3">
              {value.length} caracteres
            </span>
            <Button
              type="button" variant="secundario" size="pq"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate(value.trim())}
            >
              {saveMutation.isPending ? (
                <Icon name="loader-2" className="animate-spin" />
              ) : (
                <Icon name="check" />
              )}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
