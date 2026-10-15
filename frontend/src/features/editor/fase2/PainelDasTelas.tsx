import {
  ModePicker,
  SharedRectEditor,
  SharedScreenCountToggle,
  getRectLabel,
  isCardZoneKey,
  type SharedRectKey,
} from './posicionamentoControls';
import { ZonaCardsControle } from './ZonaCardsControle';
import type { YoutubeSharedRect, YoutubeSharedScreenCount } from '@/shared/palco/youtubeLayout';

// D-927: o grupo "Telas" do modal de posição — quantas telas, qual retângulo
// se edita (recorte, encaixe, zona dos cards) e os números dele. O arraste e a
// alça de tamanho ficam na prévia; os números são o ajuste fino.

export function PainelDasTelas({
  isFullMode,
  telas,
  onTelas,
  opcoes,
  rectKey,
  onRectKey,
  zonaManual,
  onZonaAutomatica,
  onZonaManual,
  editorLiberado,
  rect,
  baseRect,
  onRect,
}: {
  isFullMode: boolean;
  telas: YoutubeSharedScreenCount;
  onTelas: (telas: YoutubeSharedScreenCount) => void;
  opcoes: readonly SharedRectKey[];
  rectKey: SharedRectKey;
  onRectKey: (key: SharedRectKey) => void;
  zonaManual: boolean;
  onZonaAutomatica: () => void;
  onZonaManual: () => void;
  editorLiberado: boolean;
  rect: YoutubeSharedRect;
  baseRect?: YoutubeSharedRect;
  onRect: (rect: YoutubeSharedRect) => void;
}) {
  return (
    <div className="grid gap-2">
      {!isFullMode && <SharedScreenCountToggle value={telas} onChange={onTelas} />}
      <div className="grid grid-cols-2 gap-1.5">
        {opcoes.map((key) => (
          <ModePicker key={key} active={rectKey === key} label={getRectLabel(key, isFullMode ? 1 : telas)} onClick={() => onRectKey(key)} />
        ))}
      </div>
      {isCardZoneKey(rectKey) && (
        <ZonaCardsControle manual={zonaManual} onAutomatica={onZonaAutomatica} onManual={onZonaManual} />
      )}
      {editorLiberado && (
        <SharedRectEditor rect={rect} baseRect={baseRect} onChange={onRect} onChangeDraft={onRect} onCommit={() => undefined} />
      )}
    </div>
  );
}
