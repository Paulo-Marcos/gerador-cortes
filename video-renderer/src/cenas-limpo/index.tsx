import type { FC, ReactNode } from "react";
import type { CenaRemotion } from "../schema";
import {
  CenaCardLimpo,
  CenaCitacaoLimpo,
  CenaDefinicaoLimpo,
  CenaEnfaseLimpo,
  CenaFichaLimpo,
  CenaMarcoLimpo,
  CenaNumeroLimpo,
  CenaPerguntaChatLimpo,
  CenaPerguntaLimpo,
} from "./cenas-coluna";
import {
  CenaBarraInferiorLimpo,
  CenaChamadaFinalLimpo,
  CenaComparativoLimpo,
  CenaFonteLimpo,
  CenaLinhaTempoLimpo,
  CenaListaLimpo,
  CenaTelaCheiaLimpo,
} from "./cenas-largas";
import { useEstiloDasCenas } from "./estilo-das-cenas";

export {
  ESTILO_DAS_CENAS_PADRAO,
  EstiloDasCenasProvider,
  estiloDasCenasSchema,
  useEstiloDasCenas,
  type EstiloDasCenas,
} from "./estilo-das-cenas";

/** D-916: tipo → cena no estilo limpo. Todos os tipos de `renderCenaV2` têm par aqui. */
export const CENAS_LIMPAS: Record<string, FC<{ cena: CenaRemotion }>> = {
  tela_cheia: CenaTelaCheiaLimpo,
  barra_inferior: CenaBarraInferiorLimpo,
  card_informacao: CenaCardLimpo,
  destaque_numerico: CenaNumeroLimpo,
  chamada_final: CenaChamadaFinalLimpo,
  ficha_biografica: CenaFichaLimpo,
  marco_historico: CenaMarcoLimpo,
  comparativo_contraponto: CenaComparativoLimpo,
  comparativo_enfase: CenaComparativoLimpo,
  enfase: CenaEnfaseLimpo,
  pergunta_transicao: CenaPerguntaLimpo,
  citacao_autor: CenaCitacaoLimpo,
  linha_tempo: CenaLinhaTempoLimpo,
  definicao_termo: CenaDefinicaoLimpo,
  fonte_referencia: CenaFonteLimpo,
  lista_enumerada: CenaListaLimpo,
  pergunta_chat: CenaPerguntaChatLimpo,
};

/**
 * A cena no estilo do canal: some quando o tipo está escondido, sai pelo Bloco
 * no estilo limpo, e no estilo de sempre cai no desenho que já existia.
 */
export const CenaNoEstilo: FC<{ cena: CenaRemotion; atual: ReactNode }> = ({ cena, atual }) => {
  const { estilo, ocultos } = useEstiloDasCenas();
  if (ocultos.includes(cena.tipo)) return null;
  const Limpa = estilo === "limpo" ? CENAS_LIMPAS[cena.tipo] : undefined;
  return <>{Limpa ? <Limpa cena={cena} /> : atual}</>;
};
