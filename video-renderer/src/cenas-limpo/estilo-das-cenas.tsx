import { createContext, useContext, type ReactNode } from "react";
import { ESTILO_DAS_CENAS_PADRAO, estiloDasCenasSchema, type EstiloDasCenas } from "./estilo-das-cenas-schema";

export { ESTILO_DAS_CENAS_PADRAO, estiloDasCenasSchema, posicaoDosCardsSchema, type EstiloDasCenas } from "./estilo-das-cenas-schema";

/**
 * D-916: como as cenas do canal se desenham — o estilo (o de sempre ou o limpo),
 * os tipos que o canal escondeu, e o tamanho e a posição dos cards no layout
 * cheio. Vem do palco do canal (`backend/app/domain/canal/palco_componentes.py`)
 * pelos props da composição.
 *
 * Fora de um provider vale o padrão: estilo "atual", nada escondido, tamanho 1,
 * posição automática — é o que mantém o render de sempre byte a byte.
 */
const EstiloDasCenasContext = createContext<EstiloDasCenas>(ESTILO_DAS_CENAS_PADRAO);

export const useEstiloDasCenas = (): EstiloDasCenas => useContext(EstiloDasCenasContext);

export const EstiloDasCenasProvider = ({
  valor,
  children,
}: {
  valor?: Partial<EstiloDasCenas> | null;
  children: ReactNode;
}) => (
  <EstiloDasCenasContext.Provider value={estiloDasCenasSchema.parse(valor ?? {})}>
    {children}
  </EstiloDasCenasContext.Provider>
);
