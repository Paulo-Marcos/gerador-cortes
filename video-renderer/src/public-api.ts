// A porta do renderer para quem está fora dele (D-725).
//
// O frontend monta a prévia das cenas com as MESMAS composições que o worker
// renderiza — é isso que faz a prévia bater com o vídeo. Mas só pode entrar
// por aqui: o que não está listado é interno e pode mudar sem aviso. O ESLint
// do frontend recusa import de @video-renderer/* que não seja este arquivo.

// O contrato da cena: o schema zod é a fonte, e o tipo sai dele.
export { cenaSchema, type CenaRemotion } from "./schema";

// O que a prévia do editor precisa para desenhar uma cena como o render.
export { renderCenaV2 } from "./cenas-v2";
export { FrameOffsetContext } from "./frame-context";
export { SharedCardZoneFrame } from "./shared-card-zone";
export {
  CardLayoutContext,
  FontPresetProvider,
  SombraContext,
  SOMBRA_TOKENS,
  resolverNivel,
} from "./cenas-v2/_shared";

// D-911: o palco "limpo" — a prévia monta os mesmos componentes e lê as mesmas
// constantes do PNG do palco, em vez de manter uma cópia espelhada.
export {
  ALTURA_DA_PLACA,
  ALTURA_DO_CABECALHO,
  CABECALHO_HORIZONTAL,
  CABECALHO_SHORT_X,
  CONTORNO_DO_SHORT,
  CabecalhoDoCanal,
  COMPONENTES_PADRAO,
  COR_DO_ACENTO,
  COR_DO_FUNDO,
  COR_DO_TEXTO,
  FundoLimpo,
  PlacaLimpa,
  RAIO_DA_FACECAM,
  RAIO_DA_JANELA_DO_SHORT,
  RAIO_DA_TELA,
  SOMBRA_DA_JANELA,
  SombraDaJanela,
  FUNDO_PADRAO_DO_LIMPO,
  FUNDOS_DO_LIMPO,
  janelaComContorno,
  posicaoDaPlaca,
  posicaoDaPlacaDe,
  posicaoDoCabecalho,
  posicaoDoCabecalhoNoShortDe,
  posicaoDoCabecalhoNoShort,
  RECUO_DO_CABECALHO_NA_JANELA,
  type PosicaoDoCabecalhoNoShort,
  raioDaJanela,
  type ComponentesDoPalco as ComponentesDoPalcoDoRenderer,
  type FundoDoLimpo,
  type Janela,
  type PosicaoDoComponente,
} from "./youtube-bg/palco-limpo";

// D-933: a capa do TikTok — a prévia do modal de estilo monta a mesma
// composição que o gerador rasteriza.
export {
  CANVAS_H as ALTURA_DA_CAPA,
  CANVAS_W as LARGURA_DA_CAPA,
  CapaTikTok,
  type CapaTikTokProps,
} from "./youtube-bg/capa-tiktok";

// D-913: as sombras da legenda do short, para a prévia desenhar igual ao render.
export {
  ESTILOS_DA_LEGENDA,
  SOMBRAS_DA_LEGENDA,
  type EstiloDaLegenda,
} from "./cenas-shorts/sombrasDaLegenda";

// D-913: o trecho em destaque do gancho (entre asteriscos), igual no render e na prévia.
export {
  MARCA_DO_DESTAQUE,
  TextoComDestaque,
  partesDoGancho,
  semMarcas,
  type PartesDoGancho,
} from "./cenas-shorts/destaqueDoGancho";

// D-916: o estilo das cenas do canal (limpo/atual, tipos escondidos, tamanho e posição).
export {
  ESTILO_DAS_CENAS_PADRAO,
  EstiloDasCenasProvider,
  estiloDasCenasSchema,
  type EstiloDasCenas,
} from "./cenas-limpo";

// D-918: o movimento das cenas no estilo limpo (funções puras de quadro → valor).
export * as movimentoDoLimpo from "./cenas-limpo/movimento";
export { analisarNumeroDestaque } from "./cenas-v2/_shared/numeroFit";
