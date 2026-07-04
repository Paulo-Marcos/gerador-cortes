export { CenaFullscreen } from "./CenaFullscreen";
export { CenaLowerThird } from "./CenaLowerThird";
export { CenaCard } from "./CenaCard";
export { CenaNumber } from "./CenaNumber";
export { CenaCTA } from "./CenaCTA";
export { CenaPessoa } from "./CenaPessoa";
export { CenaEvento } from "./CenaEvento";
export { CenaEnfase } from "./CenaEnfase";
export { CenaComparativo } from "./CenaComparativo";
export { CenaPergunta } from "./CenaPergunta";
export { CenaCitacao } from "./CenaCitacao";
export { CenaLinhaTempo } from "./CenaLinhaTempo";
export { CenaDefinicao } from "./CenaDefinicao";
export { CenaFonte } from "./CenaFonte";
export { CenaLista } from "./CenaLista";

import type { CenaRemotion } from "../schema";
import { CenaFullscreen } from "./CenaFullscreen";
import { CenaLowerThird } from "./CenaLowerThird";
import { CenaCard } from "./CenaCard";
import { CenaNumber } from "./CenaNumber";
import { CenaCTA } from "./CenaCTA";
import { CenaPessoa } from "./CenaPessoa";
import { CenaEvento } from "./CenaEvento";
import { CenaEnfase } from "./CenaEnfase";
import { CenaComparativo } from "./CenaComparativo";
import { CenaPergunta } from "./CenaPergunta";
import { CenaCitacao } from "./CenaCitacao";
import { CenaLinhaTempo } from "./CenaLinhaTempo";
import { CenaDefinicao } from "./CenaDefinicao";
import { CenaFonte } from "./CenaFonte";
import { CenaLista } from "./CenaLista";

/** Mapa de `tipo` → componente da v2 (nova identidade). */
export function renderCenaV2(cena: CenaRemotion): React.ReactNode {
  switch (cena.tipo) {
    case "tela_cheia":
      return <CenaFullscreen cena={cena} />;
    case "barra_inferior":
      return <CenaLowerThird cena={cena} />;
    case "card_informacao":
      return <CenaCard cena={cena} />;
    case "destaque_numerico":
      return <CenaNumber cena={cena} />;
    case "chamada_final":
      return <CenaCTA cena={cena} />;
    case "ficha_biografica":
      return <CenaPessoa cena={cena} />;
    case "marco_historico":
      return <CenaEvento cena={cena} />;
    case "comparativo_contraponto":
    case "comparativo_enfase":
      return <CenaComparativo cena={cena} />;
    case "enfase":
      return <CenaEnfase cena={cena} />;
    case "pergunta_transicao":
      return <CenaPergunta cena={cena} />;
    case "citacao_autor":
      return <CenaCitacao cena={cena} />;
    case "linha_tempo":
      return <CenaLinhaTempo cena={cena} />;
    case "definicao_termo":
      return <CenaDefinicao cena={cena} />;
    case "fonte_referencia":
      return <CenaFonte cena={cena} />;
    case "lista_enumerada":
      return <CenaLista cena={cena} />;
    default:
      return null;
  }
}
