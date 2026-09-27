// A IA como capacidade transversal (D-722): as gerações, a telemetria das
// chamadas e o selo de quem gerou. Várias features mostram o selo; esta é a
// única dona dos três.
export { geracaoIaApi } from './api/geracao';
export { llmCallsApi } from './api/telemetria';
export type {
  ListaLlmCallsResponse,
  ListarLlmCallsParams,
  LlmCall,
  UltimaGeracaoResponse,
} from './api/telemetria';
export { ultimaGeracaoKey, useUltimaGeracao } from './useUltimaGeracao';
export type { UltimaGeracao } from './useUltimaGeracao';
