import { type FC } from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";
import { DEFAULT_YOUTUBE_BACKGROUND, YoutubeBackground, type YoutubeBackgroundId } from "./backgrounds";
import {
  buildChromePaths,
  CardChrome,
  chromeClipPath,
  renderedSize,
  SlotBox,
  SpeakerLabel,
  SPEAKER_LABEL_GAP_FROM_IMAGE,
  SPEAKER_LABEL_HEIGHT,
  StageChrome,
  type ChromeOpts,
} from "./chrome";

/**
 * Entry dedicado p/ rasterizar o "palco" (fundo + chrome + molduras + placa) em
 * PNG 1920x1080 via `remotion still`, com as DUAS janelas de vídeo (tela/face)
 * TRANSPARENTES (Variante A da F-020). O FFmpeg empilha esse PNG POR CIMA dos
 * vídeos brutos: a transparência mostra o vídeo; o chrome opaco mascara os
 * cantos retos; sombra interna e degradê da placa ficam em ALPHA PARCIAL.
 *
 * Não toca no Root.tsx principal nem no still-entry dos fundos — bundle isolado.
 * Uso: scripts/gen-youtube-palco.mjs.
 */

// `type` (não `interface`): o tipo dos props precisa satisfazer o
// `Record<string, unknown>` que o <Composition> do Remotion exige.
type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type PalcoProps = {
  fundo: YoutubeBackgroundId;
  placa: { nome: string; papel: string };
  telas?: 1 | 2;
  crop_tela: Rect;
  crop_facecam: Rect;
  slot_tela: Rect;
  slot_facecam: Rect;
};

// Mesmos chromeOpts/outlineScale que o SharedVideoLayout do preview (frontend
// CenasRemotionPreview.tsx) usa para as duas molduras.
const TELA_OPTS: ChromeOpts = { radius: 30, chamferTR: 80, chamferBR: 44, offset: 12 };
const TELA_OUTLINE_SCALE = 0.3;
const FACE_OPTS: ChromeOpts = {};
const FACE_OUTLINE_SCALE = 1;

const FRAME_DROP_SHADOW =
  "drop-shadow(0 50px 100px rgba(0,0,0,0.65)) drop-shadow(0 16px 36px rgba(0,0,0,0.50))";
const INNER_SHADOW = "inset 0 0 60px rgba(0,0,0,0.45)";

