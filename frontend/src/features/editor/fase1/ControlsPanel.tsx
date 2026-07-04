import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3 } from 'lucide-react';
import {
  calcularDuracaoLiquida,
  hmsParaSeg,
  segParaHms,
  segParaMmSs,
  validarHms,
} from '../timeUtils';
import type { Desvio } from '@/types/models';
import { IconButton } from '@/components/ui/icon-button';

interface Props {
  inicioHms: string;
  fimHms: string;
  inicioSeg: number;
  fimSeg: number;
  currentTime: number;
  desvios?: Desvio[];
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onChangeInicio: (novoHms: string, novoSeg: number) => void;
  onChangeFim: (novoHms: string, novoSeg: number) => void;
}

export function ControlsPanel({
  inicioHms,
  fimHms,
  inicioSeg,
  fimSeg,
  currentTime,
  desvios,
  collapsed,
  onToggleCollapsed,
  onChangeInicio,
  onChangeFim,
}: Props) {
  const [inicioLocal, setInicioLocal] = useState(inicioHms);
  const [fimLocal, setFimLocal] = useState(fimHms);
  const [inicioErro, setInicioErro] = useState(false);
  const [fimErro, setFimErro] = useState(false);

  useEffect(() => setInicioLocal(inicioHms), [inicioHms]);
  useEffect(() => setFimLocal(fimHms), [fimHms]);

  const duracao = Math.max(0, fimSeg - inicioSeg);
  const tempoNoCorte = Math.max(0, currentTime - inicioSeg);
  const duracaoLiquida = useMemo(
    () => calcularDuracaoLiquida(inicioSeg, fimSeg, desvios ?? []),
    [inicioSeg, fimSeg, desvios],
  );
  const temTrechos = (desvios?.length ?? 0) > 0 && duracaoLiquida !== duracao;

  function commitInicio() {
    if (!validarHms(inicioLocal)) {
      setInicioErro(true);
      return;
    }
    setInicioErro(false);
    onChangeInicio(inicioLocal, hmsParaSeg(inicioLocal));
  }

  function commitFim() {
    if (!validarHms(fimLocal)) {
      setFimErro(true);
      return;
    }
    setFimErro(false);
    onChangeFim(fimLocal, hmsParaSeg(fimLocal));
  }

  if (collapsed) {
    return (
      <section className="flex h-full min-h-0 items-center overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-3 py-1.5">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-[11px] font-semibold text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]"
          aria-label="Mostrar tempos"
          title="Mostrar tempos"
        >
          <Clock3 size={13} aria-hidden />
          <span className="font-code uppercase tracking-[0.12em]">Tempos ocultos</span>
          <ChevronDown size={13} aria-hidden />
        </button>
      </section>
    );
  }

  return (
    <section className="flex h-full items-center gap-2 overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-3">
      <div className="grid w-full grid-cols-[minmax(96px,0.7fr)_minmax(96px,0.7fr)_minmax(120px,0.85fr)_minmax(260px,1.7fr)] gap-2.5">
        <InfoCell label="No corte" value={segParaMmSs(tempoNoCorte, true)} />
        <InfoCell
          label="Duração"
          value={segParaMmSs(duracao, true)}
          subValue={temTrechos ? segParaMmSs(duracaoLiquida, true) : undefined}
          subValueTitle="Tempo líquido (após remover trechos)"
        />
        <InfoCell label="No original" value={segParaHms(currentTime, true)} />
        <IntervalCell
          inicioValue={inicioLocal}
          fimValue={fimLocal}
          inicioInvalid={inicioErro}
          fimInvalid={fimErro}
          onChangeInicio={setInicioLocal}
          onChangeFim={setFimLocal}
          onCommitInicio={commitInicio}
          onCommitFim={commitFim}
        />
      </div>
      <IconButton
        size="sm"
        variant="outline"
        onClick={onToggleCollapsed}
        aria-label="Ocultar tempos"
        title="Ocultar tempos"
      >
        <ChevronUp aria-hidden />
      </IconButton>
    </section>
  );
}

function InfoCell({
  label,
  value,
  subValue,
  subValueTitle,
}: {
  label: string;
  value: string;
  subValue?: string;
  subValueTitle?: string;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
      <span className="block font-code text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[var(--wb-text-dim)]">
        {label}
      </span>
      <div className="mt-1 flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate font-code text-sm font-medium text-[var(--wb-text)]">
          {value}
        </span>
        {subValue && (
          <span
            title={subValueTitle}
            className="shrink-0 rounded-[var(--radius-xs)] bg-emerald-400 px-1.5 py-0.5 font-code text-[10.5px] font-bold text-emerald-950"
          >
            ≈ {subValue}
          </span>
        )}
      </div>
    </div>
  );
}

function IntervalCell({
  inicioValue,
  fimValue,
  inicioInvalid,
  fimInvalid,
  onChangeInicio,
  onChangeFim,
  onCommitInicio,
  onCommitFim,
}: {
  inicioValue: string;
  fimValue: string;
  inicioInvalid: boolean;
  fimInvalid: boolean;
  onChangeInicio: (value: string) => void;
  onChangeFim: (value: string) => void;
  onCommitInicio: () => void;
  onCommitFim: () => void;
}) {
  return (
    <div className="min-w-0 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
      <span className="block font-code text-[9.5px] font-semibold uppercase tracking-[0.18em] text-[var(--wb-text-dim)]">
        Intervalo
      </span>
      <div className="mt-1 flex min-w-0 items-center gap-1.5">
        <TimeInput
          ariaLabel="Início do intervalo"
          value={inicioValue}
          invalid={inicioInvalid}
          onChange={onChangeInicio}
          onCommit={onCommitInicio}
        />
        <span className="shrink-0 font-code text-[11px] font-semibold text-[var(--wb-text-dim)]">
          -&gt;
        </span>
        <TimeInput
          ariaLabel="Fim do intervalo"
          value={fimValue}
          invalid={fimInvalid}
          onChange={onChangeFim}
          onCommit={onCommitFim}
        />
      </div>
    </div>
  );
}

function TimeInput({
  ariaLabel,
  value,
  invalid,
  onChange,
  onCommit,
}: {
  ariaLabel: string;
  value: string;
  invalid: boolean;
  onChange: (value: string) => void;
  onCommit: () => void;
}) {
  return (
    <input
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onCommit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className={`h-6 min-w-0 flex-1 rounded-[var(--radius-xs)] border bg-[var(--wb-bg-panel)] px-2 font-code text-[12px] font-medium text-[var(--wb-text)] outline-none focus:ring-2 focus:ring-[var(--wb-focus)] ${invalid ? 'border-error' : 'border-[var(--wb-border)]'}`}
    />
  );
}
