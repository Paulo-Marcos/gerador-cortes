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
