import React from "react";
import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { COLORS_V2 as C, FONTS_V2 as F } from "../theme-v2";
import { SAFE_ZONE } from "./_shared";
import { FONTES_CARREGADAS } from "./LegendaShort";

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

// D-600: o lugar de sempre, agora com nome. Estes três números estavam
// escritos direto no `style` — `top: height * SAFE_ZONE`, `left: 7%`,
// `right: 7%` — e continuam sendo o default exato, para um props.json gravado
// antes desta demanda sair pixel a pixel como saía. Espelham
// `POSICAO_X_PADRAO`, `POSICAO_Y_PADRAO` e `LARGURA_PADRAO` do domínio.
const X_PADRAO = 50;
const Y_PADRAO = SAFE_ZONE * 100;
const LARGURA_PADRAO = 86;

/** Frames de entrada e de saída. Curto: o gancho tem 2,5s de vida inteira. */
const FRAMES_ENTRADA = 7;
const FRAMES_SAIDA = 9;

/** Espelha `REALCES` em `backend/app/domain/short/gancho_short.py`. */
export type RealceDoGancho = "veu" | "caixa" | "contorno" | "sombra" | "nenhum";

export interface GanchoAberturaProps {
  texto: string;
  /** Segundo em que o gancho sai de cena. */
  ateSeg: number;
  /** Hex da cor do texto. "" = o branco de sempre. */
  cor?: string;
  /** Como o gancho se separa do fundo. "" = o véu, que é o padrão. */
  realce?: RealceDoGancho | string;
  /** D-594: família da fonte. "" (ou não carregada) = a display do canal. */
  fonte?: string;
  /** D-594: escala do corpo sobre 5% da altura. O backend já trava a faixa. */
  tamanho?: number;
  /** D-600: centro horizontal da caixa, em % da largura. */
  x?: number;
  /** D-600: topo da caixa, em % da altura. */
  y?: number;
  /** D-600: largura da caixa, em % da largura do quadro. */
  largura?: number;
}

export const GanchoAbertura: React.FC<GanchoAberturaProps> = ({
  texto,
  ateSeg,
  cor = "",
  realce = "veu",
  fonte = "",
  tamanho = 1,
  // D-600: os defaults sao os numeros que estavam cravados neste componente ate
  // esta demanda. Um props.json gravado antes dela nao traz os campos, e sai
  // pixel a pixel como saia — o mesmo contrato de degradacao do `realce`.
  x = X_PADRAO,
  y = Y_PADRAO,
  largura = LARGURA_PADRAO,
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
  const corpo = Math.round(height * 0.05 * (tamanho > 0 ? tamanho : 1));
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
            // D-600: o veu VIAJA com o gancho. Ele nunca foi "escurecer o topo"
            // — e escurecer o fundo de onde a frase esta; o topo era so onde a
            // frase sempre estava. Com o gancho no rodape, um veu preso em cima
            // escureceria o lugar errado e deixaria a frase sobre video cru.
            //
            // Os 18 pontos de folga acima dao a faixa o mesmo desenho de sempre
            // quando o gancho esta no lugar de sempre: com y = 18, isto e
            // exatamente `top: 0; height: 46%`, o valor que estava aqui.
            top: `${Math.max(0, y - Y_PADRAO)}%`,
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
          // D-600: o lugar deixou de ser lei do codigo. `x` e o CENTRO da caixa
          // (o texto e centralizado e cresce para os dois lados) e `y` e o TOPO
          // dela (o texto cresce para baixo ao virar tres linhas) — ancorar de
          // outro jeito faria a frase escorregar a cada palavra digitada.
          top: `${y}%`,
          left: `${x}%`,
          width: `${largura}%`,
          opacity,
          textAlign: "center",
          transform: `translate(-50%, ${subida}px)`,
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: FONTES_CARREGADAS[fonte] ?? F.display,
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
