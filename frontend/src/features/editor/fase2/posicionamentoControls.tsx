/**
 * Controles compartilhados de posicionamento (F-048).
 *
 * Componentes que editam um `YoutubeSharedConfig` (crops/slots/telas) usados
 * pelo `PosicionamentoModal`. Extraidos de `YoutubeLayoutPanel.tsx` quando
 * o painel inline foi substituido pelo modal.
 */

import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  sharedVerticalCardZone,
  type YoutubeSharedConfig,
  type YoutubeSharedRect,
  type YoutubeSharedScreenCount,
} from '@/shared/palco/youtubeLayout';
import { Icon } from '@/upgrade/Icon';
import { FOCO } from '../salaDoEditor';

// D-928: a prévia e o recorte moraram aqui; quem importa por este caminho continua valendo.
export { SlotPreview, type DragRectKey } from './SlotPreview';
export { CropPicker } from './CropPicker';

export type SharedRectKey = Exclude<keyof YoutubeSharedConfig, 'telas'>;
export type CropRectKey = 'crop_facecam' | 'crop_tela';
/** Os retângulos que se movem no preview do palco. */

export const RECT_LABEL: Record<SharedRectKey, string> = {
  crop_facecam: 'Menor recorte',
  slot_facecam: 'Menor encaixe',
  crop_tela: 'Maior recorte',
  slot_tela: 'Maior encaixe',
  zona_card: 'Cards',
};

const RECT_LABEL_SINGLE: Partial<Record<SharedRectKey, string>> = {
  crop_tela: 'Recorte',
  slot_tela: 'Encaixe',
};

export const RECT_KEYS_TWO_SCREENS: SharedRectKey[] = [
  'crop_facecam',
  'slot_facecam',
  'crop_tela',
  'slot_tela',
  'zona_card',
];
export const RECT_KEYS_ONE_SCREEN: SharedRectKey[] = ['crop_tela', 'slot_tela', 'zona_card'];
// D-904: o FULL posicionado renderiza os cards em tamanho cheio (sem zona);
// o modal de FULL não oferece o retângulo dos cards.
export const RECT_KEYS_FULL: SharedRectKey[] = ['crop_tela', 'slot_tela'];

export function isCardZoneKey(key: SharedRectKey): key is 'zona_card' {
  return key === 'zona_card';
}

/**
 * D-904: o config com a zona dos cards fixada onde a regra automática a
 * colocaria agora — o ponto de partida de quem vai arrastar.
 */
export function comZonaManual(config: YoutubeSharedConfig): YoutubeSharedConfig {
  return { ...config, zona_card: sharedVerticalCardZone(config) };
}

/** D-904: o config de volta à regra automática (a chave some, RN-10). */
export function semZonaManual(config: YoutubeSharedConfig): YoutubeSharedConfig {
  const { zona_card: _omit, ...rest } = config;
  void _omit;
  return rest;
}

export function getRectLabel(key: SharedRectKey, telas: YoutubeSharedScreenCount) {
  return telas === 1 ? (RECT_LABEL_SINGLE[key] ?? RECT_LABEL[key]) : RECT_LABEL[key];
}

export function isCropRectKey(key: SharedRectKey): key is CropRectKey {
  return key === 'crop_facecam' || key === 'crop_tela';
}

export function isFacecamRectKey(key: SharedRectKey) {
  return key === 'crop_facecam' || key === 'slot_facecam';
}

export function resizeSlotForCrop(
  slot: YoutubeSharedRect,
  oldCrop: YoutubeSharedRect,
  newCrop: YoutubeSharedRect,
): YoutubeSharedRect {
  const scale = Math.max(0.01, slot.w / Math.max(1, oldCrop.w));
  return {
    ...slot,
    w: Math.max(1, Math.round(newCrop.w * scale)),
    h: Math.max(1, Math.round(newCrop.h * scale)),
  };
}



export function SharedScreenCountToggle({
  value,
  onChange,
}: {
  value: YoutubeSharedScreenCount;
  onChange: (value: YoutubeSharedScreenCount) => void;
}) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-campo border border-fio bg-poco px-2 py-1.5">
      <span className="flex min-w-0 flex-1 text-micro text-fg-3">
        Telas
      </span>
      <div className="inline-flex items-center gap-0.5 rounded-pilula border border-fio bg-painel-solido p-0.5">
        {([1, 2] as const).map((count) => (
          <button
            key={count}
            type="button"
            data-sala=""
            onClick={() => onChange(count)}
            aria-pressed={value === count}
            className={cn(
              'h-6 rounded-pilula px-2.5 text-micro transition-colors duration-150 motion-reduce:transition-none',
              FOCO,
              value === count
                ? 'bg-iris-suave text-iris-2'
                : 'bg-transparent text-fg-2 hover:text-fg',
            )}
          >
            {count} tela{count === 1 ? '' : 's'}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ModePicker({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-sala=""
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        // D-928: o rótulo quebra linha em vez de passar da borda do botão (coluna estreita do modal).
        'min-h-[30px] rounded-campo border px-2 py-1 text-micro leading-tight transition-colors duration-150 motion-reduce:transition-none',
        FOCO,
        active
          ? 'border-iris-fio bg-iris-suave text-iris-2'
          : 'border-fio-2 bg-vidro-2 text-fg-2 hover:bg-vidro-3 hover:text-fg',
      )}
    >
      {label}
    </button>
  );
}

function IconControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <Button type="button" variant="secundario" size="pq" soIcone onClick={onClick}>
        {children}
      </Button>
    </Tooltip>
  );
}

