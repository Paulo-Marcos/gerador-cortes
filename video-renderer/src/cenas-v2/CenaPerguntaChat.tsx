import { useState } from "react";
import { AbsoluteFill, Img, useVideoConfig } from "remotion";
import { CenaRemotion } from "../schema";
import { COLORS_V2 as C, FONTS_V2 as F, comAlfa } from "../theme-v2";
import { useGlobalFrame } from "../frame-context";
import { AutoFitText, useCardLayout, useFades, useSombra } from "./_shared";

interface Props {
  cena: CenaRemotion;
}

interface Medidas {
  top: number | string;
  left: number | string;
  largura: number;
  avatar: number;
  nome: number;
  texto: number;
  alturaDoTexto: number;
  rotulo: number;
  padding: number;
}

// D-910: o horizontal ocupa o canto do vídeo cheio; o vertical cabe na zona de
// card do palco compartilhado (SOURCE_BY_TYPE em shared-card-zone.tsx).
const MEDIDAS: Record<"horizontal" | "vertical", Medidas> = {
  horizontal: {
    top: "14%",
    left: "4%",
    largura: 900,
    avatar: 84,
    nome: 30,
    texto: 40,
    alturaDoTexto: 230,
    rotulo: 20,
    padding: 36,
  },
  vertical: {
    top: 112,
    left: 92,
    largura: 520,
    avatar: 72,
    nome: 26,
    texto: 34,
    alturaDoTexto: 300,
    rotulo: 18,
    padding: 30,
  },
};

/**
 * A pergunta do chat que o apresentador responde, como ela apareceu no chat ao
 * vivo do YouTube: avatar redondo, nome em destaque e a mensagem literal logo
 * abaixo (D-910). Não é card editorial com aspas — é a mensagem de quem
 * perguntou, com o tema do canal para não destoar do resto do corte.
 */
export const CenaPerguntaChat: React.FC<Props> = ({ cena }) => {
  const frame = useGlobalFrame();
  const { fps } = useVideoConfig();
  const frameLocal = frame - cena.inicio * fps;
  const duracao = (cena.fim - cena.inicio) * fps;
  const { opacity, translateY, reveal } = useFades({ frameLocal, fps, duracao });
  const sombra = useSombra(cena);
  const m = MEDIDAS[useCardLayout(cena)];

  return (
    <AbsoluteFill style={{ opacity, pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: m.top,
          left: m.left,
          width: m.largura,
          boxSizing: "border-box",
          padding: m.padding,
          borderRadius: 24,
          background: comAlfa(C.fundoPalco, Math.max(0.78, sombra.cardOpacity)),
          border: `2px solid ${C.linhaGhost}`,
          boxShadow: "0 18px 48px rgba(0,0,0,0.7)",
          // A mensagem sobe como chega no chat: de baixo, assentando no lugar.
          transform: `translateY(${translateY * 2}px)`,
        }}
      >
        <Rotulo tamanho={m.rotulo} reveal={reveal} />
        <div style={{ display: "flex", gap: m.padding * 0.6, alignItems: "flex-start" }}>
          <Avatar url={cena.avatar_url} autor={cena.autor ?? ""} tamanho={m.avatar} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: F.display,
                fontWeight: 700,
                fontSize: m.nome,
                lineHeight: 1.2,
                color: C.azulAcento,
                marginBottom: 8,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {cena.autor || "Chat ao vivo"}
            </div>
            <AutoFitText maxHeight={m.alturaDoTexto} minScale={0.5}>
              <div
                style={{
                  fontFamily: F.display,
                  fontWeight: 500,
                  fontSize: `calc(${m.texto}px * var(--font-scale, 1))`,
                  lineHeight: 1.3,
                  color: C.branco,
                  // Texto literal: quebra onde couber, inclusive em link ou @menção longa.
                  overflowWrap: "anywhere",
                  whiteSpace: "pre-wrap",
                }}
              >
                {cena.texto}
              </div>
            </AutoFitText>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Rotulo: React.FC<{ tamanho: number; reveal: number }> = ({ tamanho, reveal }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 10,
      marginBottom: tamanho,
      fontFamily: F.mono,
      fontSize: tamanho,
      letterSpacing: 3,
      color: comAlfa(C.azulAcento, 0.8),
      opacity: reveal,
    }}
  >
    <BalaoIcon size={tamanho * 1.3} />
    PERGUNTA DO CHAT
  </div>
);

const Avatar: React.FC<{ url?: string; autor: string; tamanho: number }> = ({
  url,
  autor,
  tamanho,
}) => {
  // Arquivo que sumiu (limpeza da mídia) não derruba o render: vira a inicial.
  const [falhou, setFalhou] = useState(false);
  const circulo: React.CSSProperties = {
    width: tamanho,
    height: tamanho,
    flexShrink: 0,
    borderRadius: "50%",
    overflow: "hidden",
  };
  if (url && !falhou) {
    return (
      <Img
        src={url}
        maxRetries={1}
        onError={() => setFalhou(true)}
        style={{ ...circulo, objectFit: "cover" }}
      />
    );
  }
  return (
    <div
      style={{
        ...circulo,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: C.verdeMoldura,
        color: C.fundoPalco,
        fontFamily: F.display,
        fontWeight: 700,
        fontSize: tamanho * 0.48,
      }}
    >
      {inicialDoAutor(autor)}
    </div>
  );
};

/** A primeira letra do nome, sem o "@" do handle do YouTube. */
export function inicialDoAutor(autor: string): string {
  const letra = autor.replace(/^@/, "").trim().charAt(0);
  return letra ? letra.toUpperCase() : "?";
}

const BalaoIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor">
    <path d="M4 4h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
  </svg>
);
