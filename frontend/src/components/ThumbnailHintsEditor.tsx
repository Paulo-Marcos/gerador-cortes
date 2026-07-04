import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, ChevronDown, ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────
// F-058 — Influência manual na thumbnail.
// Botão destacado que revela um campo de texto onde o editor escreve
// direções para a capa (pessoas a destacar, relações, ênfases). O texto
// é salvo em `corte.hints_thumbnail` e, ao gerar o prompt da thumbnail, é
// anexado ao raciocínio do capista (skill `thumbnail-prompt-expert`).
//
// Componente auto-suficiente: recebe `corteId` + valor inicial e gerencia a
// própria persistência via `api.atualizarCorte`. Usado no Bruto (EditorFase1)
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
  /** Notifica o pai após salvar (ex.: invalidar query do corte). */
  onSaved?: (value: string) => void;
}

export function ThumbnailHintsEditor({
  corteId,
  initialValue,
  defaultOpen,
  className,
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
    mutationFn: (next: string) => api.atualizarCorte(corteId, { hints_thumbnail: next }),
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
          'group inline-flex items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-[12.5px] font-semibold transition-colors',
          hasHints
            ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
            : 'border-dashed border-[var(--wb-accent)] text-[var(--wb-accent)] hover:bg-[var(--wb-accent-soft)]',
        )}
        aria-expanded={open}
      >
        <ImagePlus size={14} aria-hidden />
        Influenciar a capa
        {hasHints && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-[var(--wb-accent)]"
            aria-label="com sugestões salvas"
          />
        )}
        <ChevronDown
          size={13}
          aria-hidden
          className={cn('ml-auto transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="grid gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] p-3">
          <p className="text-[11.5px] leading-snug text-[var(--wb-text-mute)]">
            O que você escrever aqui é somado à inteligência do agente ao gerar o prompt da
            thumbnail.
          </p>
          <textarea
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={PLACEHOLDER}
            rows={4}
            className="resize-y rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-2.5 text-[12.5px] leading-relaxed text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)]"
          />
          <div className="flex items-center justify-between">
            <span className="font-code text-[10px] text-[var(--wb-text-dim)]">
              {value.length} caracteres
            </span>
            <Button
              type="button"
              size="sm"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate(value.trim())}
            >
              {saveMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
              Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
