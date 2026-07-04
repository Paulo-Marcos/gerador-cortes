import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import { z } from "zod";
import { COLORS_V2 as C, FONTS_V2 as F } from "./theme-v2";
import { FrameOffsetContext } from "./frame-context";
import { renderCenaV2 } from "./cenas-v2";
import type { CenaRemotion } from "./schema";

export const previewCenasV2Schema = z.object({
  segundosPorCena: z.number().default(4),
});

export type PreviewCenasV2Props = z.infer<typeof previewCenasV2Schema>;

interface CenaPreview {
  rotulo: string;
  cena: CenaRemotion;
}

const CENAS: CenaPreview[] = [
  {
    rotulo: "01 · tela_cheia",
    cena: {
      tipo: "tela_cheia",
      inicio: 0,
      fim: 5,
      texto: "TUDO É RELATIVO",
      subtexto: "COMO JULGAR",
      contexto: "TESE",
      mascotMood: "serio",
    },
  },
  {
    rotulo: "02 · barra_inferior",
    cena: {
      tipo: "barra_inferior",
      inicio: 0,
      fim: 5,
      texto: "IMMANUEL KANT",
      subtexto: "FILÓSOFO · 1724 — 1804",
      contexto: "01",
      mascotMood: "apresentador",
    },
  },
  {
    rotulo: "03 · card_informacao",
    cena: {
      tipo: "card_informacao",
      inicio: 0,
      fim: 5,
      texto: "A LIBERDADE",
      subtexto: "AUTONOMIA",
      contexto:
        "Kant não está dizendo \"fazer o que se quer\". Está dizendo agir conforme uma lei que você mesmo se dá.",
      mascotMood: "investigador",
    },
  },
  {
    rotulo: "04 · destaque_numerico",
    cena: {
      tipo: "destaque_numerico",
      inicio: 0,
      fim: 5,
      texto: "73%",
      subtexto: "DADO · Nº 014",
      contexto: "DA POPULAÇÃO MUNDIAL",
      fonte: "LEVANTAMENTO INTERNO, 2025",
    },
  },
  {
    rotulo: "05 · chamada_final",
    cena: {
      tipo: "chamada_final",
      inicio: 0,
      fim: 5,
      texto: "INSCREVA-SE",
      subtexto: "NO CANAL",
      contexto: "— ATÉ AQUI —",
      mascotMood: "animado",
    },
  },
  {
    rotulo: "06 · ficha_biografica",
    cena: {
      tipo: "ficha_biografica",
      inicio: 0,
      fim: 5,
      texto: "IMMANUEL KANT",
      subtexto: "FICHA · Nº 014",
      contexto: "filósofo do iluminismo",
      ano: "1724 — 1804",
      obra: "KÖNIGSBERG",
      mascotMood: "investigador",
    },
  },
  {
    rotulo: "07 · marco_historico",
    cena: {
      tipo: "marco_historico",
      inicio: 0,
      fim: 5,
      texto: "TOMADA DA",
      subtexto: "BASTILHA",
      ano: "1789",
      contexto: "14 DE JULHO",
      obra: "PARIS · REVOLUÇÃO FRANCESA",
      mascotMood: "investigador",
    },
  },
  {
    rotulo: "08 · comparativo_contraponto",
    cena: {
      tipo: "comparativo_contraponto",
      inicio: 0,
      fim: 5,
      texto: "OPINIÃO",
      subtexto: "ARGUMENTO",
      rotuloA: "CRENÇA",
      rotuloB: "PROVA",
      contexto: "EIXO DO DEBATE",
      mascotMood: "serio",
    },
  },
  {
    rotulo: "09 · pergunta_transicao",
    cena: {
      tipo: "pergunta_transicao",
      inicio: 0,
      fim: 5,
      texto: "COMO DISTINGUIR",
      subtexto: "OPINIÃO DE ARGUMENTO",
      contexto: "PERGUNTA CENTRAL",
      mascotMood: "pensativo",
    },
  },
  {
    rotulo: "10 · citacao_autor",
    cena: {
      tipo: "citacao_autor",
      inicio: 0,
      fim: 5,
      texto: "Só sei que nada sei.",
      autor: "SÓCRATES",
      obra: "APOLOGIA",
      ano: "399 a.C.",
      contexto: "CITAÇÃO",
      mascotMood: "pensativo",
    },
  },
  {
    rotulo: "11 · linha_tempo",
    cena: {
      tipo: "linha_tempo",
      inicio: 0,
      fim: 5,
      texto: "O LONGO SÉCULO XIX",
      contexto: "— LINHA DO TEMPO —",
      marcos: [
        { data: "1789", titulo: "BASTILHA", detalhe: "queda do antigo regime" },
        { data: "1815", titulo: "WATERLOO", detalhe: "fim de Napoleão" },
        { data: "1848", titulo: "PRIMAVERA", detalhe: "dos povos" },
        { data: "1871", titulo: "COMUNA", detalhe: "de Paris" },
      ],
      mascotMood: "investigador",
    },
  },
  {
    rotulo: "12 · definicao_termo",
    cena: {
      tipo: "definicao_termo",
      inicio: 0,
      fim: 5,
      texto: "NIILISMO",
      subtexto: "subst. masc. · do lat. nihil, \"nada\"",
      contexto:
        "Posição filosófica que nega valor, propósito ou verdade objetiva — sobretudo em moral e religião.",
      mascotMood: "investigador",
    },
  },
  {
    rotulo: "13 · fonte_referencia",
    cena: {
      tipo: "fonte_referencia",
      inicio: 0,
      fim: 5,
      texto: "STANFORD ENCYCLOPEDIA",
      subtexto: "PHILOSOPHY · CITAÇÃO 4.3.1",
      fonte: "STANFORD ENCYCLOPEDIA",
    },
  },
  {
    rotulo: "14 · lista_enumerada",
    cena: {
      tipo: "lista_enumerada",
      inicio: 0,
      fim: 5,
      texto: "O QUE FAZ UM ARGUMENTO VÁLIDO",
      contexto: "PONTOS",
      itens: [
        { titulo: "PREMISSAS VERDADEIRAS", detalhe: "fatos verificáveis, não opiniões" },
        { titulo: "INFERÊNCIA VÁLIDA", detalhe: "a conclusão decorre logicamente" },
        { titulo: "CONCLUSÃO COERENTE", detalhe: "consistente com o todo" },
      ],
      mascotMood: "apresentador",
    },
  },
];

