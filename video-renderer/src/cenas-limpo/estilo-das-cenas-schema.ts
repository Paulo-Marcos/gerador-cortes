import { z } from "zod";

/**
 * D-916: o contrato do estilo das cenas, sem React — `schema.ts` e o frontend
 * o importam. O contexto e o provider moram em `estilo-das-cenas.tsx`.
 */
export const posicaoDosCardsSchema = z.object({
  automatica: z.boolean().default(true),
  x: z.number().default(96),
  y: z.number().default(112),
});

export const estiloDasCenasSchema = z.object({
  estilo: z.enum(["atual", "limpo"]).default("atual"),
  /** Tipos de cena que não aparecem no vídeo deste canal. */
  ocultos: z.array(z.string()).default([]),
  /** Tamanho dos cards no layout cheio (1 = o do catálogo). */
  escala: z.number().default(1),
  /** Onde os cards sentam no layout cheio; na compartilhada manda a zona do corte. */
  posicao: posicaoDosCardsSchema.default({ automatica: true, x: 96, y: 112 }),
  /**
   * D-926: como o card se apresenta dentro da zona dos cards (compartilhada).
   * "preencher" cresce ou encolhe o card até caber no espaço; "natural" é o
   * tamanho de sempre. Sem a chave vale o desenho de antes (natural, no topo,
   * à esquerda): o backend sempre manda o que o canal escolheu.
   */
  ajuste: z.enum(["preencher", "natural"]).default("natural"),
  alinhamento_vertical: z.enum(["centro", "topo", "base"]).default("topo"),
  alinhamento_horizontal: z.enum(["centro", "esquerda", "direita"]).default("esquerda"),
  /**
   * D-941: a caixa do card no layout cheio (px do quadro). Sem ela vale a
   * posição + a escala; com ela o card ocupa o retângulo pelas regras da zona
   * (ajuste e alinhamentos) — largura e altura se ajustam separadamente.
   */
  zona_no_cheio: z
    .object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() })
    .nullable()
    .default(null),
});

export type EstiloDasCenas = z.infer<typeof estiloDasCenasSchema>;


/** O padrão: estilo de sempre, nada escondido, tamanho 1, posição automática. */
export const ESTILO_DAS_CENAS_PADRAO: EstiloDasCenas = estiloDasCenasSchema.parse({});
