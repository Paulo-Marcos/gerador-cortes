import { type FC } from "react";
import { AbsoluteFill, Composition, Img, registerRoot } from "remotion";
import {
  DEFAULT_YOUTUBE_BACKGROUND,
  YoutubeBackground,
  type YoutubeBackgroundId,
} from "./backgrounds";
import {
  CardChrome,
  chromeClipPath,
  SlotBox,
  StageChrome,
  type ChromeOpts,
} from "./chrome";

/**
 * A capa vertical do TikTok em PNG 1080x1920 (D-519).
 *
 * ## Por que existe uma capa separada da do YouTube
 *
 * A thumbnail do canal é 16:9, feita para um cartaz que disputa o clique numa
 * lista. A capa do TikTok é 9:16 mesmo para o vídeo deitado — que toca com
 * tarjas enquanto a capa ocupa o quadro inteiro —, e o trabalho dela é outro:
 * no feed o vídeo já começou tocando, então ela decide a VITRINE do perfil,
 * onde nove capas aparecem juntas. Daí as duas ou três palavras, contra a
 * manchete inteira do Capista.
 *
 * ## O desenho, e por que ele é sempre o mesmo
 *
 * A arte 4:5 ocupa o quadro; a etiqueta e o selo vão POR CIMA dela, dentro do
 * quadrado central de 1080x1080 — o que sobrevive ao recorte da grade do perfil.
 *
 * Duas regras diferentes: o TEXTO fica preso ao quadrado seguro, porque uma
 * etiqueta cortada pela metade não se lê; a ARTE sangra além dele de propósito,
 * porque o recorte mostra o miolo dela, que é onde o assunto está.
 *
 * A repetição é o ponto: identidade de grade nasce de layout constante, não de
 * cada capa ser inventiva. O backend manda a geometria pronta
 * (`app/domain/capa_tiktok.py`) pelo mesmo motivo do palco: duas
 * implementações da mesma conta divergem no primeiro arredondamento.
 *
 * ## Por que o frame vem em data URI
 *
 * O still do vídeo chega embutido nos props. Copiá-lo para `public/` invalidaria
 * o fingerprint do bundle a cada corte (D-190) — o cache do Remotion pararia de
 * acertar e cada capa custaria um bundle novo.
 */

type CapaTikTokProps = {
  fundo: YoutubeBackgroundId;
  /** 2-3 palavras, já normalizadas e em caixa alta pelo backend. */
  etiqueta: string;
  /** O selo do canal — normalmente `@handle`. */
  selo: string;
  /** A arte 4:5, como data URI. Vazio = área só com o fundo. */
  frameDataUri: string;
  /** Geometria vinda de `montar_layout()`, em pixels do quadro. */
  faixas: {
    etiqueta: Faixa;
    frame: Faixa;
    selo: Faixa;
  };
};

type Faixa = { x: number; y: number; w: number; h: number };

export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

// O mesmo recorte das janelas do palco (`OPTS_COM_MARGEM`). A capa é a vitrine:
// se o chanfro aqui não for o de lá, o perfil e o vídeo parecem de canais
// diferentes.
const OPTS_DO_FRAME: ChromeOpts = {
  radius: 26,
  chamferTR: 58,
  chamferBR: 32,
  offset: 10,
};

// Véus escuros nas pontas da arte. A etiqueta tem contorno pesado, mas contorno
// não salva texto branco sobre uma área clara da ilustração — e a arte muda a
// cada corte, então não dá para contar com o fundo dela.
const VEU_DE_CIMA =
  "linear-gradient(to bottom, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)";
const VEU_DE_BAIXO =
  "linear-gradient(to top, rgba(0,0,0,0.68) 0%, rgba(0,0,0,0.30) 60%, rgba(0,0,0,0) 100%)";

const SOMBRA_DO_FRAME =
  "drop-shadow(0 30px 60px rgba(0,0,0,0.55)) drop-shadow(0 10px 22px rgba(0,0,0,0.45))";

// Contorno grosso porque a capa é julgada pequena: na grade do perfil ela chega
// a menos de um terço da largura, e um traço fino some.
const CONTORNO_DO_TEXTO =
  "0 6px 24px rgba(0,0,0,0.75), 0 2px 6px rgba(0,0,0,0.9)";

