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
 * Três faixas empilhadas dentro da faixa central de 1080x1344 — o que sobrevive
 * ao recorte da vitrine do perfil, medido em 3:4 pela D-536.
 *
 * A D-526 pôs o texto POR CIMA da arte para poder dá-la de largura cheia, e a
 * primeira capa real mostrou o custo: a etiqueta caiu sobre o rosto do
 * personagem. A D-531 devolveu cada um à sua faixa — a arte encolhe um pouco e
 * aparece inteira. A D-536 puxou a pilha inteira para dentro do recorte: antes
 * o selo ficava embaixo dele, e a vitrine comia a assinatura do canal.
 *
 * A repetição é o ponto: identidade de grade nasce de layout constante, não de
 * cada capa ser inventiva. O backend manda a geometria pronta
 * (`app/domain/corte/capa_tiktok.py`) pelo mesmo motivo do palco: duas
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

const SOMBRA_DO_FRAME =
  "drop-shadow(0 30px 60px rgba(0,0,0,0.55)) drop-shadow(0 10px 22px rgba(0,0,0,0.45))";

// Contorno grosso porque a capa é julgada pequena: na grade do perfil ela chega
// a menos de um terço da largura, e um traço fino some.
// D-533: quanto uma letra ocupa, em fração do corpo da fonte.
//
// Medido no render real: com Inter Black em caixa alta e letter-spacing -0.02em,
// couberam ~10,5 caracteres numa faixa de 980px a 108px de corpo. A conta serve
// para ESCOLHER o corpo, não para prometer precisão tipográfica — errar para
// menos só deixa sobrar margem.
const LARGURA_MEDIA_DA_LETRA = 0.86;

const ENTRELINHA = 1.02;
const CORPO_MAXIMO = 136;

// A conta resolve o corpo que cabe EXATAMENTE. Sem folga, uma palavra larga —
// "ANTISSISTEMA" — estoura por alguns pixels e o clamp volta a cortar. 6% é
// pouco de corpo e bastante de segurança.
const FOLGA = 0.94;

/**
 * O corpo que faz o texto INTEIRO caber na faixa.
 *
 * Antes o corpo era um degrau fixo (136 ou 108 conforme o comprimento) e a
 * sobra era resolvida por `-webkit-line-clamp: 2`, que corta e escreve "…". O
 * sintoma: "TODO MUNDO ASSINOU EMBAIXO" virava "TODO MUNDO ASSINOU…". Perder a
 * última palavra de um texto que o operador escreveu à mão é pior que qualquer
 * corpo pequeno — e é silencioso, que é o que faz dele um defeito.
 *
 * Agora as duas dimensões da faixa mandam. Para cada número de linhas, o corpo
 * é o menor entre o que cabe na largura e o que cabe na altura; fica o maior
 * dos três.
 */
function corpoQueCabe(
  texto: string,
  faixa: Faixa,
): { fontSize: number; linhas: number } {
  const caracteres = Math.max(texto.length, 1);
  let melhor = { fontSize: 0, linhas: 1 };

  for (const linhas of [1, 2, 3]) {
    const porLargura =
      (linhas * faixa.w) / (LARGURA_MEDIA_DA_LETRA * caracteres);
    const porAltura = faixa.h / (linhas * ENTRELINHA);
    const fontSize = Math.min(porLargura * FOLGA, porAltura, CORPO_MAXIMO);
    if (fontSize > melhor.fontSize) melhor = { fontSize, linhas };
  }
  return melhor;
}

const CONTORNO_DO_TEXTO =
  "0 6px 24px rgba(0,0,0,0.75), 0 2px 6px rgba(0,0,0,0.9)";

const CapaTikTokStill: FC<CapaTikTokProps> = ({
  fundo,
  etiqueta,
  selo,
  frameDataUri,
  faixas,
}) => {
  const corpoDaEtiqueta = corpoQueCabe(etiqueta, faixas.etiqueta);

  return (
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
        {/* D-531: a moldura ganhou corpo. O contorno a 0.3 sumia contra a arte —
          ficava um fio, e a imagem parecia colada no fundo em vez de emoldurada.
          Os brackets nos cantos são os mesmos do palco do vídeo — o que faz a
          capa e o corte parecerem do mesmo canal —, mas em escala reduzida: no
          tamanho do palco eles gritavam mais que a ilustração, e a moldura não
          é o assunto. */}
        <CardChrome
          width={faixas.frame.w}
          height={faixas.frame.h}
          opts={OPTS_DO_FRAME}
          outlineScale={0.6}
          bracketScale={0.22}
          showBrackets
        />
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
            fontSize: corpoDaEtiqueta.fontSize,
            lineHeight: ENTRELINHA,
            letterSpacing: "-0.02em",
            color: "#ffffff",
            textShadow: CONTORNO_DO_TEXTO,
            display: "-webkit-box",
            // O clamp continua como rede, mas no numero de linhas que o corpo ja
            // garante caber — assim ele nunca corta no caminho normal.
            WebkitLineClamp: corpoDaEtiqueta.linhas,
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
};

const DEFAULT_PROPS: CapaTikTokProps = {
  fundo: DEFAULT_YOUTUBE_BACKGROUND,
  etiqueta: "O JURO COMPOSTO",
  selo: "@canal",
  frameDataUri: "",
  faixas: {
    etiqueta: { x: 50, y: 288, w: 980, h: 200 },
    frame: { x: 130, y: 512, w: 819, h: 1024 },
    selo: { x: 50, y: 1560, w: 980, h: 72 },
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
