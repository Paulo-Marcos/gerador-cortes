import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Icon, type IconName } from '@/upgrade/Icon';

/**
 * O mini modal aninhado do PosicionamentoModal que pede um nome de preset —
 * para salvar um novo ou renomear o selecionado. Um componente só: os dois
 * diferem apenas no texto e no botão.
 */
export function NomeDoPresetDialog({
  titulo,
  descricao,
  placeholder,
  value,
  onChange,
  onConfirm,
  onClose,
  confirmLabel,
  confirmIcon,
  pending,
}: {
  titulo: string;
  descricao: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  confirmLabel: string;
  confirmIcon: IconName;
  pending: boolean;
}) {
  return (
    <div
      className="absolute inset-0 z-[90] flex items-center justify-center bg-black/40"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        <strong className="block font-editorial text-[14px] text-[var(--wb-ink)]">{titulo}</strong>
        <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">{descricao}</p>
        <label className="mt-3 flex flex-col gap-1">
          <span className="font-code text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
            Nome
          </span>
          <Input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            maxLength={120}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && value.trim()) {
                event.preventDefault();
                onConfirm();
              }
            }}
          />
        </label>
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={onConfirm}
            disabled={!value.trim() || pending}
          >
            {pending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name={confirmIcon} />}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
