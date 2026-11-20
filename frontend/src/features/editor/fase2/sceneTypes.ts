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
  | 'Image'
  | 'MessageCircle';

export interface TipoMeta {
  label: string;
  icon: CenaIconName;
  color: string;
  tone: string;
}

// Sala escura (DIRECAO §9.2): os 17 tipos dividem os tons de estado e a íris, e o que
// distingue um do outro é o ícone e o rótulo, nunca só a cor (WCAG 1.4.1). Cada tom tem
// a cor (`color`, um token) e a receita de classes (`tone`: fundo a 10%, fio a 40%).
// As classes ficam por extenso porque o Tailwind só gera o que lê escrito no arquivo.
const TOM_IRIS = {
  color: 'var(--cc-iris)',
  tone: 'border-iris/40 bg-iris/10 text-iris-2',
};
const TOM_INFO = {
  color: 'var(--cc-info)',
  tone: 'border-[color-mix(in_srgb,var(--cc-info)_40%,transparent)] bg-[color-mix(in_srgb,var(--cc-info)_10%,transparent)] text-[color:var(--cc-info)]',
};
const TOM_AVISO = {
  color: 'var(--cc-aviso)',
  tone: 'border-aviso/40 bg-aviso/10 text-aviso',
};
const TOM_OK = {
  color: 'var(--cc-ok)',
  tone: 'border-ok/40 bg-ok/10 text-ok',
};
const TOM_ERRO = {
  color: 'var(--cc-erro)',
  tone: 'border-erro/40 bg-erro/10 text-erro',
};

// As duas perguntas — a de transição e a do chat (D-910) — são da mesma família
// de cor; o ícone as distingue.
const CORES_DE_PERGUNTA = TOM_IRIS;

export const TIPOS_CENA: Record<CenaTipo, TipoMeta> = {
  tela_cheia: {
    label: 'Tela cheia',
    icon: 'Film',
    ...TOM_INFO,
  },
  barra_inferior: {
    label: 'Barra inferior',
    icon: 'PanelBottom',
    ...TOM_INFO,
  },
  card_informacao: {
    label: 'Card de informacao',
    icon: 'FileText',
    ...TOM_AVISO,
  },
  destaque_numerico: {
    label: 'Destaque numerico',
    icon: 'Hash',
    ...TOM_OK,
  },
  comparativo_enfase: {
    label: 'Contraponto legado',
    icon: 'GitCompareArrows',
    ...TOM_IRIS,
  },
  comparativo_contraponto: {
    label: 'Contraponto',
    icon: 'GitCompareArrows',
    ...TOM_IRIS,
  },
  enfase: {
    label: 'Enfase',
    icon: 'Sparkles',
    ...TOM_AVISO,
  },
  pergunta_transicao: {
    label: 'Pergunta',
    icon: 'CircleHelp',
    ...CORES_DE_PERGUNTA,
  },
  chamada_final: {
    label: 'Chamada final',
    icon: 'Rocket',
    ...TOM_ERRO,
  },
  ficha_biografica: {
    label: 'Ficha biografica',
    icon: 'AtSign',
    ...TOM_IRIS,
  },
  marco_historico: {
    label: 'Marco historico',
    icon: 'CalendarDays',
    ...TOM_OK,
  },
  citacao_autor: {
    label: 'Citacao',
    icon: 'BookOpen',
    ...TOM_INFO,
  },
  linha_tempo: {
    label: 'Linha do tempo',
    icon: 'List',
    ...TOM_INFO,
  },
  definicao_termo: {
    label: 'Definicao',
    icon: 'Brain',
    ...TOM_AVISO,
  },
  fonte_referencia: {
    label: 'Fonte',
    icon: 'Tag',
    ...TOM_OK,
  },
  lista_enumerada: {
    label: 'Lista',
    icon: 'Check',
    ...TOM_OK,
  },
  pergunta_chat: {
    label: 'Pergunta do chat',
    icon: 'MessageCircle',
    ...CORES_DE_PERGUNTA,
  },
  mostrar_imagem: {
    label: 'Imagem',
    icon: 'Image',
    ...TOM_IRIS,
  },
};

export function metaCena(tipo: string): TipoMeta {
  return (
    TIPOS_CENA[tipo as CenaTipo] ?? {
      label: tipo,
      icon: 'Film',
      color: 'var(--cc-fg-2)',
      tone: 'border-fio-2 bg-poco text-fg-2',
    }
  );
}
