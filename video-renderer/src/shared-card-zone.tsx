import type { ReactNode } from "react";
import type { CenaRemotion } from "./schema";

export interface LayoutCardZone {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CardSourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_SOURCE: CardSourceRect = { x: 92, y: 112, w: 600, h: 760 };

// Exportado para os testes de contencao (frontend/sharedCardZone.test.ts).
export const SOURCE_BY_TYPE: Partial<Record<CenaRemotion["tipo"], CardSourceRect>> = {
  tela_cheia: { x: 92, y: 112, w: 560, h: 720 },
  card_informacao: { x: 92, y: 116, w: 520, h: 760 },
  pergunta_transicao: { x: 92, y: 112, w: 520, h: 680 },
  definicao_termo: { x: 92, y: 116, w: 520, h: 760 },
  comparativo_contraponto: { x: 92, y: 112, w: 600, h: 720 },
  comparativo_enfase: { x: 92, y: 112, w: 600, h: 720 },
  enfase: { x: 92, y: 128, w: 480, h: 610 },
  ficha_biografica: { x: 92, y: 128, w: 460, h: 590 },
  marco_historico: { x: 92, y: 120, w: 540, h: 700 },
  linha_tempo: { x: 92, y: 112, w: 610, h: 780 },
  lista_enumerada: { x: 92, y: 100, w: 540, h: 820 },
  barra_inferior: { x: 92, y: 558, w: 440, h: 430 },
  fonte_referencia: { x: 92, y: 602, w: 390, h: 360 },
  // I-036: tipos fora deste mapa renderizam em tamanho cheio sobre o palco.
  citacao_autor: { x: 92, y: 116, w: 520, h: 760 },
  chamada_final: { x: 92, y: 92, w: 560, h: 760 },
};

export function shouldUseSharedCardZone(
  cena: Pick<CenaRemotion, "tipo" | "layout_card" | "modelo_cena" | "layout_youtube_modo" | "layout_card_zone">,
): boolean {
  if (cena.layout_youtube_modo !== "compartilhada") return false;
  if (cena.layout_card !== "vertical") return false;
  if (!cena.layout_card_zone) return false;
  if (cena.modelo_cena === "padrao") return false;
  return cena.tipo in SOURCE_BY_TYPE;
}

export function fitSharedCardZone(cena: Pick<CenaRemotion, "tipo" | "layout_card_zone">) {
  const zone = cena.layout_card_zone;
  const source = SOURCE_BY_TYPE[cena.tipo] ?? DEFAULT_SOURCE;
  if (!zone) return null;

  const scale = Math.min(zone.w / source.w, zone.h / source.h, 1);
  const x = zone.x + (zone.w - source.w * scale) / 2 - source.x * scale;
  const y = zone.y + (zone.h - source.h * scale) / 2 - source.y * scale;
  return { x, y, scale };
}

export const SharedCardZoneFrame: React.FC<{
  cena: CenaRemotion;
  children: ReactNode;
}> = ({ cena, children }) => {
  if (!shouldUseSharedCardZone(cena)) return <>{children}</>;
  const fit = fitSharedCardZone(cena);
  if (!fit) return <>{children}</>;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        transformOrigin: "0 0",
        transform: `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})`,
      }}
    >
      {children}
    </div>
  );
};
