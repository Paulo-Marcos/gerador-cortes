import type { IconName } from './Icon';
import { TELAS, type TelaId } from './upgradeRoutes';

// D-806: a esteira da live saiu do upgradeRoutes (que passou de 500 linhas
// na D-798). Ela é DERIVADA da tabela `TELAS`, que continua lá; a tabela
// não depende da esteira, então não há import circular.

// ── A esteira da live ────────────────────────────────────────────

export type PassoDaLive = {
  id: TelaId;
  icone: IconName;
  texto: string;
  to?: string;
  /** `true` na fase onde a pessoa está agora. */
  agora: boolean;
};

const ESTEIRA: TelaId[] = ['projeto', 'cortes', 'pos', 'metadados', 'revisao'];

/** As telas que pertencem a uma live — e portanto mostram a esteira. */
export function dentroDeUmaLive(tela: TelaId): boolean {
  return ESTEIRA.includes(tela);
}

/**
 * A esteira da live, na ordem do trabalho. Sai do trilho e passa a ser uma
 * fita própria, logo abaixo da barra superior: um lugar só, sempre o mesmo,
 * e apenas nas telas de dentro de uma live.
 *
 * Os estados "feito"/"a fazer" dependem de dados e continuam vindo da tela
 * (`chrome.etapas`) quando ela os tem; a fita sozinha já responde "em que
 * fase estou" e "como pulo para outra", que é o que o trilho respondia mal.
 */
export function esteiraDaLive(
  tela: TelaId,
  projetoId: string | null,
  corteId: string | null = null,
): PassoDaLive[] {
  if (!projetoId || !dentroDeUmaLive(tela)) return [];
  return ESTEIRA.map((id) => ({
    id,
    icone: TELAS[id].icone,
    texto: TELAS[id].menu ?? TELAS[id].titulo,
    to: (corteId && ROTA_COM_CORTE[id]?.(projetoId, corteId)) || TELAS[id].rota?.(projetoId),
    agora: id === tela,
  }));
}

/**
 * D-798: com um corte aberto, cada fase da fita leva a ELE — sem isso o
 * menu caía no primeiro corte do projeto, e só dava para ver o bruto, a pós
 * e a revisão do corte #1. O Workspace é da live inteira e fica de fora.
 */
const ROTA_COM_CORTE: Partial<Record<TelaId, (projetoId: string, corteId: string) => string>> = {
  cortes: (p, c) => `/projetos/${p}/cortes/${c}`,
  pos: (p, c) => `/projetos/${p}/post-production?corte=${c}`,
  metadados: (p, c) => `/projetos/${p}/metadados?corte=${c}`,
  revisao: (p, c) => `/projetos/${p}/final-review?corte=${c}`,
};
