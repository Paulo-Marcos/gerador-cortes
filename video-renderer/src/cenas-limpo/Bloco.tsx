import { useCallback, type CSSProperties, type FC, type ReactNode } from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fontFamily as familiaInter, loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { useEsperarFontes } from "../theme-v2";
import { COR_DO_ACENTO, COR_DO_TEXTO } from "../youtube-bg/palco-limpo";

/**
 * D-916: o Bloco — a peça única das cenas no estilo limpo (canvas "Catálogo A").
 *
 * Um traço de 6 px, um kicker em caixa alta no acento, o título, o corpo e um
 * rodapé, nessa ordem; nada de caixa, borda ou HUD. "Se não é vídeo nem texto,
 * não existe." Cada cena compõe o Bloco com os campos que tem.
 */
export const TIPO = {
  kicker: { fontSize: 20, fontWeight: 800, letterSpacing: 4 },
  titulo: { fontSize: 38, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em" },
  corpo: { fontSize: 24, fontWeight: 500, lineHeight: 1.4 },
  rodape: { fontSize: 18, fontWeight: 500 },
} as const;

/** Giz a 85% (corpo), 55% (rodapé) e 35% (o lado B do comparativo). */
export const GIZ_85 = "rgba(243,242,238,0.85)";
export const GIZ_55 = "rgba(243,242,238,0.55)";
export const GIZ_35 = "rgba(243,242,238,0.35)";

/** Largura da coluna das cenas (o catálogo inteiro é desenhado nela). */
export const COLUNA = 440;

const carregarInter = () =>
  loadInter("normal", { weights: ["500", "600", "700", "800"], subsets: ["latin", "latin-ext"] })
    .waitUntilDone()
    .then(() => undefined);

/** A fonte do limpo (Inter, a mesma do palco), esperada antes de a foto sair. */
export function useFonteDoLimpo(): string {
  const carregar = useCallback(carregarInter, []);
  useEsperarFontes("Fonte das cenas no estilo limpo", carregar);
  return familiaInter;
}

/** Entra de baixo (10 px) em 6 quadros e sai em 6, como o sistema do limpo pede. */
export function useEntrada(duracaoSeg: number): CSSProperties {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fim = Math.max(12, Math.round(duracaoSeg * fps));
  const entrada = interpolate(frame, [0, 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const saida = interpolate(frame, [fim - 6, fim], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return { opacity: Math.min(entrada, saida), transform: `translateY(${(1 - entrada) * 10}px)` };
}

export const Traco: FC<{ cor?: string; espessura?: number }> = ({ cor = COR_DO_ACENTO, espessura = 6 }) => (
  <div style={{ width: espessura, borderRadius: espessura / 2, background: cor, alignSelf: "stretch", flex: "0 0 auto" }} />
);

export const Kicker: FC<{ children: ReactNode; cor?: string }> = ({ children, cor = COR_DO_ACENTO }) => (
  <div style={{ ...TIPO.kicker, color: cor, textTransform: "uppercase" }}>{children}</div>
);

export interface BlocoProps {
  kicker?: ReactNode;
  titulo?: ReactNode;
  corpo?: ReactNode;
  rodape?: ReactNode;
  /** O que vem antes do kicker (retrato da ficha) ou no lugar do título (número). */
  antes?: ReactNode;
  depois?: ReactNode;
  corDoTraco?: string;
  corDoKicker?: string;
  tituloStyle?: CSSProperties;
  largura?: number;
  gap?: number;
}

export const Bloco: FC<BlocoProps> = ({
  kicker,
  titulo,
  corpo,
  rodape,
  antes,
  depois,
  corDoTraco,
  corDoKicker,
  tituloStyle,
  largura = COLUNA,
  gap = 16,
}) => (
  <div style={{ display: "flex", gap: 28, width: largura, color: COR_DO_TEXTO }}>
    <Traco cor={corDoTraco} />
    <div style={{ display: "flex", flexDirection: "column", gap, minWidth: 0, flex: "1 1 auto" }}>
      {antes}
      {kicker ? <Kicker cor={corDoKicker}>{kicker}</Kicker> : null}
      {titulo ? <div style={{ ...TIPO.titulo, overflowWrap: "break-word", ...tituloStyle }}>{titulo}</div> : null}
      {corpo ? <div style={{ ...TIPO.corpo, color: GIZ_85, overflowWrap: "break-word" }}>{corpo}</div> : null}
      {rodape ? <div style={{ ...TIPO.rodape, color: GIZ_55 }}>{rodape}</div> : null}
      {depois}
    </div>
  </div>
);
