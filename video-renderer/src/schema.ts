import { z } from "zod";

// ─── Tipos de Cena em Português ──────────────────────────────────────────
const tipoCenaEnum = z.enum([
  // Identidade base
  "tela_cheia",            // Frase de impacto
  "barra_inferior",        // Lower third discreto
  "card_informacao",       // Card com ícone
  "destaque_numerico",     // Números, datas, estatísticas
  "comparativo_contraponto", // Comparativo/contraponto X vs Y
  "comparativo_enfase",    // Legado: alias visual de comparativo_contraponto
  "enfase",                // Destaque de palavra/frase unica
  "pergunta_transicao",    // Pergunta-guia
  "chamada_final",         // CTA

  // Contexto narrativo
  "ficha_biografica",      // Pessoa: nome + datas + obra
  "marco_historico",       // Evento + período

  // Editoriais (nicho histórico/filosófico/científico)
  "citacao_autor",         // Citação com aspas serif + atribuição
  "linha_tempo",           // 3-5 marcos encadeados
  "definicao_termo",       // X = Y estilo dicionário
  "fonte_referencia",      // Badge "Fonte: ..."
  "lista_enumerada",       // 1, 2, 3 pontos rápidos

  // Legado
  "mostrar_imagem",
]);

// ─── Humores do mascote ────────────────────────────────────────────────────
// Catálogo completo (17 poses) documentado em src/mascote/pose-catalog.ts.
// Adicionar uma pose nova: incluir o mood aqui E em pose-catalog.ts E no
// MOOD_TO_FILE de Mascote, depois colocar o PNG em public/mascote/.
const mascotMoodEnum = z.enum([
  // existentes
  "pensativo",
  "serio",
  "animado",
  "investigador",
  "apresentador",
  // apresentando
  "apontando",
  "professor",
  "narrador",
  // reagindo
  "surpreso",
  "cetico",
  "duvida",
  // editorial
  "lendo",
  "filosofando",
  "balanca",
  // energia
  "concordando",
  "enfatico",
  "convidativo",
  // sentinela
  "none",
]);

// ─── Posicionamento do mascote ─────────────────────────────────────────────
const mascotPosicaoEnum = z.enum([
  "tl",      // top-left (default histórico)
  "tr",      // top-right
  "bl",      // bottom-left
  "br",      // bottom-right
  "center",  // centro (CTAs)
]);

const mascotTamanhoEnum = z.enum(["mini", "pequeno", "medio", "grande", "extraGrande"]);
const layoutCardEnum = z.enum(["auto", "horizontal", "vertical"]);
const modeloCenaEnum = z.enum(["auto", "padrao", "card"]);
const layoutYoutubeModoEnum = z.enum(["full", "compartilhada"]);
// Manter sincronizado com FONT_PRESETS_V2 (theme-v2.ts), com overlay-schema.ts
// e com FONTE_PRESETS_VALIDOS no backend (pipeline_render.py).
const fontPresetEnum = z.enum([
  "atual",
  "moderna",
  "cientifica",
  "minimalista",
  "tecnica",
]);
const layoutCardZoneSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});

// ─── Item de Linha do Tempo ────────────────────────────────────────────────
const itemTimelineSchema = z.object({
  data: z.string(),       // "1789", "Séc. XIX", "1844-1900"
  titulo: z.string(),
  detalhe: z.string().optional(),
});

// ─── Item de Lista Enumerada ───────────────────────────────────────────────
const itemListaSchema = z.object({
  titulo: z.string(),
  detalhe: z.string().optional(),
});

// ─── Schema de uma Cena ────────────────────────────────────────────────────
const primeiroNumeroValido = (...valores: unknown[]): number | undefined => {
  for (const valor of valores) {
    const numero = Number(valor);
    if (Number.isFinite(numero)) return numero;
  }
  return undefined;
};

export const normalizarCenaRemotion = <T extends Record<string, unknown>>(cena: T) => {
  const inicio = primeiroNumeroValido(cena.inicio_seg, cena.inicio) ?? 0;
  const fimOriginal = primeiroNumeroValido(cena.fim_seg, cena.fim) ?? inicio + 5;
  const fim = fimOriginal > inicio ? fimOriginal : inicio + 5;

  return {
    ...cena,
    inicio,
    fim,
    inicio_seg: inicio,
    fim_seg: fim,
  };
};