export function SharedRectEditor({
  className,
  rect,
  baseRect,
  onChange,
  onChangeDraft,
  onCommit,
}: {
  className?: string;
  rect: YoutubeSharedRect;
  baseRect?: YoutubeSharedRect;
  onChange: (rect: YoutubeSharedRect) => void;
  onChangeDraft: (rect: YoutubeSharedRect) => void;
  onCommit: () => void;
}) {
  const scalePercent = baseRect ? Math.round((rect.w / baseRect.w) * 100) : 100;
  const setValueDraft = (field: keyof YoutubeSharedRect, value: number) => {
    onChangeDraft({ ...rect, [field]: value });
  };
  const move = (dx: number, dy: number) => onChange({ ...rect, x: rect.x + dx, y: rect.y + dy });
  const setScaleDraft = (percent: number) => {
    if (!baseRect) return;
    const scale = Math.max(1, percent) / 100;
    onChangeDraft({
      ...rect,
      w: Math.max(1, Math.round(baseRect.w * scale)),
      h: Math.max(1, Math.round(baseRect.h * scale)),
    });
  };
  const setScale = (percent: number) => {
    if (!baseRect) return;
    const scale = Math.max(1, percent) / 100;
    onChange({
      ...rect,
      w: Math.max(1, Math.round(baseRect.w * scale)),
      h: Math.max(1, Math.round(baseRect.h * scale)),
    });
  };
  const resize = (dw: number, dh: number) =>
    onChange({ ...rect, w: Math.max(1, rect.w + dw), h: Math.max(1, rect.h + dh) });

  return (
    <div className={className}>
      <div className={baseRect ? 'grid grid-cols-3 gap-1.5' : 'grid grid-cols-4 gap-1.5'}>
        {(['x', 'y'] as const).map((field) => (
          <label
            key={field}
            className="flex flex-col gap-0.5 text-micro text-fg-3"
          >
            {field}
            <Input name={field} inputMode="numeric"
              type="number"
              step="1"
              value={rect[field]}
              onChange={(event) => setValueDraft(field, Number(event.target.value))}
              onBlur={onCommit}
              aparencia="sala" className="h-7 num text-micro"
            />
          </label>
        ))}
        {baseRect ? (
          <label className="flex flex-col gap-0.5 text-micro text-fg-3">
            escala
            <Input name="escala" inputMode="numeric"
              type="number"
              step="1"
              value={scalePercent}
              onChange={(event) => setScaleDraft(Number(event.target.value))}
              onBlur={onCommit}
              aparencia="sala" className="h-7 num text-micro"
            />
          </label>
        ) : (
          (['w', 'h'] as const).map((field) => (
            <label
              key={field}
              className="flex flex-col gap-0.5 text-micro text-fg-3"
            >
              {field}
              <Input name={field} inputMode="numeric"
                type="number"
                step="1"
                value={rect[field]}
                onChange={(event) => setValueDraft(field, Number(event.target.value))}
                onBlur={onCommit}
                aparencia="sala" className="h-7 num text-micro"
              />
            </label>
          ))
        )}
      </div>
      <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="grid grid-cols-3 gap-1">
          <span />
          <IconControl label="Mover para cima" onClick={() => move(0, -10)}>
            <Icon name="arrow-up" />
          </IconControl>
          <span />
          <IconControl label="Mover para esquerda" onClick={() => move(-10, 0)}>
            <Icon name="arrow-left" />
          </IconControl>
          <IconControl label="Mover para baixo" onClick={() => move(0, 10)}>
            <Icon name="arrow-down" />
          </IconControl>
          <IconControl label="Mover para direita" onClick={() => move(10, 0)}>
            <Icon name="arrow-right" />
          </IconControl>
        </div>
        <div className="h-9 w-px bg-fio" />
        {baseRect ? (
          <div className="grid grid-cols-2 gap-1">
            <IconControl label="Diminuir tamanho" onClick={() => setScale(scalePercent - 5)}>
              <Icon name="minus" />
            </IconControl>
            <IconControl label="Aumentar tamanho" onClick={() => setScale(scalePercent + 5)}>
              <Icon name="plus" />
            </IconControl>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            <Button type="button" variant="secundario" size="pq" onClick={() => resize(-10, 0)}>
              W-
            </Button>
            <Button type="button" variant="secundario" size="pq" onClick={() => resize(10, 0)}>
              W+
            </Button>
            <Button type="button" variant="secundario" size="pq" onClick={() => resize(0, -10)}>
              H-
            </Button>
            <Button type="button" variant="secundario" size="pq" onClick={() => resize(0, 10)}>
              H+
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
