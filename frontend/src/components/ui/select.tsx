import * as RadixSelect from '@radix-ui/react-select';
import { Icon } from '@/upgrade/Icon';
import { cn } from '@/lib/utils';
import { CLASSES_DO_CAMPO, useLigacaoDoCampo } from './field';
import { GiroDoCampo } from './input';

// D-1116 (E-069 H-08): select da Sala escura sobre o Radix Select, que dá teclado,
// digitação para pular e leitor de tela. O gatilho é um campo (40 px, canto 12); a lista
// é um menu flutuante (`pop` + `sombra-pop`): é o único lugar onde o vidro da casca é
// permitido nesta família (§3.6) — e aqui ele nem usa `backdrop-filter`.
export type OpcaoDoSelect = { valor: string; rotulo: string; desabilitada?: boolean };

export type SelectProps = {
  opcoes: OpcaoDoSelect[];
  value?: string;
  onValueChange?: (valor: string) => void;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  invalido?: boolean;
  carregando?: boolean | string;
  className?: string;
  'aria-label'?: string;
};

export function Select({
  opcoes,
  value,
  onValueChange,
  placeholder = 'Selecione',
  id,
  name,
  disabled,
  invalido,
  carregando,
  className,
  'aria-label': ariaLabel,
}: SelectProps) {
  const campo = useLigacaoDoCampo();
  const frase = typeof carregando === 'string' ? carregando : 'Carregando…';
  return (
    <RadixSelect.Root
      value={value}
      onValueChange={onValueChange}
      name={name}
      disabled={disabled || Boolean(carregando)}
    >
      <div className="relative w-full">
        <RadixSelect.Trigger
          data-sala=""
          id={id ?? campo?.id}
          aria-label={ariaLabel}
          aria-busy={carregando ? true : undefined}
          aria-invalid={invalido ?? campo?.invalido ? true : undefined}
          aria-describedby={campo?.describedBy}
          className={cn(
            CLASSES_DO_CAMPO,
            'flex h-10 items-center justify-between gap-2 px-3.5 text-left data-[placeholder]:text-fg-3',
            className,
          )}
        >
          {carregando ? (
            <span className="text-fg-3">{frase}</span>
          ) : (
            <RadixSelect.Value placeholder={placeholder}>
              {/* O rótulo sai daqui (e não do ItemText, que só existe com a lista aberta). */}
              {opcoes.find((o) => o.valor === value)?.rotulo}
            </RadixSelect.Value>
          )}
          {!carregando && (
            <RadixSelect.Icon className="text-fg-3">
              <Icon name="chevron-down" size={16} />
            </RadixSelect.Icon>
          )}
        </RadixSelect.Trigger>
        {carregando && <GiroDoCampo />}
      </div>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[14px] border border-fio-2 bg-pop p-1.5 text-corpo text-fg shadow-pop-luz"
        >
          <RadixSelect.Viewport>
            {opcoes.map((o) => (
              <RadixSelect.Item
                key={o.valor}
                value={o.valor}
                disabled={o.desabilitada}
                className="relative flex cursor-pointer select-none items-center justify-between gap-3 rounded-[10px] px-3 py-2 outline-none data-[disabled]:cursor-not-allowed data-[disabled]:text-fg-off data-[highlighted]:bg-vidro-3 data-[state=checked]:text-iris-2"
              >
                <RadixSelect.ItemText>{o.rotulo}</RadixSelect.ItemText>
                <RadixSelect.ItemIndicator>
                  <Icon name="check" size={14} />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
