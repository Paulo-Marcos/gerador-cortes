import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
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
    <Dialog
      open
      onClose={onClose}
      tamanho="sm"
      title={titulo}
      description={descricao}
      footer={
        <>
          <Button type="button" variant="fantasma" size="pq" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="secundario"
            size="pq"
            onClick={onConfirm}
            disabled={!value.trim() || pending}
          >
            {pending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name={confirmIcon} />}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-micro text-fg-3">Nome</span>
        <Input name="nome"
          aparencia="sala"
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
    </Dialog>
  );
}