const Badge: React.FC<{ rotulo: string; total: number; idx: number }> = ({
  rotulo,
  total,
  idx,
}) => (
  <div
    style={{
      position: "absolute",
      top: 28,
      right: 36,
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "10px 18px",
      background: "rgba(8,18,12,0.78)",
      border: `2px solid ${C.verdeMoldura}`,
      boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
      zIndex: 9999,
    }}
  >
    <div
      style={{
        fontFamily: F.mono,
        fontSize: 18,
        letterSpacing: 3,
        color: C.azulAcento,
        fontWeight: 700,
        textTransform: "uppercase",
      }}
    >
      {rotulo}
    </div>
    <div style={{ width: 1, height: 22, background: "rgba(255,255,255,0.25)" }} />
    <div
      style={{
        fontFamily: F.mono,
        fontSize: 14,
        letterSpacing: 2,
        color: C.brancoMuted,
      }}
    >
      {String(idx + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
    </div>
  </div>
);

/**
 * Catálogo das 14 cenas v2 em sequência (segundosPorCena cada). Útil para
 * avaliação visual em um único play do Remotion Studio.
 */
export const PreviewCenasV2: React.FC<PreviewCenasV2Props> = ({ segundosPorCena }) => {
  const { fps } = useVideoConfig();
  const durFrames = Math.max(1, Math.round(segundosPorCena * fps));

  return (
    <AbsoluteFill
      style={{
        background: `
          radial-gradient(circle at 22% 28%, rgba(180,120,80,0.55) 0%, transparent 38%),
          radial-gradient(circle at 78% 32%, rgba(80,130,170,0.45) 0%, transparent 42%),
          radial-gradient(circle at 50% 72%, rgba(60,90,75,0.55) 0%, transparent 48%),
          radial-gradient(circle at 85% 80%, rgba(220,180,120,0.35) 0%, transparent 30%),
          linear-gradient(135deg, #4a3c2a 0%, #2a2e35 45%, #20303a 75%, #1e2a22 100%)
        `,
      }}
    >
      {CENAS.map(({ rotulo, cena }, idx) => {
        const from = idx * durFrames;
        const cenaAjustada: CenaRemotion = {
          ...cena,
          inicio: 0,
          fim: segundosPorCena,
          inicio_seg: 0,
          fim_seg: segundosPorCena,
        };
        return (
          <Sequence
            key={rotulo}
            from={from}
            durationInFrames={durFrames}
            premountFor={Math.min(fps, durFrames)}
          >
            <FrameOffsetContext.Provider value={0}>
              {renderCenaV2(cenaAjustada)}
            </FrameOffsetContext.Provider>
            <Badge rotulo={rotulo} total={CENAS.length} idx={idx} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const previewCenasV2Count = CENAS.length;