const CapaTikTokStill: FC<CapaTikTokProps> = ({
  fundo,
  etiqueta,
  selo,
  frameDataUri,
  faixas,
}) => (
  <AbsoluteFill>
    <YoutubeBackground fundo={fundo} />

    {/* A arte, encostada no trilho do chrome e sangrando o quadrado seguro em
        cima e embaixo. Ela vem PRIMEIRO na ordem de pintura: o texto é camada
        por cima, não vizinho de faixa. */}
    <div
      style={{
        position: "absolute",
        left: faixas.frame.x,
        top: faixas.frame.y,
        width: faixas.frame.w,
        height: faixas.frame.h,
        filter: SOMBRA_DO_FRAME,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          // Sem o mesmo recorte do contorno, a imagem escapa pelo chanfro e o
          // canto chanfrado vira um triângulo de vídeo por cima da moldura.
          clipPath: chromeClipPath(
            faixas.frame.w,
            faixas.frame.h,
            OPTS_DO_FRAME,
          ),
          overflow: "hidden",
        }}
      >
        {frameDataUri ? (
          <Img
            src={frameDataUri}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
            }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "rgba(0,0,0,0.45)",
            }}
          />
        )}
      </div>
    </div>
    <SlotBox
      x={faixas.frame.x}
      y={faixas.frame.y}
      w={faixas.frame.w}
      h={faixas.frame.h}
    >
      <CardChrome
        width={faixas.frame.w}
        height={faixas.frame.h}
        opts={OPTS_DO_FRAME}
        outlineScale={0.3}
        showBrackets={false}
      />
    </SlotBox>

    {/* Os véus, entre a arte e o texto. */}
    <SlotBox
      x={faixas.frame.x}
      y={faixas.frame.y}
      w={faixas.frame.w}
      h={faixas.frame.h}
      clip
      opts={OPTS_DO_FRAME}
    >
      <div style={{ position: "absolute", inset: 0 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 520,
            background: VEU_DE_CIMA,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 360,
            background: VEU_DE_BAIXO,
          }}
        />
      </div>
    </SlotBox>

    {/* A etiqueta. Duas linhas no máximo: o backend já cortou o texto para caber,
        e o `clamp` aqui é a rede — um texto inesperado encolhe em vez de
        empurrar o frame para fora do quadrado seguro. */}
    <div
      style={{
        position: "absolute",
        left: faixas.etiqueta.x,
        top: faixas.etiqueta.y,
        width: faixas.etiqueta.w,
        height: faixas.etiqueta.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 900,
          fontSize: etiqueta.length > 18 ? 108 : 136,
          lineHeight: 1.02,
          letterSpacing: "-0.02em",
          color: "#ffffff",
          textShadow: CONTORNO_DO_TEXTO,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}
      >
        {etiqueta}
      </span>
    </div>

    {/* O selo. Discreto de propósito: ele é assinatura, e uma assinatura que
        compete com a etiqueta rouba o pouco de atenção que a grade dá. */}
    <div
      style={{
        position: "absolute",
        left: faixas.selo.x,
        top: faixas.selo.y,
        width: faixas.selo.w,
        height: faixas.selo.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          fontWeight: 700,
          fontSize: 44,
          letterSpacing: "0.08em",
          color: "rgba(255,255,255,0.86)",
          textShadow: CONTORNO_DO_TEXTO,
        }}
      >
        {selo}
      </span>
    </div>

    <StageChrome pad={40} canvasW={CANVAS_W} canvasH={CANVAS_H} />
  </AbsoluteFill>
);

const DEFAULT_PROPS: CapaTikTokProps = {
  fundo: DEFAULT_YOUTUBE_BACKGROUND,
  etiqueta: "O JURO COMPOSTO",
  selo: "@canal",
  frameDataUri: "",
  faixas: {
    etiqueta: { x: 50, y: 450, w: 980, h: 250 },
    frame: { x: 40, y: 335, w: 1000, h: 1250 },
    selo: { x: 50, y: 1386, w: 980, h: 84 },
  },
};

const CapaTikTokRoot: FC = () => (
  <Composition
    id="CapaTikTok"
    component={CapaTikTokStill}
    durationInFrames={1}
    fps={30}
    width={CANVAS_W}
    height={CANVAS_H}
    defaultProps={DEFAULT_PROPS}
  />
);

registerRoot(CapaTikTokRoot);
