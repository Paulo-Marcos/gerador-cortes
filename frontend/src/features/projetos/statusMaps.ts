import { estaProntoPraYoutube } from '@/features/projetos/useProjetos';
import type { Projeto } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// Estado editorial do projeto — o selo do card.
//
// `StatusProjeto` (o enum do banco) só descreve a INGESTÃO: para depois de
// `analisado` ele congela, e o card não conseguia dizer se o projeto estava
// em edição, pronto pra publicar ou publicado. Este derivador combina o
// status com as contagens de cortes para produzir UM estado por card, que é
// o que o rodapé antes tentava insinuar com um rótulo solto.
// ─────────────────────────────────────────────────────────────

export type EstadoProjetoKey =
  | 'erro'
  | 'aguardando'
  | 'baixando'
  | 'transcrevendo'
  | 'analise'
  | 'analisado'
  | 'editando'
  | 'pronto-publicar'
  | 'publicando'
  | 'publicado';

export interface EstadoProjeto {
  key: EstadoProjetoKey;
  label: string;
}

const ESTADOS: Record<EstadoProjetoKey, EstadoProjeto> = {
  erro: {
    key: 'erro',
    label: 'erro',
  },
  aguardando: {
    key: 'aguardando',
    label: 'aguardando',
  },
  baixando: {
    key: 'baixando',
    label: 'baixando',
  },
  transcrevendo: {
    key: 'transcrevendo',
    label: 'transcrevendo',
  },
  analise: {
    key: 'analise',
    label: 'em análise',
  },
  analisado: {
    key: 'analisado',
    label: 'analisado',
  },
  editando: {
    key: 'editando',
    label: 'em edição',
  },
  'pronto-publicar': {
    key: 'pronto-publicar',
    label: 'pronto p/ publicar',
  },
  publicando: {
    key: 'publicando',
    label: 'publicando',
  },
  publicado: {
    key: 'publicado',
    label: 'publicado',
  },
};

/** Estado único do projeto, na ordem em que o pipeline o atravessa. */
export function estadoDoProjeto(projeto: Projeto): EstadoProjeto {
  if (projeto.status === 'erro') return ESTADOS.erro;
  if (estaProntoPraYoutube(projeto)) return ESTADOS.publicado;
  if (projeto.status === 'pendente') return ESTADOS.aguardando;
  if (projeto.status === 'baixando') return ESTADOS.baixando;
  if (projeto.status === 'transcrevendo') return ESTADOS.transcrevendo;
  if (projeto.status === 'pronto' || projeto.status === 'analisando') return ESTADOS.analise;

  // Daqui pra baixo o projeto está `analisado`: quem manda são as contagens.
  if (projeto.total_publicados > 0) return ESTADOS.publicando;
  if (projeto.total_cortes === 0 || projeto.total_aprovados === 0) return ESTADOS.analisado;

  const alvo = projeto.total_aprovados;
  const renderizado = projeto.total_video_pronto >= alvo;
  const comMetadados = projeto.total_com_meta >= alvo;
  return renderizado && comMetadados ? ESTADOS['pronto-publicar'] : ESTADOS.editando;
}
