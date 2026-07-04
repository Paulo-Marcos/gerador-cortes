import { Fragment, type ComponentType, type ReactNode } from 'react';
import { AbsoluteFill, Video, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { FrameOffsetContext } from '@video-renderer/frame-context';
// V1 (renderCena de OverlayScene) está desativada — preview usa apenas V2.
import { renderCenaV2 } from '@video-renderer/cenas-v2';
import {
  CardLayoutContext,
  FontPresetProvider as RendererFontPresetProvider,
  SombraContext,
  resolverNivel,
  SOMBRA_TOKENS,
} from '@video-renderer/cenas-v2/_shared';
import { SharedCardZoneFrame } from '@video-renderer/shared-card-zone';
import type { CenaRemotion as CenaShared } from '@video-renderer/schema';
import type { CenaRemotion, FontePreset } from '@/types/models';
import { aplicarLayoutCardPadrao, type LayoutCardPadrao } from './cardPreviewContracts';
import {
  isDefaultFullConfig,
  resolveCardLayoutForScene,
  resolveFullConfigAtTime,
  resolveSharedConfigAtTime,
  resolveYoutubeModeAt,
  resolveYoutubeModeForScene,
  sharedConfigFromFull,
  sharedVerticalCardZone,
  type YoutubeBackgroundId,
  type YoutubeLayout,
  type YoutubePlaca,
  type YoutubeSharedRect,
} from './youtubeLayout';
import { YoutubeBackground } from './youtubeBackgrounds';
import {
  ImageFrame,
  SpeakerLabelOverlay,
  SPEAKER_LABEL_GAP_FROM_IMAGE,
  SPEAKER_LABEL_HEIGHT,
  StageChrome,
} from './youtubeChrome';

// O video-renderer usa @types/react 19 (`ReactNode` inclui `bigint`); frontend está em
// 18. Em runtime é o mesmo React deduplicado pelo Vite — só os tipos divergem, então
// reanota o Provider com a assinatura local.
const FrameOffsetProvider = FrameOffsetContext.Provider as unknown as ComponentType<{
  value: number;
  children: ReactNode;
}>;

const SombraProvider = SombraContext.Provider as unknown as ComponentType<{
  value: 'nenhuma' | 'leve' | 'media' | 'forte';
  children: ReactNode;
}>;

const CardLayoutProvider = CardLayoutContext.Provider as unknown as ComponentType<{
  value: 'horizontal' | 'vertical';
  children: ReactNode;
}>;

const FontPresetProvider = RendererFontPresetProvider as unknown as ComponentType<{
  preset?: FontePreset;
  children: ReactNode;
}>;

export type SombraNivelPadrao = 'nenhuma' | 'leve' | 'media' | 'forte';

export interface CenasRemotionPreviewProps {
  videoSrc: string;
  cenas: CenaRemotion[];
  sombraNivelPadrao?: SombraNivelPadrao;
  layoutCardPadrao?: LayoutCardPadrao;
  fontPreset?: FontePreset;
  layoutYoutube?: YoutubeLayout;
  /** Toggle I-029: quando true, renderiza apenas o video bruto (sem cenas,
   * sem overlay editorial). Util para conferir o tempo exato do clipe ao
   * ajustar regioes de layout pela timeline. */
  cenasOcultas?: boolean;
}

/**
 * Preview espelhando o que será renderizado pelo Remotion ao gerar o vídeo
 * final. Apenas V2 — a versão V1 foi desativada do projeto, todos os
 * projetos usam a nova identidade editorial.
 *
 * Mantém a mesma estrutura do CenaYouTubeV2 do video-renderer para PARIDADE
 * VISUAL 1:1 com o Studio Remotion.
 */
export const CenasRemotionPreview: React.FC<CenasRemotionPreviewProps> = ({
  videoSrc,
  cenas,
  sombraNivelPadrao = 'nenhuma',
  layoutCardPadrao = 'vertical',
  fontPreset = 'atual',
  layoutYoutube,
  cenasOcultas = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // I-029: toggle Remotion off — devolve so o video bruto (sem layout
  // compartilhado, sem palco, sem cards). currentTime continua sincronizado
  // via frame/fps, entao a timeline e o playhead ficam intactos.
  if (cenasOcultas) {
    return (
      <AbsoluteFill>
        {videoSrc ? (
          <Video
            src={videoSrc}
            muted={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}
      </AbsoluteFill>
    );
  }
  const layoutMode = layoutYoutube ? resolveYoutubeModeAt(layoutYoutube, currentTime) : 'full';
  // F-048: preview reflete override do segmento ativo (compartilhada por
  // regiao prevalece sobre o config do corte).
  const sharedConfig = layoutYoutube
    ? resolveSharedConfigAtTime(layoutYoutube, currentTime)
    : undefined;
  // F-060: FULL posicionado (crop/slot != quadro inteiro) renderiza pelo
  // MESMO palco de 1 tela do compartilhado — paridade com o filtergraph do
  // ffmpeg_commands. FULL default segue como video puro em tela cheia.
  const fullConfig = layoutYoutube
    ? resolveFullConfigAtTime(layoutYoutube, currentTime)
    : undefined;
  const fullPosicionado = Boolean(fullConfig && !isDefaultFullConfig(fullConfig));
  const fundo = layoutYoutube?.fundo;
  const placa = layoutYoutube?.placa;

  const overlayCenas = (
    <FrameOffsetProvider value={0}>
      {cenas.map((cena, index) => {
        const isActive = currentTime >= cena.inicio && currentTime <= cena.fim;
        if (!isActive) return null;
        const layoutDaCena = layoutYoutube
          ? resolveCardLayoutForScene(cena, layoutYoutube, layoutCardPadrao)
          : layoutCardPadrao;
        const modoDaCena = layoutYoutube ? resolveYoutubeModeForScene(layoutYoutube, cena) : 'full';
        const zonaCard =
          modoDaCena === 'compartilhada' && sharedConfig && layoutDaCena === 'vertical'
            ? sharedVerticalCardZone(sharedConfig)
            : null;
        const cenaComContexto = zonaCard
          ? {
              ...cena,
              layout_youtube_modo: 'compartilhada' as const,
              layout_card_zone: zonaCard,
            }
          : cena;
        const cenaRender = aplicarLayoutCardPadrao(
          cenaComContexto,
          layoutDaCena,
        ) as unknown as CenaShared;
        return (
          <Fragment key={index}>
            <SharedCardZoneFrame cena={cenaRender}>{renderCenaV2(cenaRender)}</SharedCardZoneFrame>
          </Fragment>
        );
      })}
    </FrameOffsetProvider>
  );

  // Cena ativa naquele frame — define se o palco aparece, e qual nível
  // de sombra usar. Sem cena ativa, palco fica invisível (só vídeo passa).
  const cenaAtiva = cenas.find((c) => currentTime >= c.inicio && currentTime <= c.fim);

  // Tipos de cena que NÃO usam o palco gradient global. São cenas
  // localizadas (card pequeno em um canto) onde escurecer a tela toda
  // não faz sentido — basta o drop-shadow ao redor do próprio card.
  const TIPOS_SEM_PALCO = new Set<string>(['pergunta_transicao']);
  const cenaUsaPalco = cenaAtiva ? !TIPOS_SEM_PALCO.has(cenaAtiva.tipo) : false;

  const nivelEfetivo =
    cenaAtiva && cenaUsaPalco ? resolverNivel(cenaAtiva.sombra_nivel, sombraNivelPadrao) : null;
  const tokens = nivelEfetivo ? SOMBRA_TOKENS[nivelEfetivo] : null;

  // Fade gradual de entrada/saída do palco — atrelado à janela da cena
  // ativa para que o fundo "ganhe cor" de forma suave (não abrupta).
  // ~14 frames (~0.47s a 30fps) de fade em cada ponta, com clamp para
  // cenas muito curtas (split entre in e out).
  const FADE_FRAMES = 14;
  const cenaFade = (() => {
    if (!cenaAtiva) return 0;
    const inicioF = cenaAtiva.inicio * fps;
    const fimF = cenaAtiva.fim * fps;
    const duracao = Math.max(1, fimF - inicioF);
    const janela = Math.min(FADE_FRAMES, Math.floor(duracao / 2));
    const fadeIn = interpolate(frame, [inicioF, inicioF + janela], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    const fadeOut = interpolate(frame, [fimF - janela, fimF], [1, 0], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    });
    return Math.max(0, Math.min(fadeIn, fadeOut));
  })();

  const palcoOpacity = tokens ? tokens.cardOpacity * cenaFade : 0;

  return (
    <AbsoluteFill>
      {/* Camada 1: vídeo de referência (atrás de tudo). */}
      {videoSrc && layoutMode !== 'compartilhada' && !fullPosicionado ? (
        <AbsoluteFill>
          <Video
            src={videoSrc}
            muted={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </AbsoluteFill>
      ) : null}

      {videoSrc && layoutMode === 'compartilhada' && sharedConfig ? (
        <SharedVideoLayout videoSrc={videoSrc} config={sharedConfig} fundo={fundo} placa={placa} />
      ) : null}

      {/* F-060: FULL posicionado — palco de 1 tela com o crop/slot do FULL. */}
      {videoSrc && layoutMode === 'full' && fullPosicionado && fullConfig ? (
        <SharedVideoLayout
          videoSrc={videoSrc}
          config={sharedConfigFromFull(fullConfig)}
          fundo={fundo}
          placa={placa}
        />
      ) : null}

      {/* Camada 2: fundo editorial "palco" — aparece JUNTO com a cena ativa e
          some quando não há cena. Sua opacity é a sombra efetiva da cena. */}
      {palcoOpacity > 0 && (
        <AbsoluteFill style={{ opacity: palcoOpacity }}>
          <YoutubeBackground fundo={fundo} />
        </AbsoluteFill>
      )}

      {/* Camada 3: cenas + Providers de sombra/layout/fontes. */}
      <AbsoluteFill>
        <FontPresetProvider preset={fontPreset}>
          <SombraProvider value={sombraNivelPadrao}>
            <CardLayoutProvider value={layoutCardPadrao}>{overlayCenas}</CardLayoutProvider>
          </SombraProvider>
        </FontPresetProvider>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

function SharedVideoLayout({
  videoSrc,
  config,
  fundo,
  placa,
}: {
  videoSrc: string;
  config: {
    telas: 1 | 2;
    crop_facecam: YoutubeSharedRect;
    crop_tela: YoutubeSharedRect;
    slot_facecam: YoutubeSharedRect;
    slot_tela: YoutubeSharedRect;
  };
  fundo?: YoutubeBackgroundId;
  placa?: YoutubePlaca;
}) {
  const tela = renderedSize(config.crop_tela, config.slot_tela);
  const face = renderedSize(config.crop_facecam, config.slot_facecam);
  const hasFacecam = config.telas !== 1;
  const temPlaca = Boolean(placa && (placa.nome || placa.papel));

  return (
    <AbsoluteFill>
      <YoutubeBackground fundo={fundo} />
      <StageChrome />
      <ImageFrame
        left={config.slot_tela.x}
        top={config.slot_tela.y}
        width={tela.w}
        height={tela.h}
        chromeOpts={{ radius: 30, chamferTR: 80, chamferBR: 44, offset: 12 }}
        outlineScale={0.3}
      >
        <CropVideo
          videoSrc={videoSrc}
          crop={config.crop_tela}
          slot={config.slot_tela}
          muted={false}
        />
      </ImageFrame>
      {hasFacecam ? (
        <ImageFrame
          left={config.slot_facecam.x}
          top={config.slot_facecam.y}
          width={face.w}
          height={face.h}
        >
          <CropVideo
            videoSrc={videoSrc}
            crop={config.crop_facecam}
            slot={config.slot_facecam}
            muted
          />
        </ImageFrame>
      ) : null}
      {temPlaca && placa ? (
        <SpeakerLabelOverlay
          left={config.slot_tela.x}
          top={config.slot_tela.y - SPEAKER_LABEL_HEIGHT - SPEAKER_LABEL_GAP_FROM_IMAGE}
          nome={placa.nome}
          papel={placa.papel}
        />
      ) : null}
    </AbsoluteFill>
  );
}

function renderedSize(crop: YoutubeSharedRect, slot: YoutubeSharedRect) {
  const scale = Math.min(slot.w / crop.w, slot.h / crop.h);
  return { w: crop.w * scale, h: crop.h * scale };
}

// Renderiza só o vídeo deslocado/escalado para o recorte preencher a moldura
// (ImageFrame faz o posicionamento + clip chanfrado). maxWidth/maxHeight:none
// impede o preflight do Tailwind de espremer o frame dentro do slot.
function CropVideo({
  videoSrc,
  crop,
  slot,
  muted,
}: {
  videoSrc: string;
  crop: YoutubeSharedRect;
  slot: YoutubeSharedRect;
  muted: boolean;
}) {
  const scale = Math.min(slot.w / crop.w, slot.h / crop.h);

  return (
    <Video
      src={videoSrc}
      muted={muted}
      style={{
        position: 'absolute',
        left: -crop.x * scale,
        top: -crop.y * scale,
        width: 1920 * scale,
        height: 1080 * scale,
        maxWidth: 'none',
        maxHeight: 'none',
        objectFit: 'fill',
      }}
    />
  );
}
