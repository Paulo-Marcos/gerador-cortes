/**
 * Split button "Definir ▾" / "Mudar posicionamento ▾" (F-048).
 *
 * Botão principal abre o modal; chevron à direita abre dropdown com presets
 * de posicionamento — clicar em um preset aplica direto, sem abrir modal.
 */

import { Button } from '@/components/ui/button';
import { Menu, MenuContent, MenuItem, MenuRotulo, MenuTrigger } from '@/components/ui/menu';
import { cn } from '@/lib/utils';
import { useLayoutPresetsDoEstilo } from '@/features/channels/palcoDoEscopo';
import type { LayoutPreset, LayoutPresetTipo } from '@/types/presets';
import { Icon } from '@/upgrade/Icon';

interface DefinirSplitButtonProps {
  /** Texto do botão principal — "Definir", "Mudar posicionamento" etc. */
  label: string;
  /** Aberto ao clicar no botão principal. */
  onOpenModal: () => void;
  /** Aplicado ao clicar em um preset do dropdown. */
  onApplyPreset: (preset: LayoutPreset) => void;
  /** F-060: tipo de preset listado no dropdown (por modo). */
  presetTipo?: LayoutPresetTipo;
  /** Tom do botão (cor de destaque). */
  tone?: string;
  /** Pending durante mutation/save. */
  pending?: boolean;
  /** Compacto: usado em RegionItem. */
  compact?: boolean;
}

export function DefinirSplitButton({
  label,
  onOpenModal,
  onApplyPreset,
  presetTipo = 'posicionamento',
  pending,
  compact = false,
}: DefinirSplitButtonProps) {
  const { data: presets = [], isLoading } = useLayoutPresetsDoEstilo({ tipo: presetTipo });

  return (
    <div className="relative inline-flex">
      <Button
        type="button"
        variant="secundario"
        size="pq"
        onClick={onOpenModal}
        disabled={pending}
        className={cn('rounded-r-none border-r-0', compact && 'h-6 px-2 text-micro')}
      >
        {pending ? <Icon name="loader-2" className="animate-spin" /> : null}
        {label}
      </Button>
      {/* O menu do Radix cuida de abrir, fechar com Esc ou clique fora e devolver o foco. */}
      <Menu>
        <MenuTrigger asChild>
          <Button
            type="button"
            variant="secundario"
            size="pq"
            aria-label={`${label} — escolher preset`}
            className={cn('rounded-l-none px-1.5', compact && 'h-6')}
          >
            <Icon name="chevron-down" />
          </Button>
        </MenuTrigger>
        <MenuContent align="end" className="max-h-[260px] overflow-y-auto">
          <MenuRotulo>Aplicar preset</MenuRotulo>
          {isLoading ? (
            <div className="px-3 py-3 text-center text-pequeno text-fg-2">
              <Icon name="loader-2" className="inline animate-spin" /> Carregando…
            </div>
          ) : presets.length === 0 ? (
            <div className="px-3 py-3 text-center text-pequeno text-fg-2">
              Nenhum preset salvo.
              <br />
              <span className="text-micro">Crie no botão "Definir" → "Salvar como preset".</span>
            </div>
          ) : (
            presets.map((preset) => (
              <MenuItem key={preset.id} onSelect={() => onApplyPreset(preset)}>
                <span className="truncate">{preset.nome}</span>
              </MenuItem>
            ))
          )}
        </MenuContent>
      </Menu>
    </div>
  );
}
