import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useAvisosDaCena, useAvisosDasCenas } from '@/features/editor/useCenas';
import { cn } from '@/lib/utils';
import type { CenaRemotion } from '@/types/models';
import { Icon } from '@/upgrade/Icon';
import { CenaItem } from './CenaItem';
import { ORIGENS, origensDoPlano, type OrigemNoPlano } from './planoDasCenas';
import { metaCena } from './sceneTypes';

// ─────────────────────────────────────────────────────────────────────────────
// CenaComOrigem (D-1018) — a cena da lista e, logo abaixo, de onde vem o que ela
// afirma: a frase literal, quem disse, a fonte e os avisos da conferência. Os
// avisos não bloqueiam nada e nada aqui reescreve a cena: quem decide é o operador.
// ─────────────────────────────────────────────────────────────────────────────

/** Os tipos que afirmam um fato: pedem fonte, mesmo quando a IA não trouxe nenhuma. */
const TIPOS_QUE_AFIRMAM = new Set<CenaRemotion['tipo']>([
  'destaque_numerico',
  'citacao_autor',
  'ficha_biografica',
  'marco_historico',
  'linha_tempo',
]);

const NOME_DE_QUEM_DISSE: Record<string, string> = {
  apresentador: 'apresentador',
  video_reagido: 'vídeo reagido',
};

type Props = Omit<ComponentProps<typeof CenaItem>, 'selo'> & {
  corteId: string;
  origem: OrigemNoPlano;
  onTrazerDeVolta: () => void;
};

export function CenaComOrigem({ corteId, origem, onTrazerDeVolta, ...props }: Props) {
  const avisos = useAvisosDaCena(corteId, props.cena);
  return (
    <PlanoDaCena origem={origem} cena={props.cena} onSeek={props.onSeek} onTrazerDeVolta={onTrazerDeVolta}>
      <CenaItem {...props} selo={<SeloDaOrigem origem={origem} />} />
      <OrigemDaCena cena={props.cena} avisos={avisos} onChange={props.onChange} />
    </PlanoDaCena>
  );
}

/** D-1070: a cor da origem na borda do card; a riscada encolhe para uma linha e pode voltar. */
export function PlanoDaCena({
  origem,
  cena,
  onSeek,
  onTrazerDeVolta,
  children,
}: {
  origem: OrigemNoPlano;
  cena: CenaRemotion;
  onSeek: (seg: number) => void;
  onTrazerDeVolta: () => void;
  children: ReactNode;
}) {
  const visual = ORIGENS[origem];
  if (origem === 'riscada') {
    return (
      <div
        data-origem="riscada"
        className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-dashed px-2.5 py-2"
        style={{ background: visual.soft, borderColor: visual.border }}
      >
        <button
          type="button"
          onClick={() => onSeek(cena.inicio)}
          className="min-w-0 flex-1 border-0 bg-transparent text-left"
          title="Ir para essa cena"
        >
          <span className="block font-code text-[11px] text-[var(--wb-text-dim)]">
            {cena.inicio.toFixed(1)}s → {cena.fim.toFixed(1)}s · {metaCena(cena.tipo).label} · fora do render
          </span>
          <s className="block truncate text-[12.5px] text-[var(--wb-text-mute)]">{cena.texto || metaCena(cena.tipo).label}</s>
        </button>
        <Button type="button" variant="outline" size="sm" onClick={onTrazerDeVolta}>
          <Icon name="undo-2" />
          Trazer de volta
        </Button>
      </div>
    );
  }
  return (
    <div data-origem={origem} className="border-l-[3px] pl-1" style={{ borderLeftColor: visual.border }}>
      {children}
    </div>
  );
}

export function SeloDaOrigem({ origem }: { origem: OrigemNoPlano }) {
  return (
    <span className="ml-1.5 flex-shrink-0 whitespace-nowrap font-sans font-semibold" style={{ color: ORIGENS[origem].color }}>
      · {ORIGENS[origem].rotulo}
    </span>
  );
}

