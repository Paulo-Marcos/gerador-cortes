import "./index.css";
import { Composition } from "remotion";
// V1 (CenaYouTube / OverlayScene / OverlayTimeline) está DESATIVADA — as
// composições foram removidas do Studio. Os arquivos permanecem em src/
// e src/cenas/ caso seja preciso reativar via novo Composition.
import { CenaYouTubeV2 } from "./CenaYouTubeV2";
import { CenaReacao } from "./CenaReacao";
import { CenaShortViral, shortViralSchema } from "./CenaShortViral";
import { OverlaySceneV2 } from "./OverlaySceneV2";
import { OverlayTimelineV2 } from "./OverlayTimelineV2";
import {
  PreviewCenasV2,
  previewCenasV2Schema,
  previewCenasV2Count,
} from "./PreviewCenasV2";
import { overlaySchema, overlayTimelineSchema } from "./overlay-schema";
import { youtubeSchema, reacaoSchema } from "./schema";
import { getVideoMetadata } from "@remotion/media-utils";

// Busca as props ativas do backend UMA VEZ na inicialização
let cachedProps: Record<string, unknown> | null = null;

async function fetchActiveProps(): Promise<Record<string, unknown>> {
  if (cachedProps) return cachedProps;
  try {
    const res = await fetch("http://localhost:8000/api/cortes/remotion/active-props");
    if (res.ok) {
      cachedProps = await res.json();
      return cachedProps!;
    }
  } catch {
    // Backend indisponível
  }
  return {};
}

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* ─── Reação (1920×1080) ─── */}
      <Composition
        id="CenaReacao"
        component={CenaReacao}
        schema={reacaoSchema}
        calculateMetadata={async ({ props }) => {
          try {
            const metadata = await getVideoMetadata(props.videoUrlFacecam);
            return {
              durationInFrames: Math.ceil(metadata.durationInSeconds * 30),
              fps: 30,
              props,
            };
          } catch (err) {
            console.error("Erro ao ler metadata do vídeo. Usando fallback.", err);
            return {
              durationInFrames: 300,
              fps: 30,
              props,
            };
          }
        }}
        defaultProps={{
          videoUrlFacecam: "",
          videoUrlTela: "",
          letterbox: true,
          filtroCss: "",
          cenas: [],
          layoutInicial: "split_50_50" as const,
        }}
        width={1920}
        height={1080}
      />

      {/* ─── Short Viral (1080×1920) ─── */}
      <Composition
        id="CenaShortViral"
        component={CenaShortViral}
        schema={shortViralSchema}
        calculateMetadata={async ({ props }) => {
          try {
            const metadata = await getVideoMetadata(props.videoUrl);
            const durationSec = props.fim_seg && props.fim_seg > props.inicio_seg
              ? (props.fim_seg - props.inicio_seg)
              : metadata.durationInSeconds;
            return {
              durationInFrames: Math.ceil(durationSec * 30),
              fps: 30,
              props,
            };
          } catch (err) {
            console.error("Erro ao ler metadata do vídeo. Usando fallback.", err);
            return {
              durationInFrames: 300,
              fps: 30,
              props,
            };
          }
        }}
        defaultProps={{
          videoUrl: "",
          inicio_seg: 0,
          fim_seg: 10,
          captions: [],
          cenas_remotion: [],
        }}
        width={1080}
        height={1920}
      />

      {/* ─── V2 — Nova identidade editorial (Space Grotesk + brackets verdes) ─── */}
      <Composition
        id="CenaYouTubeV2"
        component={CenaYouTubeV2}
        schema={youtubeSchema}
        calculateMetadata={async ({ props }) => {
          const serverProps = await fetchActiveProps();
          const videoUrl =
            props.videoUrl === ""
              ? ((serverProps.videoUrl as string) || props.videoUrl)
              : props.videoUrl;

          const cenas =
            props.cenas.length > 0
              ? props.cenas
              : ((serverProps.cenas as typeof props.cenas) || []);
          const sombraNivelPadrao =
            (serverProps.sombraNivelPadrao as typeof props.sombraNivelPadrao) ||
            props.sombraNivelPadrao;
          const layoutCardPadrao =
            (serverProps.layoutCardPadrao as typeof props.layoutCardPadrao) ||
            props.layoutCardPadrao;
          const fontPreset =
            (serverProps.fontPreset as typeof props.fontPreset) || props.fontPreset;

          try {
            const metadata = await getVideoMetadata(videoUrl);
            const maxFrame = Math.max(1, Math.floor(metadata.durationInSeconds * 30) - 2);
            const start = props.renderStartFrame ?? 0;
            const end = Math.min(props.renderEndFrame ?? maxFrame, maxFrame);
            const duration = Math.max(1, end - start);

            return {
              durationInFrames: duration,
              fps: 30,
              props: { ...props, videoUrl, cenas, sombraNivelPadrao, layoutCardPadrao, fontPreset },
            };
          } catch (err) {
            console.error("Erro ao ler metadata do vídeo (V2). Usando fallback.", err);
            return {
              durationInFrames: 300,
              fps: 30,
              props: { ...props, videoUrl, cenas, sombraNivelPadrao, layoutCardPadrao, fontPreset },
            };
          }
        }}
        defaultProps={{
          videoUrl: "",
          letterbox: true,
          filtroCss: "",
          cenas: [],
          sombraNivelPadrao: "nenhuma" as const,
          layoutCardPadrao: "vertical" as const,
          fontPreset: "atual" as const,
        }}
        width={1920}
        height={1080}
      />

      <Composition
        id="OverlaySceneV2"
        component={OverlaySceneV2}
        schema={overlaySchema}
        calculateMetadata={async ({ props }) => {
          return {
            durationInFrames: props.durationFrames,
            fps: 30,
            props,
            defaultCodec: "vp8" as const,
            defaultVideoImageFormat: "png" as const,
            defaultPixelFormat: "yuva420p" as const,
          };
        }}
        defaultProps={{
          cena: {
            tipo: "barra_inferior" as const,
            inicio: 0,
            fim: 5,
            texto: "Overlay V2 Preview",
          },
          durationFrames: 150,
          sombraNivelPadrao: "nenhuma" as const,
          layoutCardPadrao: "vertical" as const,
          fontPreset: "atual" as const,
        }}
        width={1920}
        height={1080}
      />

      <Composition
        id="OverlayTimelineV2"
        component={OverlayTimelineV2}
        schema={overlayTimelineSchema}
        calculateMetadata={async ({ props }) => {
          return {
            durationInFrames: props.durationFrames,
            fps: 30,
            props,
            defaultCodec: "prores" as const,
            defaultVideoImageFormat: "png" as const,
            defaultPixelFormat: "yuva444p10le" as const,
            defaultProResProfile: "4444" as const,
          };
        }}
        defaultProps={{
          cenas: [{
            tipo: "barra_inferior" as const,
            inicio: 0,
            fim: 5,
            texto: "Overlay Timeline V2 Preview",
          }],
          durationFrames: 150,
          sombraNivelPadrao: "nenhuma" as const,
          layoutCardPadrao: "vertical" as const,
          fontPreset: "atual" as const,
        }}
        width={1920}
        height={1080}
      />

      {/* Catálogo: as 14 cenas v2 em sequência, com badge identificador. */}
      <Composition
        id="PreviewCenasV2"
        component={PreviewCenasV2}
        schema={previewCenasV2Schema}
        calculateMetadata={async ({ props }) => {
          const segundosPorCena = props.segundosPorCena ?? 4;
          return {
            durationInFrames: Math.round(segundosPorCena * 30) * previewCenasV2Count,
            fps: 30,
            props: { segundosPorCena },
          };
        }}
        defaultProps={{ segundosPorCena: 4 }}
        width={1920}
        height={1080}
      />
    </>
  );
};
