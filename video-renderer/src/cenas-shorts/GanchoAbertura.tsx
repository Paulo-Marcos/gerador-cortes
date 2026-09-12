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
//
// ## D-581: por que ele deixou de ser sempre branco
//
// Porque a coexistência estava saindo pela culatra. Gancho branco e legenda
// branca, no mesmo quadro, ao mesmo tempo, com o mesmo peso e a mesma sombra:
// nada dizia ao olho qual dos dois é a promessa e qual é a fala. O relato do
// operador foi exatamente esse — "dá conflito".
//
// A saída não é mexer no lugar de nenhum dos dois (a safe zone já separa em
// cima e embaixo), e sim dar ao gancho uma IDENTIDADE VISUAL própria: uma cor
// que só ele tem, e um realce que o separa do vídeo de um jeito diferente do
// contorno da legenda. Quem escolhe é o operador, porque quem olha o trecho é
// ele — o que o código garante é que a prévia mostre a mesma coisa.

/** Frames de entrada e de saída. Curto: o gancho tem 2,5s de vida inteira. */
const FRAMES_ENTRADA = 7;
const FRAMES_SAIDA = 9;

/** Espelha `REALCES` em `backend/app/domain/gancho_short.py`. */
export type RealceDoGancho = "veu" | "caixa" | "contorno" | "sombra" | "nenhum";

export interface GanchoAberturaProps {
  texto: string;
  /** Segundo em que o gancho sai de cena. */
  ateSeg: number;
  /** Hex da cor do texto. "" = o branco de sempre. */
  cor?: string;
  /** Como o gancho se separa do fundo. "" = o véu, que é o padrão. */
  realce?: RealceDoGancho | string;
}

export const GanchoAbertura: React.FC<GanchoAberturaProps> = ({
  texto,
  ateSeg,
  cor = "",
  realce = "veu",
}) => {
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

  // O corpo sai da ALTURA do quadro. Menor que o do `CenaHook` (0.062): lá o
  // texto ERA o conteúdo com o quadro parado atrás; aqui ele divide a tela com
  // o vídeo tocando e com a legenda embaixo.
  const corpo = Math.round(height * 0.05);
  const estilo = estiloDoRealce(realce, corpo);

  return (
    <>
      {/* O véu é o único realce que vive FORA da caixa do texto: ele escurece
          uma faixa do quadro, e não o retângulo da frase. Os outros três agem
          sobre as letras, então viajam no `style` do parágrafo. */}
      {estilo.veu ? (
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
      ) : null}
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
            fontSize: corpo,
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            color: cor || C.branco,
            ...estilo.texto,
          }}
        >
          {texto}
        </p>
      </div>
    </>
  );
};

interface EstiloDoRealce {
  /** O degradê de topo entra? Só o `veu` o usa. */
  veu: boolean;
  /** O que se aplica ao parágrafo — sombra, contorno ou caixa. */
  texto: React.CSSProperties;
}

/**
 * O realce traduzido em CSS — a MESMA tabela que a prévia do navegador aplica.
 *
 * Exportada porque `GanchoPrevia.tsx` do frontend a espelha campo a campo: os
 * dois projetos não compartilham módulo (mesma situação da `LegendaShort`), e o
 * que impede a divergência é o espelho ser declarado e pequeno o bastante para
 * caber numa leitura.
 *
 * Realce desconhecido cai no véu em silêncio. O backend já normaliza, mas um
 * props.json antigo não pode custar o render do short inteiro.
 */
export function estiloDoRealce(realce: string, corpo: number): EstiloDoRealce {
  // A espessura sai do CORPO, e não de pixels fixos: o gancho é desenhado tanto
  // num quadro de 1920 de altura (render) quanto numa prévia de 300px, e um
  // contorno de 6px é halo num e mancha no outro.
  const traco = Math.max(2, Math.round(corpo * 0.055));

  switch (realce) {
    case "caixa":
      // A mais legível sobre imagem suja — e a que mais come vídeo. Por isso é
      // escolha, e não padrão: quem tem um quadro limpo não deve pagar por ela.
      return {
        veu: false,
        texto: {
          backgroundColor: "rgba(0,0,0,0.78)",
          // O padding e o `box-decoration-break` fazem a caixa abraçar CADA
          // linha em vez de virar um retângulo único com buracos nas pontas —
          // é o que dá o desenho de etiqueta em vez de bloco.
          padding: `${Math.round(corpo * 0.16)}px ${Math.round(corpo * 0.3)}px`,
          borderRadius: Math.round(corpo * 0.16),
          boxDecorationBreak: "clone",
          WebkitBoxDecorationBreak: "clone",
          display: "inline",
        },
      };

    case "contorno":
      // A mais confiável quando o fundo muda ao longo do trecho: o halo separa
      // as letras de qualquer coisa que passe atrás.
      return {
        veu: false,
        texto: {
          WebkitTextStroke: `${traco}px rgba(0,0,0,0.92)`,
          // `paint-order` desenha o traço ANTES do preenchimento; sem ele o
          // contorno come metade da espessura da letra por dentro e o texto
          // afina — visível justamente nas fontes pesadas que o formato pede.
          paintOrder: "stroke fill",
          textShadow: "0 4px 16px rgba(0,0,0,0.5)",
        },
      };

    case "sombra":
      // A mais discreta. Para imagem limpa, onde o véu já seria demais.
      return {
        veu: false,
        texto: { textShadow: "0 6px 28px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.7)" },
      };

    case "nenhum":
      // Existe para quem escolheu uma COR forte: amarelo sobre vídeo escuro já
      // se separa sozinho, e qualquer reforço vira excesso.
      return { veu: false, texto: {} };

    default:
      return {
        veu: true,
        texto: { textShadow: "0 6px 28px rgba(0,0,0,0.7)" },
      };
  }
}
