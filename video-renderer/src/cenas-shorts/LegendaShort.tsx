import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import { createTikTokStyleCaptions, type Caption } from "@remotion/captions";
import { COLORS_V2, FONTS_V2 } from "../theme-v2";
import type { LugarDaLegenda } from "./schema";
import { useEsperarFontes } from "../theme-v2";
import {
  fontFamily as familiaAnton,
  loadFont as loadAnton,
} from "@remotion/google-fonts/Anton";
import {
  fontFamily as familiaBebasNeue,
  loadFont as loadBebasNeue,
} from "@remotion/google-fonts/BebasNeue";
import {
  fontFamily as familiaMontserrat,
  loadFont as loadMontserrat,
} from "@remotion/google-fonts/Montserrat";
import {
  fontFamily as familiaOswald,
  loadFont as loadOswald,
} from "@remotion/google-fonts/Oswald";
import {
  fontFamily as familiaPoppins,
  loadFont as loadPoppins,
} from "@remotion/google-fonts/Poppins";

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
//
// D-594: exportada porque o gancho da abertura escolhe do MESMO catálogo — uma
// segunda lista de `loadFont` carregaria as fontes duas vezes e divergiria.
//
// D-642: o nome continua vindo do pacote, mas a chamada de `loadFont` saiu do
// topo do modulo. O `Root.tsx` importa a composicao do short, entao estas cinco
// familias — sem pesos nem subsets declarados, ou seja, TUDO que cada uma tem —
// baixavam junto com qualquer render, inclusive o horizontal, que nunca usa
// nenhuma delas. Agora quem paga e quem renderiza short, via `useFontesDaLegenda`.
export const FONTES_CARREGADAS: Record<string, string> = Object.fromEntries(
  [
    familiaAnton,
    familiaBebasNeue,
    familiaMontserrat,
    familiaOswald,
    familiaPoppins,
  ].map((f) => [f, f]),
);

let downloadDasFontes: Promise<void> | undefined;

/**
 * Baixa o catalogo inteiro da legenda — uma vez por processo.
 *
 * Sao as cinco de uma vez, e nao so a escolhida, porque o gancho pode pedir
 * outra familia que a legenda (D-594): sao duas escolhas independentes dentro
 * do mesmo render, e adivinhar qual par vem no payload custaria mais do que
 * baixar cinco fontes que ja estao no cache do Chrome.
 */
function carregarFontesDaLegenda(): Promise<void> {
  if (!downloadDasFontes) {
    downloadDasFontes = Promise.all(
      [
        loadAnton(),
        loadBebasNeue(),
        loadMontserrat(),
        loadOswald(),
        loadPoppins(),
      ].map((f) => f.waitUntilDone()),
    ).then(() => undefined);
  }
  return downloadDasFontes;
}

/** Segura a foto do short ate o catalogo da legenda estar no DOM. */
export function useFontesDaLegenda(): boolean {
  return useEsperarFontes("Fontes da legenda do short", carregarFontesDaLegenda);
}

/** Agrupamento em página. 200-500ms = palavra a palavra; 1200ms+ = frase. */
const AGRUPAMENTO_MS = 1200;

/**
 * D-568: a faixa que a legenda ocupa, com margem dos dois lados.
 *
 * Era 84%. No 9:16 o texto colado na borda é o primeiro a ser cortado pela
 * moldura de qualquer player, e a legenda é o conteúdo — 85% assiste no mudo.
 *
 * D-605: virou NÚMERO (era `"80%"`) e agora é só o DEFAULT — quem manda a
 * largura do dia é o payload, e uma string com `%` não entraria na mesma conta
 * dos outros dois eixos.
 *
 * Espelha `LARGURA_PADRAO` de `frontend/src/features/shorts/previaLegenda.ts`,
 * que é onde a constante da prévia passou a morar (era `LARGURA_DA_LEGENDA` na
 * `LegendaPrevia.tsx`). O `previaLegenda.test.ts` LÊ este arquivo e compara os
 * dois números — mudar um sozinho derruba o teste.
 */
const LARGURA = 80;

/** Fração da altura ocupada pela UI dos apps, em cima e embaixo. */
const SAFE_ZONE = 0.18;

/**
 * D-605: o lugar de sempre, para quando ninguém decidiu outro.
 *
 * São os três números que estavam cravados neste arquivo — `y` é a BASE em % da
 * altura, e 82 é exatamente o `bottom: height * 0.18` de antes. Ficam aqui como
 * default do componente para que um short gravado antes daquela demanda saia
 * pixel a pixel como saía, mesmo se o payload não trouxer o lugar.
 */
const LUGAR_PADRAO: LugarDaLegenda = { x: 50, y: 100 - SAFE_ZONE * 100, largura: LARGURA };

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
  /**
   * D-605: onde a caixa senta, já com a herança resolvida por quem chama.
   *
   * O relato que originou isto: "a depender do Palco, ela fica em cima da
   * pessoa". Quem decide onde a pessoa aparece no vertical é o arranjo do palco,
   * e um ponto fixo acerta num arranjo e erra no seguinte — dentro do mesmo
   * corte.
   */
  lugar?: LugarDaLegenda;
}

export const LegendaShort: React.FC<LegendaShortProps> = ({
  captions,
  deslocamentoRodape = 0,
  cor = "",
  fonte = "",
  lugar = LUGAR_PADRAO,
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
        // D-605: `x` é o CENTRO da caixa, e `y` é a BASE dela contada do topo —
        // daí o `100 - y` virar o `bottom` que este componente sempre usou. No
        // lugar padrão a conta devolve `height * 0.18`, o valor de antes.
        left: `${lugar.x}%`,
        transform: "translateX(-50%)",
        bottom: height * ((100 - lugar.y) / 100) + deslocamentoRodape,
        width: `${lugar.largura}%`,
        textAlign: "center",
        fontFamily: FONTES_CARREGADAS[fonte] ?? FONTS_V2.display,
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
