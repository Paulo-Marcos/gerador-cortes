import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  CircleDashed,
  Download,
  Loader2,
  Pencil,
  Rocket,
  UploadCloud,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { PROJECT_STATUS_META } from '@/components/ui/status-chip';
import { estaProntoPraYoutube } from '@/hooks/useProjetos';
import type { Projeto, StatusProjeto } from '@/types/models';

export interface StatusMeta {
  label: string;
  Icon: LucideIcon;
  chipClass: string;
  animate?: boolean;
}

export const STATUS_META: Record<StatusProjeto, StatusMeta> = Object.fromEntries(
  Object.entries(PROJECT_STATUS_META).map(([status, meta]) => [
    status,
    {
      label: meta.label,
      Icon: meta.Icon,
      chipClass:
        status === 'erro'
          ? 'border-error/30 bg-error/15 text-error'
          : 'border-[var(--wb-border-soft)] bg-[var(--wb-pill-bg)] text-[var(--wb-text-mute)]',
      animate: meta.animate,
    },
  ]),
) as Record<StatusProjeto, StatusMeta>;

// ─────────────────────────────────────────────────────────────
// Estado editorial do projeto — a faixa do topo do card.
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
  Icon: LucideIcon;
  /** Fundo + tinta da faixa; par soft/ink pra manter contraste nos dois temas. */
  faixaClass: string;
  animate?: boolean;
}

const ESTADOS: Record<EstadoProjetoKey, EstadoProjeto> = {
  erro: {
    key: 'erro',
    label: 'erro',
    Icon: AlertTriangle,
    faixaClass: 'bg-[var(--wb-err-soft)] text-[var(--wb-err-ink)]',
  },
  aguardando: {
    key: 'aguardando',
    label: 'aguardando',
    Icon: CircleDashed,
    faixaClass: 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)]',
  },
  baixando: {
    key: 'baixando',
    label: 'baixando',
    Icon: Download,
    faixaClass: 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn-ink)]',
  },
  transcrevendo: {
    key: 'transcrevendo',
    label: 'transcrevendo',
    Icon: Loader2,
    faixaClass: 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn-ink)]',
    animate: true,
  },
  analise: {
    key: 'analise',
    label: 'em análise',
    Icon: Brain,
    faixaClass: 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent-strong)]',
  },
  analisado: {
    key: 'analisado',
    label: 'analisado',
    Icon: CheckCircle2,
    // `--wb-info` e `--wb-violet` não têm variante `-ink` (ok/warn/err têm), e
    // o tom base sobre o próprio soft fica em ~3,9:1 no tema claro — abaixo de
    // AA. Nessas duas faixas a cor fica no fundo e o texto usa `--wb-text`.
    faixaClass: 'bg-[var(--wb-info-soft)] text-[var(--wb-text)]',
  },
  editando: {
    key: 'editando',
    label: 'em edição',
    Icon: Pencil,
    faixaClass: 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)]',
  },
  'pronto-publicar': {
    key: 'pronto-publicar',
    label: 'pronto p/ publicar',
    Icon: Rocket,
    // Sem `--wb-violet-ink`: mesma solução da faixa `analisado`.
    faixaClass: 'bg-[var(--wb-violet-soft)] text-[var(--wb-text)]',
  },
  publicando: {
    key: 'publicando',
    label: 'publicando',
    Icon: UploadCloud,
    // Amarelo dos estados "em curso" (baixando/transcrevendo): a publicação
    // parcial ainda está andando. O ícone e o rótulo separam os três.
    faixaClass: 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn-ink)]',
  },
  publicado: {
    key: 'publicado',
    label: 'publicado',
    Icon: Youtube,
    // Par soft/ink e não `--wb-ok` cheio com texto branco: no tema escuro o
    // verde cheio clareia e branco sobre ele fica ilegível.
    faixaClass: 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]',
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
