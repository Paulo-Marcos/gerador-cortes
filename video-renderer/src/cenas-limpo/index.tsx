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
 * D-951: tipos que o estilo limpo não desenha. A tese de quadro inteiro tampava
 * o vídeo com um scrim — o oposto do limpo, onde o card é decoração do vídeo.
 */
export const SEM_LUGAR_NO_LIMPO: readonly string[] = ["tela_cheia"];

/**
 * A cena no estilo do canal: some quando o tipo está escondido, sai pelo Bloco
 * no estilo limpo, e no estilo de sempre cai no desenho que já existia.
 */
export const CenaNoEstilo: FC<{ cena: CenaRemotion; atual: ReactNode }> = ({ cena, atual }) => {
  const { estilo, ocultos } = useEstiloDasCenas();
  if (ocultos.includes(cena.tipo)) return null;
  if (estilo === "limpo" && SEM_LUGAR_NO_LIMPO.includes(cena.tipo)) return null;
  const Limpa = estilo === "limpo" ? CENAS_LIMPAS[cena.tipo] : undefined;
  return <>{Limpa ? <Limpa cena={cena} /> : atual}</>;
};
