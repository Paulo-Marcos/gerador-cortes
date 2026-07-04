import type { GerarBrutoOpcoes } from '@/lib/api';

// D-160 — opt-ins da regeração do bruto exibidos no editor ("Também refazer:").
// Todos desmarcados por default: regerar sem marcar nada roda SÓ o bruto.
export interface RegerarBrutoOpcoes {
  transcricao: boolean;
  cenas: boolean;
  metadados: boolean;
  desvios: boolean;
}

export const OPCOES_REGERAR_VAZIAS: RegerarBrutoOpcoes = {
  transcricao: false,
  cenas: false,
  metadados: false,
  desvios: false,
};

export interface PlanoRegeracao {
  /** Flags do endpoint gerar-bruto — transcrição/cenas rodam no worker. */
  bruto: GerarBrutoOpcoes;
  /** Gerar metadados por IA (mutation separada no front, após o bruto). */
  metadados: boolean;
  /** Regerar desvios por IA ANTES do bruto — eles alteram o recorte. */
  desvios: boolean;
}

/**
 * Traduz os opt-ins da UI para o plano de execução da regeração.
 *
 * `transcricao`/`cenas` viram flags do endpoint (worker); `metadados`/`desvios`
 * são orquestrados separadamente no front (metadados depois, desvios antes do
 * bruto). Sem nenhum opt-in, o plano regenera só o bruto.
 */
export function planejarRegeracaoBruto(opts: RegerarBrutoOpcoes): PlanoRegeracao {
  return {
    bruto: {
      refazer_transcricao: opts.transcricao,
      refazer_cenas: opts.cenas,
    },
    metadados: opts.metadados,
    desvios: opts.desvios,
  };
}
