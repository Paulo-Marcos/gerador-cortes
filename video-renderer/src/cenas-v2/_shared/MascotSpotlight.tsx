import type React from "react";
import { Mascote } from "../../Mascote";

type MascotMood = React.ComponentProps<typeof Mascote>["mood"];
type MascotTamanho = React.ComponentProps<typeof Mascote>["tamanho"];

interface Props {
  mood?: MascotMood;
  tamanho?: MascotTamanho;
  size?: number;
  style?: React.CSSProperties;
}

export const MascotSpotlight: React.FC<Props> = ({
  mood = "pensativo",
  tamanho = "pequeno",
  size = 200,
  style,
}) => {
  // Mascote DESABILITADO por padrao (D-179): so habilita quando o flag === 'true'.
  // Repo publico nasce sem mascote; o canal liga com VITE_CANAL_MASCOTE_HABILITADO=true.
  // tsconfig uses module:commonjs for type-check only; Vite handles import.meta at build time
  // @ts-ignore
  const mascoteHabilitado = import.meta.env.VITE_CANAL_MASCOTE_HABILITADO === 'true';
  if (!mascoteHabilitado) return null;
  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        pointerEvents: "none",
        ...style,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -Math.round(size * 0.14),
          background: `radial-gradient(circle at 50% 50%,
          rgba(155, 207, 227, 0.38) 0%,
          rgba(155, 207, 227, 0.22) 28%,
          rgba(155, 207, 227, 0.10) 50%,
          transparent 72%)`,
          filter: "blur(2px)",
        }}
      />
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          filter:
            "drop-shadow(0 0 10px rgba(155,207,227,0.45)) drop-shadow(0 4px 10px rgba(0,0,0,0.5))",
        }}
      >
        <Mascote mood={mood} tamanho={tamanho} />
      </div>
    </div>
  );
};
