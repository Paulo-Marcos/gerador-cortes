import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { COLORS_V2, FONTS_V2 } from "../theme-v2";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadBebasNeue } from "@remotion/google-fonts/BebasNeue";
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadOswald } from "@remotion/google-fonts/Oswald";
import { loadFont as loadPoppins } from "@remotion/google-fonts/Poppins";

// D-462: a legenda queimada do short.
//
// Ela não é acessibilidade — é o conteúdo. 85% das visualizações de short
// acontecem no mudo, então quem não lê, não assiste. Daí cada decisão abaixo
// ter um porquê editorial, não estético:
//
//   - aparece na PRIMEIRA palavra (nada de atraso de 2s: o hook está aí);
//   - 4 a 7 palavras por página, que é o que o olho pega numa sacada;
//   - realce na palavra corrente, para o olho seguir em vez de reler;
//   - dentro da SAFE ZONE — topo e base pertencem à UI dos apps, e legenda
//     debaixo do botão de curtir é legenda que ninguém leu.

// D-563: as fontes que a legenda pode usar, carregadas de uma vez.
//
// O short grava o NOME DA FAMILIA, nao uma chave — a mesma decisao da cor, e
// pelo mesmo motivo: uma chave obrigaria esta lista e a do frontend a
// concordarem sobre o que cada codigo significa, e duas tabelas iguais sempre
// acabam diferentes (D-558). Aqui o nome ja e o valor.
//
// O que esta lista faz, entao, nao e traduzir: e dizer o que esta CARREGADO.
// Uma familia fora dela cai na fonte do canal em vez de virar um render com
// texto invisivel — degradar na leitura, como o `fundo_editorial` aprendeu a
// fazer na D-554.
//
// Espelha `FONTES_DA_LEGENDA` do frontend. Acrescentar la sem acrescentar aqui
// faz a previa mostrar a fonte nova e o arquivo sair com a padrao.
const CARREGADAS: Record<string, string> = Object.fromEntries(
  [loadAnton(), loadBebasNeue(), loadMontserrat(), loadOswald(), loadPoppins()].map(
    (f) => [f.fontFamily, f.fontFamily],
  ),
);

/** Agrupamento em página. 200-500ms = palavra a palavra; 1200ms+ = frase. */
const AGRUPAMENTO_MS = 1200;

/**
 * D-568: a faixa que a legenda ocupa, com margem dos dois lados.
 *
 * Era 84%. No 9:16 o texto colado na borda é o primeiro a ser cortado pela
 * moldura de qualquer player, e a legenda é o conteúdo — 85% assiste no mudo.
 * Espelha `LARGURA_DA_LEGENDA` da `LegendaPrevia.tsx`.
 */
const LARGURA = "80%";

/** Fração da altura ocupada pela UI dos apps, em cima e embaixo. */
const SAFE_ZONE = 0.18;

export interface LegendaShortProps {
  /** Tokens vindos do backend (`services/legendas_short.py`). */
  captions: Caption[];
  /** Sobe a legenda quando há algo desenhado no rodapé (CTA, marca). */
  deslocamentoRodape?: number;
  /**
   * D-563: a cor da palavra CORRENTE, em hex. Vazio = o acento do canal.
   *
   * Só a corrente. O resto da frase fica branco em short praticamente sempre —
   * é o realce que diferencia, e é ele que o operador quer combinar com o
   * palco. Dar cor às duas abriria a porta para uma legenda inteira num tom que
   * some sobre o vídeo, e o contorno preto não salva o que já é escuro.
   */
  cor?: string;
  /** D-563: nome da família da fonte. Vazio (ou não carregada) = a do canal. */
  fonte?: string;
}

export const LegendaShort: React.FC<LegendaShortProps> = ({
  captions,
  deslocamentoRodape = 0,
  cor = "",
  fonte = "",
}) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();
  const agoraMs = (frame / fps) * 1000;

  const { pages } = useMemo(
    () =>
      createTikTokStyleCaptions({
        captions,
        combineTokensWithinMilliseconds: AGRUPAMENTO_MS,
      }),
    [captions],
  );

  const pagina = useMemo(
    () =>
      pages.find(
        (p) => agoraMs >= p.startMs && agoraMs < p.startMs + p.durationMs,
      ),
    [pages, agoraMs],
  );

  if (!pagina) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: height * SAFE_ZONE + deslocamentoRodape,
        width: LARGURA,
        textAlign: "center",
        fontFamily: CARREGADAS[fonte] ?? FONTS_V2.display,
        fontSize: Math.round(height * 0.042),
        fontWeight: 800,
        lineHeight: 1.18,
        letterSpacing: "-0.01em",
        // D-568: palavra longa QUEBRA em vez de furar a caixa. Sem isto ela
        // saía por fora do quadro e aparecia cortada pela borda.
        overflowWrap: "break-word",
        // Contorno em vez de caixa: a caixa esconde o vídeo, e o vídeo é o que
        // segura o dedo. O contorno mantém o contraste sobre qualquer fundo.
        textShadow:
          "0 2px 0 rgba(0,0,0,0.85), 0 -2px 0 rgba(0,0,0,0.85), 2px 0 0 rgba(0,0,0,0.85), -2px 0 0 rgba(0,0,0,0.85), 0 6px 18px rgba(0,0,0,0.55)",
      }}
    >
      {pagina.tokens.map((token, indice) => {
        const corrente = agoraMs >= token.fromMs && agoraMs < token.toMs;
        return (
          <span
            key={`${token.fromMs}-${indice}`}
            style={{
              color: corrente ? cor || COLORS_V2.azulAcento : COLORS_V2.branco,
              whiteSpace: "pre",
            }}
          >
            {token.text}
          </span>
        );
      })}
    </div>
  );
};