const PalcoStill: FC<PalcoProps> = ({
  fundo,
  placa,
  telas = 2,
  crop_tela,
  crop_facecam,
  slot_tela,
  slot_facecam,
}) => {
  const tela = renderedSize(crop_tela, slot_tela);
  const face = renderedSize(crop_facecam, slot_facecam);
  const hasFacecam = telas !== 1;
  const telaW = tela.w;
  const telaH = tela.h;
  const faceW = face.w;
  const faceH = face.h;

  const telaClip = chromeClipPath(telaW, telaH, TELA_OPTS);
  const faceClip = chromeClipPath(faceW, faceH, FACE_OPTS);
  const telaMain = buildChromePaths(telaW, telaH, TELA_OPTS).main;
  const faceMain = buildChromePaths(faceW, faceH, FACE_OPTS).main;

  const temPlaca = Boolean(placa && (placa.nome || placa.papel));

  return (
    <AbsoluteFill>
      {/* Máscara que CORTA as duas janelas no fundo opaco (branco=mantém,
          preto=transparente). userSpaceOnUse → coords no palco 1920x1080. */}
      <svg width={1920} height={1080} style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
        <defs>
          <mask id="palcoCut" maskUnits="userSpaceOnUse" x="0" y="0" width="1920" height="1080">
            <rect x="0" y="0" width="1920" height="1080" fill="white" />
            <path transform={`translate(${slot_tela.x},${slot_tela.y})`} d={telaMain} fill="black" />
            {hasFacecam ? (
              <path transform={`translate(${slot_facecam.x},${slot_facecam.y})`} d={faceMain} fill="black" />
            ) : null}
          </mask>
        </defs>
      </svg>

      {/* Camada 1: fundo editorial + casters do drop-shadow, recortados pela
          máscara. O corpo preto do caster (= forma da janela) é removido pela
          máscara → janela transparente; a SOMBRA do caster sobrevive no fundo. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          maskImage: "url(#palcoCut)",
          WebkitMaskImage: "url(#palcoCut)",
        }}
      >
        <YoutubeBackground fundo={fundo} />
        <ShadowCaster x={slot_tela.x} y={slot_tela.y} w={telaW} h={telaH} clip={telaClip} />
        {hasFacecam ? <ShadowCaster x={slot_facecam.x} y={slot_facecam.y} w={faceW} h={faceH} clip={faceClip} /> : null}
      </div>

      {/* Camada 2: sombra interna (afunda as bordas do vídeo) — alpha parcial
          sobre a janela transparente. */}
      <SlotBox x={slot_tela.x} y={slot_tela.y} w={telaW} h={telaH} clip opts={TELA_OPTS}>
        <div style={{ position: "absolute", inset: 0, boxShadow: INNER_SHADOW }} />
      </SlotBox>
      {hasFacecam ? (
        <SlotBox x={slot_facecam.x} y={slot_facecam.y} w={faceW} h={faceH} clip opts={FACE_OPTS}>
          <div style={{ position: "absolute", inset: 0, boxShadow: INNER_SHADOW }} />
        </SlotBox>
      ) : null}

      {/* Camada 3: contorno das molduras (sem brackets) por cima das bordas. */}
      <SlotBox x={slot_tela.x} y={slot_tela.y} w={telaW} h={telaH}>
        <CardChrome width={telaW} height={telaH} opts={TELA_OPTS} outlineScale={TELA_OUTLINE_SCALE} showBrackets={false} />
      </SlotBox>
      {hasFacecam ? (
        <SlotBox x={slot_facecam.x} y={slot_facecam.y} w={faceW} h={faceH}>
          <CardChrome width={faceW} height={faceH} opts={FACE_OPTS} outlineScale={FACE_OUTLINE_SCALE} showBrackets={false} />
        </SlotBox>
      ) : null}

      {/* Camada 4: chrome do palco (contorno + brackets nos 4 cantos). */}
      <StageChrome />

      {/* Camada 5: placa do interlocutor — acima da tela principal, alinhada
          à esquerda da imagem, fora do contorno dela. */}
      {temPlaca ? (
        <SpeakerLabel
          left={slot_tela.x}
          top={slot_tela.y - SPEAKER_LABEL_HEIGHT - SPEAKER_LABEL_GAP_FROM_IMAGE}
          nome={placa.nome}
          papel={placa.papel}
        />
      ) : null}
    </AbsoluteFill>
  );
};

/** Caster do drop-shadow: filtro no wrapper (não recortado) + corpo preto
 *  recortado no chanfro. O wrapper não pode ser recortado, senão a sombra
 *  externa some. */
const ShadowCaster: FC<{ x: number; y: number; w: number; h: number; clip: string }> = ({ x, y, w, h, clip }) => (
  <div style={{ position: "absolute", left: x, top: y, width: w, height: h, filter: FRAME_DROP_SHADOW }}>
    <div style={{ position: "absolute", inset: 0, clipPath: clip, WebkitClipPath: clip, background: "black" }} />
  </div>
);

const DEFAULT_PROPS: PalcoProps = {
  fundo: DEFAULT_YOUTUBE_BACKGROUND,
  placa: { nome: "Pedro Ivo", papel: "pedroivosa@gmail.com" },
  telas: 2,
  crop_tela: { x: 365, y: 180, w: 1325, h: 720 },
  crop_facecam: { x: 24, y: 410, w: 340, h: 260 },
  slot_tela: { x: 500, y: 150, w: 1325, h: 720 },
  slot_facecam: { x: 54, y: 405, w: 340, h: 260 },
};

const PalcoRoot: FC = () => (
  <Composition
    id="YoutubePalco"
    component={PalcoStill}
    durationInFrames={1}
    fps={30}
    width={1920}
    height={1080}
    defaultProps={DEFAULT_PROPS}
  />
);

registerRoot(PalcoRoot);
