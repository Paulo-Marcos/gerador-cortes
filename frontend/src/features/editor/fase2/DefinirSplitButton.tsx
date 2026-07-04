/**
 * Split button "Definir ▾" / "Mudar posicionamento ▾" (F-048).
 *
 * Botão principal abre o modal; chevron à direita abre dropdown com presets
 * de posicionamento — clicar em um preset aplica direto, sem abrir modal.
 */

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLayoutPresets } from './useLayoutPresets';
import type { LayoutPreset, LayoutPresetTipo } from '@/types/presets';

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
  const { data: presets = [], isLoading } = useLayoutPresets({ tipo: presetTipo });
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha o dropdown ao clicar fora.
  useEffect(() => {
    if (!open) return;
    const onClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  return (
    <div ref={containerRef} className="relative inline-flex">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onOpenModal}
        disabled={pending}
        className={cn('rounded-r-none border-r-0', compact && 'h-6 px-2 text-[10px]')}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {label}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label} — escolher preset`}
        className={cn('rounded-l-none px-1.5', compact && 'h-6')}
      >
        <ChevronDown size={12} />
      </Button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-[200px] overflow-hidden rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
        >
          <div className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2.5 py-1.5 font-code text-[9px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
            Aplicar preset
          </div>
          {isLoading ? (
            <div className="px-3 py-3 text-center text-[11px] text-[var(--wb-text-mute)]">
              <Loader2 size={12} className="inline animate-spin" /> Carregando…
            </div>
          ) : presets.length === 0 ? (
            <div className="px-3 py-3 text-center text-[11px] text-[var(--wb-text-mute)]">
              Nenhum preset salvo.
              <br />
              <span className="text-[10px]">Crie no botão "Definir" → "Salvar como preset".</span>
            </div>
          ) : (
            <ul role="none" className="max-h-[260px] overflow-y-auto py-1">
              {presets.map((preset) => (
                <li key={preset.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onApplyPreset(preset);
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11.5px] text-[var(--wb-text)] transition-colors hover:bg-[var(--wb-bg-inset)]"
                  >
                    <span className="truncate">{preset.nome}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
