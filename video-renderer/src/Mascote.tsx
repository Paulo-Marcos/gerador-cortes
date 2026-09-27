import { Img, interpolate, random, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { mascoteHabilitado } from "./mascote-habilitado";
import { SHADOWS_V2, Z_V2 } from "./theme-v2";

type Mood =
  | "pensativo" | "serio" | "animado" | "investigador" | "apresentador"
  | "apontando" | "professor" | "narrador"
  | "surpreso" | "cetico" | "duvida"
  | "lendo" | "filosofando" | "balanca"
  | "concordando" | "enfatico" | "convidativo"
  | "none";
type Posicao = "tl" | "tr" | "bl" | "br" | "center";
type Tamanho = "mini" | "pequeno" | "medio" | "grande" | "extraGrande";
type Direcao = "x" | "y";

interface Props {
  mood: Mood | string;
  /** Tamanho semântico — controla a "presença" do mascote. */
  tamanho?: Tamanho;
  /** Atraso de entrada em frames. Default 8. */
  delayFrames?: number;
  /** Espelha horizontalmente (mascote "olhando" para o conteúdo). */
  espelhar?: boolean;

  /**
   * Modo de posicionamento:
   * - "ancora" (default): renderiza inline (position: relative). O pai posiciona via flex/grid.
   *   USE ESSE MODO quando o mascote estiver ao lado de um card/texto, formando um cluster visual.
   * - "tela": renderiza como overlay absoluto na tela inteira (legado / casos especiais).
   */
  modo?: "ancora" | "tela";

  /** Apenas quando modo="tela". */
  posicao?: Posicao;

  /** Direção da animação de entrada. Default: "y" para tela, "x" para ancora. */
  direcaoEntrada?: Direcao;
}

// Mapeamento mood → arquivo PNG em public/mascote/ (E-011).
// D-636: cada pose é servida pelo nome canônico `<pose>.png`. PNGs do canal com o
// prefixo legado (`sapo_<pose>.png`) ganham essa cópia na materialização.
// Os 5 primeiros já existem; os 12 restantes só renderizam quando o PNG
// correspondente for adicionado à pasta (catálogo completo em pose-catalog.ts).
// D-733: os números da animação, com nome. Valores de sempre — mudar qualquer
// um muda o vídeo, e o teste de contratos dos cards compara os quadros.
const MOLA_DA_ENTRADA = { damping: 14, stiffness: 100 };
/** Quanto o mascote percorre ao entrar: pouco quando ancorado no card, mais solto na tela. */
const DISTANCIA_DA_ENTRADA_PX = { ancora: 30, tela: 60 } as const;
/** Respiração: escala oscila ±2,5% num ciclo de 3 s. */
const RESPIRACAO = { periodoSeg: 3, amplitude: 0.025 };
/** Balanço vertical: ±2 px num ciclo de 1,5 s. */
const BALANCO = { periodoSeg: 1.5, amplitudePx: 2 };
/** Piscada: uma a cada 5 s, com atraso sorteado de até 2 s, 5 quadros, fecha 15%. */
const PISCADA = { intervaloSeg: 5, atrasoMaxSeg: 2, duracaoFrames: 5, fechamento: 0.15 };

const MOOD_TO_FILE: Record<string, string> = {
  // existentes
  pensativo: "pensativo.png",
  serio: "serio.png",
  animado: "animado.png",
  investigador: "investigador.png",
  apresentador: "apresentador.png",
  // apresentando
  apontando: "apontando.png",
  professor: "professor.png",
  narrador: "narrador.png",
  // reagindo
  surpreso: "surpreso.png",
  cetico: "cetico.png",
  duvida: "duvida.png",
  // editorial
  lendo: "lendo.png",
  filosofando: "filosofando.png",
  balanca: "balanca.png",
  // energia
  concordando: "concordando.png",
  enfatico: "enfatico.png",
  convidativo: "convidativo.png",
};

const TAMANHO_PX: Record<Tamanho, number> = {
  mini: 140,
  pequeno: 200,
  medio: 280,
  grande: 400,
  extraGrande: 600,
};

const POSICAO_TELA: Record<Posicao, React.CSSProperties & { entrySign: 1 | -1 }> = {
  tl: { top: 24, left: 24, entrySign: -1 },
  tr: { top: 24, right: 24, entrySign: -1 },
  bl: { bottom: 24, left: 24, entrySign: 1 },
  br: { bottom: 24, right: 24, entrySign: 1 },
  center: { top: "50%", left: "50%", entrySign: 1 },
};

/**
 * Mascote do canal.
 *
 * Por padrão (modo="ancora"), renderiza inline para que o pai posicione via flex/grid —
 * isso mantém o mascote VISUALMENTE ANCORADO ao card/texto que está acompanhando, em vez
 * de ficar flutuando solto num canto da tela.
 *
 * Animações constantes:
 * - Spring entry (com delay configurável)
 * - Respiração (scale 1↔1.025, ciclo ~3s)
 * - Bob vertical sutil (~2px)
 * - Piscada randomizada (~5 frames a cada ~5s)
 */
export const Mascote: React.FC<Props> = ({
  mood,
  tamanho = "grande",
  delayFrames = 8,
  espelhar = false,
  modo = "ancora",
  posicao = "tl",
  direcaoEntrada,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (mood === "none" || !MOOD_TO_FILE[mood]) return null;

  // D-197/D-280: canal sem mascote (repo público nasce sem public/mascote) não
  // renderiza nada — sem este gate, o 404 do staticFile derruba o render das
  // cenas que usam Mascote direto (sem passar pelo MascotSpotlight).
  if (!mascoteHabilitado()) return null;

  const file = MOOD_TO_FILE[mood];
  const sizePx = TAMANHO_PX[tamanho];
  const delayed = Math.max(0, frame - delayFrames);

  const entrySpring = spring({
    frame: delayed,
    fps,
    config: MOLA_DA_ENTRADA,
  });

  // Direção da entrada
  const eixo: Direcao = direcaoEntrada ?? (modo === "ancora" ? "x" : "y");
  const entrySign = modo === "tela" ? POSICAO_TELA[posicao].entrySign : 1;
  const entryDistance = DISTANCIA_DA_ENTRADA_PX[modo] * entrySign;
  const translateY = eixo === "y" ? interpolate(entrySpring, [0, 1], [entryDistance, 0]) : 0;
  const translateX = eixo === "x" ? interpolate(entrySpring, [0, 1], [entryDistance, 0]) : 0;
  const opacity = interpolate(entrySpring, [0, 1], [0, 1]);

  // Respiração
  const breathPhase = (frame % Math.round(fps * RESPIRACAO.periodoSeg)) / (fps * RESPIRACAO.periodoSeg);
  const breath = 1 + Math.sin(breathPhase * Math.PI * 2) * RESPIRACAO.amplitude;

  // Bob
  const bobPhase = (frame % Math.round(fps * BALANCO.periodoSeg)) / (fps * BALANCO.periodoSeg);
  const bob = Math.sin(bobPhase * Math.PI * 2) * BALANCO.amplitudePx;

  // Piscada
  const blinkSeed = Math.floor(frame / Math.round(fps * PISCADA.intervaloSeg));
  const blinkOffset = Math.round(random(`sapo-blink-${blinkSeed}`) * fps * PISCADA.atrasoMaxSeg);
  const blinkFrame = blinkSeed * Math.round(fps * PISCADA.intervaloSeg) + blinkOffset;
  const framesIntoBlink = frame - blinkFrame;
  const isBlinking = framesIntoBlink >= 0 && framesIntoBlink < PISCADA.duracaoFrames;
  const blinkScaleY = isBlinking
    ? 1 - Math.sin((framesIntoBlink / PISCADA.duracaoFrames) * Math.PI) * PISCADA.fechamento
    : 1;

  // Cache-bust: PNGs do mascote foram substituídos pela versão final. Sem o
  // ?v=2 o Vite/browser continua servindo a versão antiga em cache.
  // Bump este número se trocar de novo.
  const innerImg = (
    <Img
      src={`${staticFile(`/mascote/${file}`)}?v=2`}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "contain",
        transform: `scaleX(${espelhar ? -1 : 1}) scaleY(${blinkScaleY})`,
        transformOrigin: "center",
      }}
    />
  );

  // ─── Modo ANCORA: renderiza inline (pai posiciona via flex) ──────────────
  if (modo === "ancora") {
    return (
      <div
        style={{
          position: "relative",
          paddingLeft: espelhar ? 0 : 12,
          width: sizePx,
          height: sizePx,
          flexShrink: 0,
          opacity,
          transform: `translate(${translateX}px, ${translateY + bob}px) scale(${breath})`,
          filter: SHADOWS_V2.mascote,
          pointerEvents: "none",
          zIndex: Z_V2.mascote,
        }}
      >
        {innerImg}
      </div>
    );
  }

  // ─── Modo TELA: overlay absoluto (legado) ────────────────────────────────
  const posStyle = POSICAO_TELA[posicao];
  const centerOffset = posicao === "center" ? "-50%, -50%" : "0, 0";

  return (
    <div
      style={{
        position: "absolute",
        top: posStyle.top,
        bottom: posStyle.bottom,
        left: posStyle.left,
        right: posStyle.right,
        width: sizePx,
        height: sizePx,
        opacity,
        transform: `translate(${centerOffset}) translate(${translateX}px, ${translateY + bob}px) scale(${breath})`,
        zIndex: posicao === "center" ? Z_V2.cta : Z_V2.mascote,
        filter: SHADOWS_V2.mascote,
        pointerEvents: "none",
      }}
    >
      {innerImg}
    </div>
  );
};
