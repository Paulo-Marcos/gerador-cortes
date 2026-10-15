import { useCallback, type FC } from "react";
import { AbsoluteFill, Img } from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { useEsperarFontes } from "../theme-v2";
import { corpoQueCabe, ENTRELINHA, type Faixa } from "./capa-tiktok-texto";
import {
  COR_DO_ACENTO,
  COR_DO_TEXTO,
  FundoLimpo,
  SOMBRA_DA_JANELA,
} from "./palco-limpo";

/**
 * A capa do TikTok no estilo limpo do palco (D-932).
 *
 * A capa é a vitrine do perfil: se o vídeo sai no palco limpo e a capa no chrome
 * de chanfros e brackets, a grade parece de outro canal. Por isso ela não tem
 * desenho próprio — pega as peças do palco limpo (`palco-limpo.tsx`): o mesmo
 * fundo, a janela de cantos redondos com a mesma sombra, a mesma letra e a cor
 * de acento no selo.
 *
 * A geometria das faixas é a mesma do estilo atual, vinda do backend
 * (`montar_layout`): o recorte da vitrine (D-536) não muda com o estilo.
 */

export type CapaLimpaProps = {
  fundoLimpo?: string;
  etiqueta: string;
  selo: string;
  frameDataUri: string;
  faixas: { etiqueta: Faixa; frame: Faixa; selo: Faixa };
};

// Proporcional ao RAIO_DA_TELA (20 no quadro de 1920 de largura): a arte da capa
// é grande, e o raio do palco nela ficaria quase reto.
const RAIO_DA_ARTE = 32;

// Sombra só para descolar o texto do fundo com grão. Sem o contorno do estilo
// atual: o limpo é justamente não ter traço.
const SOMBRA_DO_TEXTO = "0 4px 18px rgba(0,0,0,0.45)";

const FONTE = "'Inter', 'Segoe UI', sans-serif";

const carregarInter = () =>
  loadInter("normal", { weights: ["700", "800"], subsets: ["latin", "latin-ext"] })
    .waitUntilDone()
    .then(() => undefined);

const caixa = (f: Faixa) =>
  ({
    position: "absolute",
    left: f.x,
    top: f.y,
    width: f.w,
    height: f.h,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
  }) as const;

export const CapaTikTokLimpa: FC<CapaLimpaProps> = ({
  fundoLimpo,
  etiqueta,
  selo,
  frameDataUri,
  faixas,
}) => {
  const carregar = useCallback(carregarInter, []);
  useEsperarFontes("Fonte da capa limpa", carregar);
  const corpo = corpoQueCabe(etiqueta, faixas.etiqueta);

  return (
    <AbsoluteFill>
      <FundoLimpo fundo={fundoLimpo} />

      <div style={{ ...caixa(faixas.frame), filter: SOMBRA_DA_JANELA }}>
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: RAIO_DA_ARTE,
            overflow: "hidden",
            background: "rgba(255,255,255,0.04)",
          }}
        >
          {frameDataUri ? (
            <Img
              src={frameDataUri}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
        </div>
      </div>

      <div style={caixa(faixas.etiqueta)}>
        <span
          style={{
            fontFamily: FONTE,
            fontWeight: 800,
            fontSize: corpo.fontSize,
            lineHeight: ENTRELINHA,
            letterSpacing: "-0.02em",
            color: COR_DO_TEXTO,
            textShadow: SOMBRA_DO_TEXTO,
            display: "-webkit-box",
            WebkitLineClamp: corpo.linhas,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {etiqueta}
        </span>
      </div>

      <div style={caixa(faixas.selo)}>
        <span
          style={{
            fontFamily: FONTE,
            fontWeight: 700,
            fontSize: 44,
            letterSpacing: "0.04em",
            color: COR_DO_ACENTO,
          }}
        >
          {selo}
        </span>
      </div>
    </AbsoluteFill>
  );
};
