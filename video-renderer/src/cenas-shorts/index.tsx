import React from "react";
import { Sequence, useVideoConfig } from "remotion";
import type { Caption } from "@remotion/captions";
import { CenaCitacaoShort } from "./CenaCitacaoShort";
import { CenaCtaShort } from "./CenaCtaShort";
import { CenaHook } from "./CenaHook";
import { CenaNumeroShort } from "./CenaNumeroShort";
import { LegendaShort } from "./LegendaShort";
import { ehTipoCenaShort, type CenaShort, type TipoCenaShort } from "./schema";

export { CenaCitacaoShort, CenaCtaShort, CenaHook, CenaNumeroShort, LegendaShort };
export * from "./schema";

// D-465: o mapa tipo → componente das cenas verticais.
//
// Diretório próprio, e não `cenas-v2/`: aquele está sob o lock
// `remotion-v2-card-contracts` e guarda o contrato visual HOMOLOGADO do vídeo
// horizontal. Vertical não é o horizontal girado — corpo de texto, ancoragem e
// duração mudam —, então misturar os dois só criaria condicional em cada card.

const CENAS: Record<TipoCenaShort, React.FC<{ cena: CenaShort }>> = {
  hook: CenaHook,
  numero: CenaNumeroShort,
  citacao: CenaCitacaoShort,
  cta: CenaCtaShort,
};

export interface CamadaShortProps {
  cenas: CenaShort[];
  captions: Caption[];
}

/**
 * A camada que vai por cima do vídeo do short: cenas + legenda queimada.
 *
 * Cena de tipo desconhecido é IGNORADA em silêncio, não quebra o render. A IA
 * escreve esse JSON, e um tipo inventado num short não pode custar o vídeo
 * inteiro — o pior caso aceitável é o short sair sem aquela cena.
 */
export const CamadaShort: React.FC<CamadaShortProps> = ({ cenas, captions }) => {
  const { fps } = useVideoConfig();

  return (
    <>
      {cenas.filter((cena) => ehTipoCenaShort(cena.tipo)).map((cena, indice) => {
        const Componente = CENAS[cena.tipo];
        const de = Math.max(0, Math.round(cena.inicio * fps));
        const duracao = Math.max(1, Math.round((cena.fim - cena.inicio) * fps));
        return (
          <Sequence key={`${cena.tipo}-${indice}`} from={de} durationInFrames={duracao}>
            <Componente cena={cena} />
          </Sequence>
        );
      })}

      <LegendaShort captions={captions} />
    </>
  );
};