/**
 * As origens para a linha do tempo, que recebe o corte da Pós pela onda (`waveformCorteId`).
 * Sem corte (a Revisão final, que nem tem cliente de consulta nos testes) não há plano, e
 * a linha do tempo pinta pelo tipo, como antes.
 */
export function ComOrigensDoPlano({
  corteId,
  cenas,
  children,
}: {
  corteId?: string;
  cenas: CenaRemotion[];
  children: (origens: OrigemNoPlano[] | null) => ReactNode;
}) {
  if (!corteId) return <>{children(null)}</>;
  return <OrigensDoCorte corteId={corteId} cenas={cenas}>{children}</OrigensDoCorte>;
}

function OrigensDoCorte({
  corteId,
  cenas,
  children,
}: {
  corteId: string;
  cenas: CenaRemotion[];
  children: (origens: OrigemNoPlano[]) => ReactNode;
}) {
  const avisos = useAvisosDasCenas(corteId);
  return <>{children(origensDoPlano(cenas, avisos))}</>;
}

/** A legenda das cores, igual no painel e na linha do tempo. */
export function LegendaDaOrigem({ className }: { className?: string }) {
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--wb-text-mute)]', className)}>
      {(Object.keys(ORIGENS) as OrigemNoPlano[]).map((origem) => (
        <span key={origem} className="inline-flex items-center gap-1">
          <span
            aria-hidden
            className={cn('inline-block h-2.5 w-2.5 rounded-[2px] border', ORIGENS[origem].tracejada && 'border-dashed')}
            style={{ background: ORIGENS[origem].soft, borderColor: ORIGENS[origem].border }}
          />
          {ORIGENS[origem].legenda}
        </span>
      ))}
    </div>
  );
}

export function OrigemDaCena({
  cena,
  avisos,
  onChange,
}: {
  cena: CenaRemotion;
  avisos: string[];
  onChange: (next: CenaRemotion) => void;
}) {
  const afirma = TIPOS_QUE_AFIRMAM.has(cena.tipo) || Boolean(cena.fonte);
  if (!afirma && !cena.frase_da_fala && avisos.length === 0) return null;
  const quemDisse = cena.quem_disse ? (NOME_DE_QUEM_DISSE[cena.quem_disse] ?? cena.quem_disse) : null;

  return (
    <div className="flex flex-col gap-1 px-2.5 pb-1 pt-1 text-[11px] leading-snug">
      {avisos.map((aviso) => (
        <p key={aviso} className="flex items-start gap-1.5 text-[var(--wb-warn)]">
          <Icon name="triangle-alert" className="mt-px flex-shrink-0" />
          <span>{aviso}</span>
        </p>
      ))}
      {cena.ancora_perdida && (
        <button
          type="button"
          onClick={() => onChange({ ...cena, ancora_perdida: undefined, frase_ancora: undefined })}
          className="self-start text-[var(--wb-text-mute)] underline"
        >
          Manter a cena aqui
        </button>
      )}
      {cena.frase_da_fala && (
        <p className="text-[var(--wb-text-mute)]">
          “{cena.frase_da_fala}”{quemDisse && <span className="text-[var(--wb-text-dim)]"> — {quemDisse}</span>}
        </p>
      )}
      {afirma && (
        <label className="flex items-center gap-1.5 text-[var(--wb-text-dim)]">
          <span className="font-code text-[11px] font-bold uppercase tracking-[0.08em]">Fonte</span>
          <input
            type="text"
            value={cena.fonte ?? ''}
            onChange={(e) => onChange({ ...cena, fonte: e.target.value || undefined })}
            placeholder="Só o que você conferiu"
            className="h-[22px] min-w-0 flex-1 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-1.5 text-[11px] text-[var(--wb-text)]"
          />
        </label>
      )}
    </div>
  );
}
