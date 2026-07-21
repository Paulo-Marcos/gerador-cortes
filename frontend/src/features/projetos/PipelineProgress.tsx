import {
  Brain,
  Clapperboard,
  Download,
  Rocket,
  Scissors,
  Tags,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Projeto } from '@/types/models';
import { estaProntoPraYoutube } from '@/hooks/useProjetos';

// ─────────────────────────────────────────────────────────────
// Pipeline do projeto em 6 etapas.
//
// Duas apresentações, de propósito:
//   • `compact` (rail de projetos) → ÍCONES por etapa. Preferência explícita
//     do Paulo (validação D-394 item 10) — no rail o ícone diz QUAL etapa é
//     sem depender de tooltip. NÃO trocar por pontos.
//   • padrão (card da Biblioteca) → 6 pips coloridos, conforme o protótipo v3.
//
// A etapa "Pós" entrou nas duas: o pipeline real tem render final entre o
// Bruto e os Metadados, e ela faltava na versão antiga de 5 ícones.
// ─────────────────────────────────────────────────────────────

type EstadoEtapa = 'feito' | 'em-curso' | 'pendente';

const COR: Record<EstadoEtapa, string> = {
  feito: 'var(--wb-ok)',
  'em-curso': 'var(--wb-accent)',
  pendente: 'var(--wb-border)',
};

// Badge do ícone no rail: feito em ok-soft, em curso em acento cheio com
// glow, pendente esmaecido no inset.
const CLASSE_BADGE: Record<EstadoEtapa, string> = {
  feito: 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok-ink)]',
  'em-curso': 'bg-[var(--wb-accent)] text-[var(--wb-accent-fg)] shadow-[0_0_6px_var(--wb-accent)]',
  pendente: 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)] opacity-55',
};

interface Etapa {
  label: string;
  hint: string;
  estado: EstadoEtapa;
  Icon: LucideIcon;
}

/** Marca `feito` quando `feitos` cobre `alvo` (com alvo > 0); `em-curso` quando começou. */
function porContagem(feitos: number, alvo: number): EstadoEtapa {
  if (alvo > 0 && feitos >= alvo) return 'feito';
  if (feitos > 0) return 'em-curso';
  return 'pendente';
}

/**
 * Torna a tira monotônica: nenhuma etapa aparece "pendente" à esquerda de
 * uma etapa que já andou. Sem isto, a limpeza de mídia pesada (que apaga
 * artefatos intermediários) produzia leituras contraditórias — "Publicação
 * em curso" com "Bruto pendente" antes dela.
 */
function normalizarMonotonico(etapas: Etapa[]): Etapa[] {
  const ultimoAtivo = etapas.reduce(
    (ultimo, etapa, i) => (etapa.estado === 'pendente' ? ultimo : i),
    -1,
  );
  return etapas.map((etapa, i) =>
    i < ultimoAtivo && etapa.estado === 'pendente' ? { ...etapa, estado: 'feito' } : etapa,
  );
}

export function construirEtapas(projeto: Projeto): Etapa[] {
  const baixado = ['transcrevendo', 'pronto', 'analisando', 'analisado'].includes(projeto.status);
  const analisado = projeto.status === 'analisado' && projeto.total_cortes > 0;
  const alvo = projeto.total_aprovados;

  return normalizarMonotonico([
    {
      label: 'Baixado',
      Icon: Download,
      hint: 'Vídeo da live baixado e preparado',
      estado: baixado ? 'feito' : projeto.status === 'baixando' ? 'em-curso' : 'pendente',
    },
    {
      label: 'Analisado',
      Icon: Brain,
      hint: 'IA propôs os cortes a partir da transcrição',
      estado: analisado
        ? 'feito'
        : projeto.status === 'analisando' ||
            (projeto.status === 'pronto' && projeto.total_cortes === 0)
          ? 'em-curso'
          : 'pendente',
    },
    {
      label: 'Bruto',
      Icon: Scissors,
      hint: 'Cortes avaliados e aprovados no editor Bruto',
      // Sinal editorial (aprovados), não o arquivo `total_com_raw`: o raw é
      // apagado pela limpeza de mídia pesada, e um projeto já publicado
      // voltava a exibir "Bruto pendente".
      estado: porContagem(projeto.total_aprovados, projeto.total_cortes),
    },
    {
      label: 'Pós',
      Icon: Clapperboard,
      hint: 'Render final (cenas, grade e overlays) concluído',
      estado: porContagem(projeto.total_video_pronto, alvo),
    },
    {
      label: 'Metadados',
      Icon: Tags,
      hint: 'Títulos, descrições e capas prontos',
      estado: porContagem(projeto.total_com_meta, alvo),
    },
    {
      label: 'Publicação',
      Icon: Rocket,
      hint: 'Cortes publicados no YouTube',
      estado: estaProntoPraYoutube(projeto)
        ? 'feito'
        : projeto.total_publicados > 0
          ? 'em-curso'
          : 'pendente',
    },
  ]);
}

/** Rótulo curto de estado ao lado dos pips (protótipo: "em edição"/"publicado"). */
export function rotuloDeEstado(projeto: Projeto): { texto: string; cor: string } {
  if (estaProntoPraYoutube(projeto)) return { texto: 'publicado', cor: 'var(--wb-ok-ink)' };
  if (projeto.status === 'baixando') return { texto: 'baixando', cor: 'var(--wb-warn-ink)' };
  if (projeto.status === 'analisando') return { texto: 'analisando', cor: 'var(--wb-warn-ink)' };
  if (projeto.total_cortes === 0) return { texto: 'sem cortes', cor: 'var(--wb-text-mute)' };
  return { texto: 'em edição', cor: 'var(--wb-text-mute)' };
}

export function PipelineProgress({
  projeto,
  compact = false,
}: {
  projeto: Projeto;
  /** true = ícones por etapa (rail); false = 6 pips + rótulo (Biblioteca). */
  compact?: boolean;
}) {
  const etapas = construirEtapas(projeto);
  const rotulo = rotuloDeEstado(projeto);

  // Rail: ícones. O ícone identifica a etapa sem tooltip — preferência do
  // Paulo, mantida de propósito fora do protótipo v3.
  if (compact) {
    return (
      <div
        className="flex w-full items-center gap-1"
        role="list"
        aria-label="Progresso do pipeline"
      >
        {etapas.map(({ label, hint, estado, Icon }) => (
          <span
            key={label}
            role="listitem"
            aria-label={`${label}: ${estado}`}
            title={`${label} — ${hint}`}
            className={cn(
              'flex h-[21px] w-[21px] flex-none items-center justify-center rounded-full transition-all',
              CLASSE_BADGE[estado],
            )}
          >
            <Icon size={12} strokeWidth={2.2} aria-hidden />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-[5px]"
        role="list"
        aria-label="Progresso do pipeline"
        title={etapas.map((e) => e.label).join(' · ')}
      >
        {etapas.map((etapa) => (
          <span
            key={etapa.label}
            role="listitem"
            aria-label={`${etapa.label}: ${etapa.estado}`}
            title={`${etapa.label} — ${etapa.hint}`}
            className="h-2 w-2 flex-none rounded-full transition-colors"
            style={{ background: COR[etapa.estado] }}
          />
        ))}
      </div>
      <span className="font-code text-[9.5px] font-semibold" style={{ color: rotulo.cor }}>
        {rotulo.texto}
      </span>
    </div>
  );
}