const cenaBaseSchema = z.object({
  tipo: tipoCenaEnum,
  inicio: z.number(),
  fim: z.number(),
  inicio_seg: z.number().optional(),
  fim_seg: z.number().optional(),
  texto: z.string().optional(),
  nome_curto: z.string().optional(),
  subtexto: z.string().optional(),
  icone: z.string().optional(),
  numero: z.number().optional(),
  contexto: z.string().optional(),
  rotuloA: z.string().optional(),
  rotuloB: z.string().optional(),
  cor: z.string().optional(),
  url: z.string().optional(),

  // Mascote
  mascotMood: mascotMoodEnum.optional(),
  mascotPosicao: mascotPosicaoEnum.optional(),
  mascotTamanho: mascotTamanhoEnum.optional(),

  // Editoriais
  autor: z.string().optional(),       // citacao_autor: "Friedrich Nietzsche"
  obra: z.string().optional(),        // citacao_autor: "Assim Falou Zaratustra"
  ano: z.string().optional(),         // citacao_autor: "1883"
  fonte: z.string().optional(),       // fonte_referencia: "Stanford Encyclopedia"

  // Retrato (ficha_biografica): URL absoluta ou relativa (/api/retratos/slug)
  // para a foto do personagem. Quando ausente, a cena renderiza placeholder.
  retrato_url: z.string().optional(),

  // Listas
  marcos: z.array(itemTimelineSchema).optional(),  // linha_tempo
  itens: z.array(itemListaSchema).optional(),      // lista_enumerada

  // Ambientação
  textura: z.enum(["nenhuma", "papel", "particulas"]).optional(),

  // Nível de sombra/overlay (cenas v2). "auto" usa o default do projeto.
  // Os 4 níveis modulam a opacity do background do Chrome e a intensidade
  // dos HUDs ambientes/regionais, mantendo o vídeo passando atrás.
  sombra_nivel: z.enum(["auto", "nenhuma", "leve", "media", "forte"]).optional(),
  layout_card: layoutCardEnum.optional(),
  modelo_cena: modeloCenaEnum.optional(),
  layout_youtube_modo: layoutYoutubeModoEnum.optional(),
  layout_card_zone: layoutCardZoneSchema.optional(),
});

export const cenaSchema = z.preprocess((valor) => {
  if (!valor || typeof valor !== "object") return valor;
  return normalizarCenaRemotion(valor as Record<string, unknown>);
}, cenaBaseSchema);

export type CenaRemotion = z.infer<typeof cenaSchema>;

// ─── Schema CenaYouTube ────────────────────────────────────────────────────
export const youtubeSchema = z.object({
  videoUrl: z.string(),
  cenas: z.array(cenaSchema).default([]),
  letterbox: z.boolean().default(false),
  filtroCss: z.string().default("none"),
  renderStartFrame: z.number().optional(),
  renderEndFrame: z.number().optional(),
  // Nível de sombra padrão para cenas com sombra_nivel="auto" (cenas v2).
  // Espelha projeto.sombra_nivel_padrao no backend.
  sombraNivelPadrao: z.enum(["nenhuma", "leve", "media", "forte"]).default("nenhuma"),
  layoutCardPadrao: z.enum(["horizontal", "vertical"]).default("vertical"),
  fontPreset: fontPresetEnum.default("atual"),
});

export type YouTubeProps = z.infer<typeof youtubeSchema>;

// ─── Schema CenaReacao ─────────────────────────────────────────────────────
export const reacaoSchema = z.object({
  videoUrlFacecam: z.string(),
  videoUrlTela: z.string(),
  cenas: z.array(cenaSchema).default([]),
  letterbox: z.boolean().default(false),
  filtroCss: z.string().default("none"),
  layoutInicial: z.enum([
    "split_50_50",
    "facecam_destaque",
    "tela_destaque",
  ]).default("split_50_50"),
});

export type ReacaoProps = z.infer<typeof reacaoSchema>;
