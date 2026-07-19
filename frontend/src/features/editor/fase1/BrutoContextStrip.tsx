import { useEffect, useState } from 'react';
import { ChevronsLeft, ChevronsRight, Clock3, Edit3, Scissors } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { segParaHms, segParaMmSs, validarHms } from '../timeUtils';

// ─────────────────────────────────────────────────────────────
// BrutoContextStrip — replica `design_reference/src/v2_bruto.jsx:17-203`.
// Faixa horizontal entre CommonTopBar e o grid do EditorFase1.
// Substitui o antigo `ControlsPanel`.
//
// Da esquerda p/ direita:
//   1. Card "FIM ANTERIOR #N" + timecode
//   2. Bloco No corte / No original / Dur (3 cells com divisores) + botao "Intervalo"
//   3. (condicional) Card accent-soft com 2 inputs + Aplicar
//   4. spacer
//   5. "Liquido (sem trechos)" + timecode --wb-ok
//   6. Card "INICIO PROX #N" + timecode
//
// `variant="workbench"` (AUDITORIA-v2 §6, CP6) — painel "Tempos" oculto por
// padrao (toggle 🕑 na toolbar): grid de 6 campos (linha 1) + titulo/trechos/
// botao Intervalo (linha 2, hospeda o que antes vivia solto no EditorPage).
// `variant="legacy"` (default) preserva o layout/logica atuais (CommonTopBar).
// ─────────────────────────────────────────────────────────────

interface PrevNextCut {
  numero: number;
  /** Timecode formatado HH:MM:SS.s */
  hms: string;
}

interface BrutoContextStripProps {
  previous?: PrevNextCut | null;
  next?: PrevNextCut | null;
  inicioHms: string;
  fimHms: string;
  /** Inicio do corte em segundos (origem do tempo relativo "No corte"). */
  inicioSeg: number;
  /** Tempo corrente do player em segundos (relativo ao video original). */
  currentTime: number;
  /** Duracao bruta em segundos (fim - inicio) */
  durSeg: number;
  /** Duracao liquida em segundos (apos remover desvios) */
  liquidoSeg: number;
  /** Mostra o editor de intervalo manual (2 inputs + Aplicar). */
  intervaloAberto: boolean;
  onToggleIntervalo: () => void;
  /** Aplicar manualmente novo intervalo. Chamado quando o usuario clica
   *  em "Aplicar" no editor expansivel. */
  onAplicarIntervalo?: (novoInicioHms: string, novoFimHms: string) => void;
  /** AUDITORIA-v2 §6 (CP6): 'legacy' (default) preserva o layout atual do
   *  CommonTopBar. 'workbench' é o painel "Tempos" novo (grid + titulo). */
  variant?: 'legacy' | 'workbench';
  /** Só em variant='workbench': titulo do corte (linha 2) + binding existente
   *  (a mutation continua no EditorPage — este componente so exibe/edita). */
  titulo?: string;
  onChangeTitulo?: (titulo: string) => void;
  /** Só em variant='workbench': contagem de desvios (linha 2, "N desvios"). */
  trechosCount?: number;
}

