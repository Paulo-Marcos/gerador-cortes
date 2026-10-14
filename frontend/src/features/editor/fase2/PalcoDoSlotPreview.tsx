import {
  ImageFrame,
  SPEAKER_LABEL_GAP_FROM_IMAGE,
  SPEAKER_LABEL_HEIGHT,
  SpeakerLabelOverlay,
  StageChrome,
} from '@/shared/palco/youtubeChrome';
import { YoutubeBackground } from '@/shared/palco/youtubeBackgrounds';
import type { ComponentesDoPalco } from '@/shared/palco/palcoLimpo';
import type { YoutubeBackgroundId, YoutubePlaca, YoutubeSharedConfig } from '@/shared/palco/youtubeLayout';
import { PalcoLimpoCompartilhado, renderedSize } from './PalcoLimpoCompartilhado';
import { CroppedStill } from './SlotPreviewPartes';

// D-921: o palco da prévia do modal de posição. Era sempre o desenho de sempre
// (textura, chrome chanfrado), mesmo com o canal no estilo limpo; agora segue o
// palco do canal — no modal, o RASCUNHO dele, então trocar o estilo ou mexer
// num componente aparece aqui na hora. As janelas mostram o quadro parado do
// tempo atual, como antes.

interface Props {
  config: YoutubeSharedConfig;
  videoSrc?: string;
  currentTime: number;
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
  palco?: ComponentesDoPalco;
}

export function PalcoDoSlotPreview(props: Props) {
  if (props.palco?.estilo === 'limpo') {
    const { config, videoSrc, currentTime, placa, palco } = props;
    return (
      <PalcoLimpoCompartilhado
        videoSrc={videoSrc ?? ''}
        config={config}
        placa={placa}
        palco={palco}
        midia={(crop, slot) => {
          const { w, h } = renderedSize(crop, slot);
          return videoSrc ? (
            <CroppedStill videoSrc={videoSrc} currentTime={currentTime} crop={crop} renderW={w} renderH={h} />
          ) : (
            <div className="h-full w-full bg-[var(--wb-bg-inset)]" />
          );
        }}
      />
    );
  }
  return <PalcoDeSempre {...props} />;
}

function PalcoDeSempre({ config, videoSrc, currentTime, fundo, placa }: Props) {
  const hasFacecam = config.telas !== 1;
  const { w: telaW, h: telaH } = renderedSize(config.crop_tela, config.slot_tela);
  const { w: faceW, h: faceH } = renderedSize(config.crop_facecam, config.slot_facecam);
  const temPlaca = Boolean(placa && (placa.nome || placa.papel));
  return (
    <>
    <YoutubeBackground fundo={fundo} />
    <StageChrome />
    <ImageFrame
      left={config.slot_tela.x}
      top={config.slot_tela.y}
      width={telaW}
      height={telaH}
      chromeOpts={{ radius: 30, chamferTR: 80, chamferBR: 44, offset: 12 }}
      outlineScale={0.3}
    >
      {videoSrc ? (
        <CroppedStill
          videoSrc={videoSrc}
          currentTime={currentTime}
          crop={config.crop_tela}
          renderW={telaW}
          renderH={telaH}
        />
      ) : (
        <div className="h-full w-full bg-[var(--wb-bg-inset)]" />
      )}
    </ImageFrame>
    {hasFacecam && (
      <ImageFrame
        left={config.slot_facecam.x}
        top={config.slot_facecam.y}
        width={faceW}
        height={faceH}
      >
        {videoSrc ? (
          <CroppedStill
            videoSrc={videoSrc}
            currentTime={currentTime}
            crop={config.crop_facecam}
            renderW={faceW}
            renderH={faceH}
          />
        ) : (
          <div className="h-full w-full bg-[var(--wb-bg-inset)]" />
        )}
      </ImageFrame>
    )}
    {temPlaca && (
      <SpeakerLabelOverlay
        left={config.slot_tela.x}
        top={config.slot_tela.y - SPEAKER_LABEL_HEIGHT - SPEAKER_LABEL_GAP_FROM_IMAGE}
        nome={placa.nome}
        papel={placa.papel}
      />
    )}
    </>
  );
}
