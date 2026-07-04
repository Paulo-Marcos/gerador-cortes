import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { normalizarCenaRemotion, ReacaoProps } from "./schema";
import { renderCenaV2 } from "./cenas-v2";

export const CenaReacao: React.FC<ReacaoProps> = ({
  videoUrlFacecam,
  videoUrlTela,
  cenas,
  layoutInicial,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const layouts = {
    split_50_50: {
      facecam: { left: "0%", width: "50%", top: "0%", height: "100%" },
      tela:    { left: "50%", width: "50%", top: "0%", height: "100%" },
    },
    facecam_destaque: {
      facecam: { left: "0%", width: "65%", top: "0%", height: "100%" },
      tela:    { left: "65%", width: "35%", top: "0%", height: "100%" },
    },
    tela_destaque: {
      facecam: { left: "0%", width: "35%", top: "0%", height: "100%" },
      tela:    { left: "35%", width: "65%", top: "0%", height: "100%" },
    },
  };

  const layout = layouts[layoutInicial] || layouts.split_50_50;

  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      {/* FACECAM */}
      <div style={{ position: "absolute", ...layout.facecam, overflow: "hidden" }}>
        <OffthreadVideo
          src={videoUrlFacecam}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* SEPARADOR VERTICAL */}
      <div style={{
        position: "absolute",
        left: layout.tela.left,
        top: "0%", bottom: "0%",
        width: 2,
        backgroundColor: "rgba(255,255,255,0.15)",
        transform: "translateX(-1px)",
        zIndex: 10,
      }} />

      {/* TELA */}
      <div style={{ position: "absolute", ...layout.tela, overflow: "hidden" }}>
        <OffthreadVideo
          src={videoUrlTela}
          style={{ width: "100%", height: "100%", objectFit: "contain", backgroundColor: "black" }}
        />
      </div>

      {/* CENAS DINÂMICAS — Nomenclatura em Português */}
      <AbsoluteFill>
        {cenas.map((cena, index) => {
          const cenaNormalizada = normalizarCenaRemotion(cena);
          const isActive = currentTime >= cenaNormalizada.inicio && currentTime <= cenaNormalizada.fim;
          if (!isActive) return null;
          return <React.Fragment key={index}>{renderCenaV2(cenaNormalizada)}</React.Fragment>;
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
