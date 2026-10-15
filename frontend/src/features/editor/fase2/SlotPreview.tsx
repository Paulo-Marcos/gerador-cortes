import { useEffect, useRef, useState, type RefObject } from 'react';
import type { ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import {
  sharedVerticalCardZone,
  type YoutubeBackgroundId,
  type YoutubePlaca,
  type YoutubeSharedConfig,
  type YoutubeSharedRect,
} from '@/shared/palco/youtubeLayout';
import { ComponentesArrastaveis, type EdicaoDosComponentes } from './ComponentesArrastaveis';
import { ExemploDoCard } from './ExemploDoCard';
import { GuiasNaPrevia } from './guiasDeAlinhamento';
import { PalcoDoSlotPreview } from './PalcoDoSlotPreview';
import type { SharedRectKey } from './posicionamentoControls';
import { SlotDragOverlay, redimensionarNoPalco, useArrastarRetangulo } from './SlotPreviewPartes';

// A prévia do palco no modal de posição: o palco em 1920x1080 escalado para o
// container, e por cima os retângulos que se arrastam e redimensionam (janelas,
// zona dos cards), os componentes do limpo e, desde a D-928, as guias de
// alinhamento e um card de exemplo. Saiu de `posicionamentoControls` (D-928).

export type DragRectKey = 'slot_facecam' | 'slot_tela' | 'zona_card';

interface Props {
  className?: string;
  config: YoutubeSharedConfig;
  rectKey: SharedRectKey;
  videoSrc?: string;
  currentTime: number;
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  /** D-921: o palco do canal (o rascunho, no modal); "limpo" troca o desenho. */
  palco?: ComponentesDoPalco;
  /** D-927: arrastar e redimensionar cabeçalho, placa e o card do vídeo cheio. */
  componentes?: EdicaoDosComponentes;
  /** D-928: a compartilhada tem zona dos cards; o vídeo cheio, não. */
  comZonaDosCards?: boolean;
  /** D-928: o card de exemplo desenhado por cima, com a customização em rascunho. */
  exemplo?: Parameters<typeof ExemploDoCard>[0] | null;
  onChangeSlot: (key: DragRectKey, rect: YoutubeSharedRect) => void;
}

const ROTULOS: Record<DragRectKey, { label: string; color: string }> = {
  slot_tela: { label: 'Tela', color: 'var(--wb-accent)' },
  slot_facecam: { label: 'Facecam', color: 'var(--wb-info)' },
  zona_card: { label: 'Cards', color: 'var(--wb-warn)' },
};

/** A escala que faz o palco de 1920x1080 caber no container 16:9. */
function useEscalaDoPalco(frameRef: RefObject<HTMLDivElement | null>) {
  const [escala, setEscala] = useState(1);
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const medir = () => {
      const largura = el.getBoundingClientRect().width;
      if (largura > 0) setEscala(largura / 1920);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(el);
    return () => observador.disconnect();
  }, [frameRef]);
  return escala;
}

export function SlotPreview(props: Props) {
  const { className, config, rectKey, palco, componentes, exemplo, onChangeSlot } = props;
  const frameRef = useRef<HTMLDivElement | null>(null);
  const escala = useEscalaDoPalco(frameRef);
  const zonaManual = Boolean(config.zona_card);
  const rectDe = (key: DragRectKey): YoutubeSharedRect => (key === 'zona_card' ? sharedVerticalCardZone(config) : config[key]);
  const isSelected = (key: DragRectKey) =>
    rectKey === key || (key === 'slot_facecam' && rectKey === 'crop_facecam') || (key === 'slot_tela' && rectKey === 'crop_tela');
  // D-928: a zona dos cards aparece sempre (tracejada quando não está selecionada)
  // e se arrasta mesmo na automática — o primeiro arraste a torna manual.
  const chaves: DragRectKey[] = [
    'slot_tela',
    ...(config.telas !== 1 ? (['slot_facecam'] as const) : []),
    ...(props.comZonaDosCards !== false ? (['zona_card'] as const) : []),
  ];
  const arraste = useArrastarRetangulo<DragRectKey>({ frameRef, rectDe, onChange: onChangeSlot, redimensionar: redimensionarNoPalco });

  return (
    <div className={className}>
      <div ref={frameRef} className="relative aspect-video overflow-hidden rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)]">
        {/* O palco em 1920x1080, escalado; sem eventos para não tapar os retângulos. */}
        <div
          className="pointer-events-none absolute left-0 top-0"
          style={{ width: 1920, height: 1080, transform: `scale(${escala})`, transformOrigin: '0 0' }}
        >
          <PalcoDoSlotPreview
            config={config}
            videoSrc={props.videoSrc}
            currentTime={props.currentTime}
            fundo={props.fundo}
            placa={props.placa}
            palco={palco}
          />
          {exemplo && <ExemploDoCard {...exemplo} />}
        </div>
        {chaves.map((key) => (
          <SlotDragOverlay
            key={key}
            rect={rectDe(key)}
            label={key === 'zona_card' && !zonaManual ? 'Cards (automática)' : ROTULOS[key].label}
            color={ROTULOS[key].color}
            selected={isSelected(key)}
            dragging={arraste.dragKey === key}
            contornoSempre={key === 'zona_card'}
            tracejado={key === 'zona_card' && !zonaManual}
            onPointerDown={arraste.startDrag(key)}
            onResizeDown={arraste.startResize(key)}
            onPointerMove={arraste.onMove}
            onPointerUp={arraste.endDrag}
            onPointerCancel={arraste.endDrag}
          />
        ))}
        {componentes && <ComponentesArrastaveis frameRef={frameRef} edicao={componentes} />}
        <GuiasNaPrevia guias={arraste.guias} />
      </div>
    </div>
  );
}
