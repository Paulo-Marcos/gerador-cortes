import type { CenaTipo } from '@/types/models';

export type CenaIconName =
  | 'Film'
  | 'PanelBottom'
  | 'FileText'
  | 'Hash'
  | 'GitCompareArrows'
  | 'Sparkles'
  | 'CircleHelp'
  | 'Rocket'
  | 'AtSign'
  | 'CalendarDays'
  | 'BookOpen'
  | 'List'
  | 'Brain'
  | 'Tag'
  | 'Check'
  | 'Image';

export interface TipoMeta {
  label: string;
  icon: CenaIconName;
  color: string;
  tone: string;
}

export const TIPOS_CENA: Record<CenaTipo, TipoMeta> = {
  tela_cheia: {
    label: 'Tela cheia',
    icon: 'Film',
    color: 'oklch(0.55 0.12 245)',
    tone: 'border-blue-500/40 bg-blue-500/10 text-blue-200',
  },
  barra_inferior: {
    label: 'Barra inferior',
    icon: 'PanelBottom',
    color: 'oklch(0.56 0.13 195)',
    tone: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200',
  },
  card_informacao: {
    label: 'Card de informacao',
    icon: 'FileText',
    color: 'oklch(0.54 0.11 75)',
    tone: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
  },
  destaque_numerico: {
    label: 'Destaque numerico',
    icon: 'Hash',
    color: 'oklch(0.58 0.15 115)',
    tone: 'border-lime-500/40 bg-lime-500/10 text-lime-200',
  },
  comparativo_enfase: {
    label: 'Contraponto legado',
    icon: 'GitCompareArrows',
    color: 'oklch(0.55 0.14 285)',
    tone: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  },
  comparativo_contraponto: {
    label: 'Contraponto',
    icon: 'GitCompareArrows',
    color: 'oklch(0.55 0.14 285)',
    tone: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  },
  enfase: {
    label: 'Enfase',
    icon: 'Sparkles',
    color: 'oklch(0.58 0.16 85)',
    tone: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  },
  pergunta_transicao: {
    label: 'Pergunta',
    icon: 'CircleHelp',
    color: 'oklch(0.54 0.16 32)',
    tone: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
  },
  chamada_final: {
    label: 'Chamada final',
    icon: 'Rocket',
    color: 'oklch(0.56 0.15 18)',
    tone: 'border-red-500/40 bg-red-500/10 text-red-200',
  },
  ficha_biografica: {
    label: 'Ficha biografica',
    icon: 'AtSign',
    color: 'oklch(0.52 0.12 330)',
    tone: 'border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200',
  },
  marco_historico: {
    label: 'Marco historico',
    icon: 'CalendarDays',
    color: 'oklch(0.55 0.12 155)',
    tone: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  },
  citacao_autor: {
    label: 'Citacao',
    icon: 'BookOpen',
    color: 'oklch(0.50 0.11 260)',
    tone: 'border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
  },
  linha_tempo: {
    label: 'Linha do tempo',
    icon: 'List',
    color: 'oklch(0.57 0.12 220)',
    tone: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
  },
  definicao_termo: {
    label: 'Definicao',
    icon: 'Brain',
    color: 'oklch(0.53 0.12 55)',
    tone: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-200',
  },
  fonte_referencia: {
    label: 'Fonte',
    icon: 'Tag',
    color: 'oklch(0.48 0.10 145)',
    tone: 'border-green-500/40 bg-green-500/10 text-green-200',
  },
  lista_enumerada: {
    label: 'Lista',
    icon: 'Check',
    color: 'oklch(0.52 0.12 185)',
    tone: 'border-teal-500/40 bg-teal-500/10 text-teal-200',
  },
  mostrar_imagem: {
    label: 'Imagem',
    icon: 'Image',
    color: 'oklch(0.55 0.10 260)',
    tone: 'border-violet-500/40 bg-violet-500/10 text-violet-200',
  },
};

export function metaCena(tipo: string): TipoMeta {
  return (
    TIPOS_CENA[tipo as CenaTipo] ?? {
      label: tipo,
      icon: 'Film',
      color: 'var(--wb-text-mute)',
      tone: 'border-[var(--border)] bg-bg-800 text-text-200',
    }
  );
}
