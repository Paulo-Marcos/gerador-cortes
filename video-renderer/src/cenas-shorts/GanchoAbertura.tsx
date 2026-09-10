import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { SAFE_ZONE } from "./_shared";

// D-565: o título-gancho da abertura.
//
// Nos primeiros três segundos o espectador decide ficar ou passar, e mais de
// 60% assiste sem som — então quem faz o gancho chegar é o TEXTO, não a fala.
//
// ## Por que não é o `CenaHook`
//
// O desenho é primo, mas o papel é outro, e o `CenaHook` foi desligado junto
// com as demais cenas (D-560) justamente por ser texto no MEIO do short, por
// cima de uma fala que a legenda já estava escrevendo. Este componente tem um
// caminho de dados próprio (`gancho`, não `cenas`) para que religar um nunca
// mexa no outro.
//
// ## Por que ancorado no topo, e por que o véu é só de cima
//
// O gancho e a legenda coexistem: ele no terço superior, ela no rodapé, cada um
// dentro da sua safe zone. É por isso que o véu NÃO é de quadro cheio como o
// das cenas — escurecer a tela inteira por 2,5s enquanto a legenda também está
// lá transformaria a coexistência em poluição, e o vídeo é o que segura o dedo.

/** Frames de entrada e de saída. Curto: o gancho tem 2,5s de vida inteira. */
const FRAMES_ENTRADA = 7;
const FRAMES_SAIDA = 9;

export interface GanchoAberturaProps {
  texto: string;
  /** Segundo em que o gancho sai de cena. */
  ateSeg: number;
}

export const GanchoAbertura: React.FC<GanchoAberturaProps> = ({ texto, ateSeg }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const fim = Math.max(1, Math.round(ateSeg * fps));

  const entrada = interpolate(frame, [0, FRAMES_ENTRADA], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const saida = interpolate(frame, [fim - FRAMES_SAIDA, fim], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(entrada, saida);

  if (frame >= fim) return null;

  // Sobe ao entrar — movimento na direção da leitura, que o olho segue sem
  // esforço. Curto: 22px em 7 frames é percebido como firmeza, não animação.
  const subida = interpolate(entrada, [0, 1], [22, 0]);

  return (
    <>
      {/* Véu SÓ no topo, atrás do texto. Um degradê que morre antes da metade
          do quadro deixa o vídeo intacto onde ele importa — e não disputa
          contraste com a legenda, que tem o contorno dela. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: "46%",
          opacity,
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.45) 55%, rgba(0,0,0,0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: height * SAFE_ZONE,
          left: "7%",
          right: "7%",
          opacity,
          textAlign: "center",
          transform: `translateY(${subida}px)`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: F.display,
            // Menor que o do `CenaHook` (0.062): lá o texto ERA o conteúdo com
            // o quadro parado atrás; aqui ele divide a tela com o vídeo tocando
            // e com a legenda embaixo.
            fontSize: Math.round(height * 0.05),
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: C.branco,
            textShadow: "0 6px 28px rgba(0,0,0,0.7)",
          }}
        >
          {texto}
        </p>
      </div>
    </>
  );
};
