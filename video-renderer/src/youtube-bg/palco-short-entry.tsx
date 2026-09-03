import { type FC } from "react";
import { AbsoluteFill, Composition, registerRoot } from "remotion";
import { DEFAULT_YOUTUBE_BACKGROUND, YoutubeBackground, type YoutubeBackgroundId } from "./backgrounds";
import {
  buildChromePaths,
  CardChrome,
  chromeClipPath,
  SlotBox,
  StageChrome,
  type ChromeOpts,
} from "./chrome";

/**
 * O palco do SHORT em PNG 1080x1920, com as janelas de vídeo transparentes
 * (E-038, D-508).
 *
 * Mesmo contrato do `palco-entry.tsx` do horizontal — fundo + chrome + molduras
 * rasterizados por `remotion still`, e o FFmpeg empilha por cima dos vídeos. O
 * que muda é o quadro (vertical), a quantidade de janelas (uma ou duas, vindas
 * do arranjo) e a ausência de placa: num short a área acima da primeira janela
 * pertence à safe zone dos apps, e uma placa ali some atrás do nome do canal.
 *
 * ## Por que um entry próprio, e não o mesmo do horizontal
 *
 * O do horizontal é feito para DUAS janelas com papéis fixos (tela e facecam),
 * com `TELA_OPTS`/`FACE_OPTS` calibrados em 1920x1080 e a placa posicionada
 * acima da tela. Generalizá-lo mexeria no palco que já sai em produção e está
 * validado — e o ganho seria juntar duas composições que nunca vão querer as
 * mesmas coisas.
 *
 * O que NÃO se duplica é a geometria: `buildChromePaths`, `CardChrome`,
 * `SlotBox` e `StageChrome` são os mesmos módulos, com o canvas por parâmetro.
 * O chanfro do canal é um só; é o quadro em volta dele que muda.
 *
 * ## Por que as janelas vêm PRONTAS do backend
 *
 * Cada `janela` já é o retângulo que o vídeo ocupa — o backend resolveu crop,
 * escala e centralização (`Recorte.janela`). Recalcular aqui criaria a segunda
 * implementação da geometria, que é o risco que este épico inteiro evita: o
 * buraco transparente ficaria alguns pixels fora do vídeo, e o sintoma seria
 * uma linha de fundo aparecendo na borda do rosto.
 */

type Janela = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type PalcoShortProps = {
  fundo: YoutubeBackgroundId;
  /** Os retângulos que o vídeo ocupa, na ordem de empilhamento. */
  janelas: Janela[];
};

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

// A janela cheia encosta nas bordas; arredondá-la deixaria quatro cantos de
// fundo aparecendo num short que era para ser tela cheia. `radius` maior que
// zero só faz sentido em janela que TEM margem em volta.
const OPTS_COM_MARGEM: ChromeOpts = { radius: 26, chamferTR: 58, chamferBR: 32, offset: 10 };
const OPTS_SEM_MARGEM: ChromeOpts = { radius: 0, chamferTR: 0, chamferBR: 0, offset: 8 };

const FRAME_DROP_SHADOW =
  "drop-shadow(0 40px 80px rgba(0,0,0,0.65)) drop-shadow(0 12px 28px rgba(0,0,0,0.50))";
const INNER_SHADOW = "inset 0 0 48px rgba(0,0,0,0.45)";

/** Uma janela colada nas bordas do quadro não leva canto arredondado. */
function optsDa(janela: Janela): ChromeOpts {
  const colada =
    janela.x <= 1 && janela.y <= 1 && janela.w >= CANVAS_W - 1 && janela.h >= CANVAS_H - 1;
  return colada ? OPTS_SEM_MARGEM : OPTS_COM_MARGEM;
}

const PalcoShortStill: FC<PalcoShortProps> = ({ fundo, janelas }) => (
  <AbsoluteFill>
    {/* Máscara que CORTA as janelas no fundo opaco (branco=mantém,
        preto=transparente). userSpaceOnUse → coordenadas do quadro do short. */}
    <svg
      width={CANVAS_W}
      height={CANVAS_H}
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
      aria-hidden
    >
      <defs>
        <mask id="palcoShortCut" maskUnits="userSpaceOnUse" x="0" y="0" width={CANVAS_W} height={CANVAS_H}>
          <rect x="0" y="0" width={CANVAS_W} height={CANVAS_H} fill="white" />
          {janelas.map((j, i) => (
            <path
              key={i}
              transform={`translate(${j.x},${j.y})`}
              d={buildChromePaths(j.w, j.h, optsDa(j)).main}
              fill="black"
            />
          ))}
        </mask>
      </defs>
    </svg>

    {/* Camada 1: fundo editorial + casters do drop-shadow, recortados pela
        máscara. O corpo preto do caster é removido pela máscara → janela
        transparente; a SOMBRA dele sobrevive no fundo. */}
    <div
      style={{
        position: "absolute",
        inset: 0,
        maskImage: "url(#palcoShortCut)",
        WebkitMaskImage: "url(#palcoShortCut)",
      }}
    >
      <YoutubeBackground fundo={fundo} />
      {janelas.map((j, i) => (
        <ShadowCaster key={i} janela={j} clip={chromeClipPath(j.w, j.h, optsDa(j))} />
      ))}
    </div>

    {/* Camada 2: sombra interna, que afunda as bordas do vídeo. */}
    {janelas.map((j, i) => (
      <SlotBox key={i} x={j.x} y={j.y} w={j.w} h={j.h} clip opts={optsDa(j)}>
        <div style={{ position: "absolute", inset: 0, boxShadow: INNER_SHADOW }} />
      </SlotBox>
    ))}

    {/* Camada 3: contorno de cada janela, por cima das bordas. */}
    {janelas.map((j, i) => (
      <SlotBox key={i} x={j.x} y={j.y} w={j.w} h={j.h}>
        <CardChrome width={j.w} height={j.h} opts={optsDa(j)} outlineScale={0.3} showBrackets={false} />
      </SlotBox>
    ))}

    {/* Camada 4: chrome do palco — contorno + brackets nos 4 cantos. O padding
        é maior que o do horizontal porque aqui ele divide espaço com a safe
        zone dos apps: colado na borda, o bracket some atrás da interface. */}
    <StageChrome pad={40} canvasW={CANVAS_W} canvasH={CANVAS_H} />
  </AbsoluteFill>
);

/** Caster do drop-shadow: filtro no wrapper (não recortado) + corpo preto
 *  recortado no chanfro. Recortar o wrapper mataria a sombra externa. */
const ShadowCaster: FC<{ janela: Janela; clip: string }> = ({ janela, clip }) => (
  <div
    style={{
      position: "absolute",
      left: janela.x,
      top: janela.y,
      width: janela.w,
      height: janela.h,
      filter: FRAME_DROP_SHADOW,
    }}
  >
    <div style={{ position: "absolute", inset: 0, clipPath: clip, WebkitClipPath: clip, background: "black" }} />
  </div>
);

const DEFAULT_PROPS: PalcoShortProps = {
  fundo: DEFAULT_YOUTUBE_BACKGROUND,
  janelas: [
    { x: 0, y: 363, w: 1080, h: 586 },
    { x: 0, y: 960, w: 1080, h: 960 },
  ],
};

const PalcoShortRoot: FC = () => (
  <Composition
    id="ShortPalco"
    component={PalcoShortStill}
    durationInFrames={1}
    fps={30}
    width={CANVAS_W}
    height={CANVAS_H}
    defaultProps={DEFAULT_PROPS}
  />
);

registerRoot(PalcoShortRoot);
