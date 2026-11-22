import type { TelaId } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-1137 (E-069 H-13) · A luz da sala: que aurora pintar e se o vidro desfoca.
//
// A regra é a da DIRECAO §3.6, e é de desempenho, não de gosto:
//   - onde o vídeo toca (Editor, Pós, Revisão, Curadoria e Prateleira do Fire) a aurora cai para os dois halos, sem a
//     capa, e nada desfoca: `backdrop-filter` sobre vídeo recompõe a cada quadro;
//   - "Reduzir efeitos", a transparência reduzida do sistema e o modo foco
//     tiram a aurora e trocam o vidro por sólido, em qualquer tela.
// ─────────────────────────────────────────────────────────────────

/** As telas que tocam vídeo: nelas o vidro não desfoca e a capa não vira aurora. */
const TELAS_COM_VIDEO: TelaId[] = ['cortes', 'pos', 'revisao', 'fire', 'prateleira'];

export type Aurora = 'capa' | 'halos' | 'nenhuma';

export interface CondicoesDaSala {
  tela: TelaId;
  /** A live aberta tem capa (miniatura pronta para a aurora). */
  temCapa: boolean;
  /** Configurações › Aparência › "Reduzir efeitos". */
  reduzirEfeitos: boolean;
  /** `prefers-reduced-transparency: reduce` do sistema. */
  transparenciaReduzida: boolean;
  /** Modo foco (`useModoFoco`): a casca some e a luz apaga junto. */
  foco: boolean;
}

export interface LuzDaSala {
  aurora: Aurora;
  /** `false`: o vidro da casca vira painel sólido, sem `backdrop-filter`. */
  vidro: boolean;
}

export function luzDaSala(c: CondicoesDaSala): LuzDaSala {
  if (c.reduzirEfeitos || c.transparenciaReduzida || c.foco) return { aurora: 'nenhuma', vidro: false };
  if (TELAS_COM_VIDEO.includes(c.tela)) return { aurora: 'halos', vidro: false };
  return { aurora: c.temCapa ? 'capa' : 'halos', vidro: true };
}