export function BrutoContextStrip({
  previous,
  next,
  inicioHms,
  fimHms,
  inicioSeg,
  currentTime,
  durSeg,
  liquidoSeg,
  intervaloAberto,
  onToggleIntervalo,
  onAplicarIntervalo,
  variant = 'legacy',
  titulo,
  onChangeTitulo,
  trechosCount = 0,
}: BrutoContextStripProps) {
  if (variant === 'workbench') {
    return (
      <div className="flex flex-none flex-col gap-[7px] rounded-[10px] border border-[var(--wb-border)] bg-[var(--wb-bg-panel)] p-2.5">
        {/* Linha 1 — grid de 6 campos (AUDITORIA-v2 §6). */}
        <div className="grid grid-cols-6 gap-2">
          <MetricField label="Fim anterior" value={previous?.hms ?? '—'} muted={!previous} />
          <MetricField
            label="No corte"
            value={segParaMmSs(Math.max(0, currentTime - inicioSeg), true)}
          />
          <MetricField
            label="No original"
            value={segParaHms(Math.max(0, currentTime), true)}
            fontSize={10.5}
          />
          <MetricField label="Duração" value={segParaMmSs(Math.max(0, durSeg), true)} />
          <MetricField
            label="Líquido s/ tr."
            title="líquido sem trechos"
            value={segParaMmSs(Math.max(0, liquidoSeg), true)}
            tone="ok"
          />
          <MetricField label="Início próx" value={next?.hms ?? '—'} muted={!next} />
        </div>

        {/* Linha 2 — titulo do corte + trechos + botao Intervalo (era um
            bloco solto no EditorPage; migrou pra dentro do painel Tempos). */}
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-[200px] flex-1 flex-col gap-[3px]">
            <span className="font-code text-[8px] font-extrabold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
              Título do corte
            </span>
            <input
              value={titulo ?? ''}
              onChange={(event) => onChangeTitulo?.(event.target.value)}
              className="overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-[var(--wb-bg-inset)] px-[9px] py-1.5 text-[11.5px] font-semibold text-[var(--wb-text)] outline-none focus:ring-2 focus:ring-[var(--wb-focus)]"
            />
          </label>
          <div className="flex flex-none flex-col gap-[3px]">
            <span className="font-code text-[8px] font-extrabold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
              Trechos
            </span>
            <span className="rounded-md bg-[var(--wb-bg-inset)] px-[9px] py-1.5 font-code text-[11px] font-semibold text-[var(--wb-text)]">
              {trechosCount} desvios
            </span>
          </div>
          <button
            type="button"
            onClick={onToggleIntervalo}
            title={intervaloAberto ? 'Ocultar intervalo editável' : 'Editar intervalo do corte (in/out)'}
            className="flex h-[34px] flex-none items-center gap-1.5 rounded-[7px] border border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] px-3.5 text-[11px] font-extrabold text-[var(--wb-accent)]"
          >
            <Scissors size={13} aria-hidden />
            Intervalo
          </button>
        </div>

        {intervaloAberto && onAplicarIntervalo && (
          <IntervaloEditor
            inicioHms={inicioHms}
            fimHms={fimHms}
            currentTime={currentTime}
            onAplicar={onAplicarIntervalo}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-shrink-0 items-center gap-3 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-4 py-2.5">
      {/* Card "FIM ANTERIOR #N" — v2_bruto.jsx:31-51 */}
      <PrevCard previous={previous} />

      {/* Bloco NO CORTE / NO ORIGINAL / DUR + botao Intervalo.
          IN/OUT removidos: redundantes com o editor Intervalo (mesmos valores).
          "No corte" = currentTime relativo ao inicio do corte.
          "No original" = currentTime absoluto no video completo. */}
      <div className="flex items-stretch overflow-hidden rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)]">
        <TimeCell
          label="No corte"
          value={segParaMmSs(Math.max(0, currentTime - inicioSeg), true)}
        />
        <TimeCell label="No original" value={segParaHms(Math.max(0, currentTime), true)} />
        <TimeCell label="DUR" value={segParaMmSs(Math.max(0, durSeg), true)} />
        <button
          type="button"
          onClick={onToggleIntervalo}
          title={intervaloAberto ? 'Ocultar intervalo editavel' : 'Editar intervalo manualmente'}
          className={cn(
            'flex items-center gap-1 px-2.5 text-[11px] font-semibold transition-colors',
            intervaloAberto
              ? 'bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
              : 'text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
          )}
        >
          <Edit3 size={12} aria-hidden />
          Intervalo
        </button>
      </div>

      {/* Editor expansivel — v2_bruto.jsx:113-165 */}
      {intervaloAberto && onAplicarIntervalo && (
        <IntervaloEditor
          inicioHms={inicioHms}
          fimHms={fimHms}
          currentTime={currentTime}
          onAplicar={onAplicarIntervalo}
        />
      )}

      <div className="flex-1" />

      {/* Liquido — v2_bruto.jsx:169-177 */}
      <div className="flex flex-col items-end leading-tight">
        <span className="font-code text-[9px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
          Liquido (sem trechos)
        </span>
        <span
          className="font-code text-[12.5px] font-bold text-[var(--wb-ok)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {segParaMmSs(Math.max(0, liquidoSeg), true)}
        </span>
      </div>

      {/* Card "INICIO PROX #N" — v2_bruto.jsx:179-200 */}
      <NextCard next={next} />
    </div>
  );
}

/** Campo do grid de 6 colunas do painel "Tempos" (variant='workbench'). */
function MetricField({
  label,
  value,
  title,
  muted,
  tone,
  fontSize,
}: {
  label: string;
  value: string;
  title?: string;
  /** Sem dado real (placeholder "—") — usa texto --wb-text-mute. */
  muted?: boolean;
  /** 'ok' = destaque do líquido (--wb-ok-soft/--wb-ok-ink). */
  tone?: 'ok';
  fontSize?: number;
}) {
  return (
    <div className="min-w-0">
      <div
        className="mb-[3px] overflow-hidden text-ellipsis whitespace-nowrap font-code text-[8px] font-extrabold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]"
        title={title}
      >
        {label}
      </div>
      <div
        className={cn(
          'overflow-hidden text-ellipsis whitespace-nowrap rounded-md px-[7px] py-[5px] font-code',
          tone === 'ok'
            ? 'bg-[var(--wb-ok-soft)] font-bold text-[var(--wb-ok-ink)]'
            : cn('bg-[var(--wb-bg-inset)] font-semibold', muted ? 'text-[var(--wb-text-mute)]' : 'text-[var(--wb-text)]'),
        )}
        style={{ fontVariantNumeric: 'tabular-nums', fontSize: fontSize ? `${fontSize}px` : '11px' }}
      >
        {value}
      </div>
    </div>
  );
}

function TimeCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-r border-[var(--wb-border-soft)] px-3 py-1 last:border-r-0">
      <div className="font-code text-[9px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
        {label}
      </div>
      <div
        className="font-code text-[12.5px] font-bold leading-tight text-[var(--wb-text)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

function PrevCard({ previous }: { previous?: PrevNextCut | null }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-2.5 py-1">
      <ChevronsLeft size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
      <div className="leading-tight">
        <div className="font-code text-[9px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
          Fim anterior{' '}
          {previous ? <span style={{ color: 'var(--wb-ok)' }}>#{previous.numero}</span> : '—'}
        </div>
        <div
          className="font-code text-[12.5px] font-bold text-[var(--wb-text)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {previous?.hms ?? '—'}
        </div>
      </div>
    </div>
  );
}

function NextCard({ next }: { next?: PrevNextCut | null }) {
  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-2.5 py-1">
      <div className="text-right leading-tight">
        <div className="font-code text-[9px] uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
          Inicio prox {next ? <span style={{ color: 'var(--wb-info)' }}>#{next.numero}</span> : '—'}
        </div>
        <div
          className="font-code text-[12.5px] font-bold text-[var(--wb-text)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {next?.hms ?? '—'}
        </div>
      </div>
      <ChevronsRight size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
    </div>
  );
}

function IntervaloEditor({
  inicioHms,
  fimHms,
  currentTime,
  onAplicar,
}: {
  inicioHms: string;
  fimHms: string;
  currentTime: number;
  onAplicar: (novoInicio: string, novoFim: string) => void;
}) {
  const [inicio, setInicio] = useState(inicioHms);
  const [fim, setFim] = useState(fimHms);
  useEffect(() => {
    setInicio(inicioHms);
    setFim(fimHms);
  }, [inicioHms, fimHms]);

  const valido = validarHms(inicio) && validarHms(fim);
  const currentTimeHms = segParaHms(Math.max(0, currentTime), true);

  return (
    <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] px-2.5 py-1.5">
      <div className="flex items-center gap-1">
        <input
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="h-6 w-[92px] rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-1.5 font-code text-[12px] font-semibold text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          aria-label="Inicio do intervalo"
        />
        <CurrentTimeButton
          ariaLabel="Usar tempo atual no inicio"
          title="Usar tempo atual no inicio"
          onClick={() => setInicio(currentTimeHms)}
        />
      </div>
      <span className="font-code text-[12px] font-bold text-[var(--wb-accent)]">→</span>
      <div className="flex items-center gap-1">
        <input
          value={fim}
          onChange={(e) => setFim(e.target.value)}
          className="h-6 w-[92px] rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-1.5 font-code text-[12px] font-semibold text-[var(--wb-text)] outline-none focus:border-[var(--wb-accent)]"
          style={{ fontVariantNumeric: 'tabular-nums' }}
          aria-label="Fim do intervalo"
        />
        <CurrentTimeButton
          ariaLabel="Usar tempo atual no fim"
          title="Usar tempo atual no fim"
          onClick={() => setFim(currentTimeHms)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        variant="default"
        onClick={() => valido && onAplicar(inicio, fim)}
        disabled={!valido}
      >
        Aplicar
      </Button>
    </div>
  );
}

function CurrentTimeButton({
  ariaLabel,
  title,
  onClick,
}: {
  ariaLabel: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] transition-colors hover:border-[var(--wb-accent)] hover:text-[var(--wb-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
    >
      <Clock3 size={12} aria-hidden />
    </button>
  );
}
