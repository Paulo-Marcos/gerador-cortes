/**
 * Subcomponentes de apresentação do YoutubeLayoutPanel (E-006).
 * Extraídos da fachada; recebem tudo por props (sem estado do painel).
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  ChevronDown,
  Flag,
  Folder,
  Globe,
  Minus,
  Plus,
  RotateCw,
  Scissors,
  Trash2,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LayoutPreset, LayoutPresetTipo } from '@/types/presets';
import { segParaMmSs } from '../../timeUtils';
import { DefinirSplitButton } from '../DefinirSplitButton';
import type { YoutubeLayoutMode, YoutubeLayoutRegion } from '../youtubeLayout';
import { MODE_LABEL, clamp, round } from './shared';

// Collapsible removido (F-060): as secoes Fundo/Placa migraram para o modal
// de posicionamento — fundo e placa agora pertencem ao preset/escopo.

// ─── DefinirPadroesCard · F-048 ────────────────────────────────────────
// Card que substituiu o antigo PadraoLayoutCard. 3 linhas (Corte / Projeto /
// Global) — cada uma com SplitButton "Definir ▾" que abre o
// PosicionamentoModal ou aplica preset via dropdown. Sem botao "Usar":
// aplicacao do escopo correto e automatica no preview (cascade lazy).
export function DefinirPadroesCard({
  open,
  onToggle,
  label,
  usando,
  modo,
  onChangeModo,
  corteDefinido,
  projetoDefinido,
  globalDefinido,
  segmentoPadraoDefinido,
  presetCorteNome,
  presetProjetoNome,
  presetGlobalNome,
  presetSegmentoPadraoNome,
  onDefinirCorte,
  onDefinirProjeto,
  onDefinirGlobal,
  onDefinirSegmentoPadrao,
  onPresetCorte,
  onPresetProjeto,
  onPresetGlobal,
  onPresetSegmentoPadrao,
  onResetSegmentoPadrao,
  pendingProjeto,
  pendingGlobal,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  usando: 'projeto' | 'global' | 'custom';
  /** F-060: qual modo esta sendo definido (Full | Compartilhada). */
  modo: YoutubeLayoutMode;
  onChangeModo: (modo: YoutubeLayoutMode) => void;
  corteDefinido: boolean;
  projetoDefinido: boolean;
  globalDefinido: boolean;
  segmentoPadraoDefinido: boolean;
  presetCorteNome: string | null;
  presetProjetoNome: string | null;
  presetGlobalNome: string | null;
  presetSegmentoPadraoNome: string | null;
  onDefinirCorte: () => void;
  onDefinirProjeto: () => void;
  onDefinirGlobal: () => void;
  onDefinirSegmentoPadrao: () => void;
  onPresetCorte: (preset: LayoutPreset) => void;
  onPresetProjeto: (preset: LayoutPreset) => void;
  onPresetGlobal: (preset: LayoutPreset) => void;
  onPresetSegmentoPadrao: (preset: LayoutPreset) => void;
  onResetSegmentoPadrao: () => void;
  pendingProjeto: boolean;
  pendingGlobal: boolean;
}) {
  const chipTone =
    usando === 'projeto'
      ? 'var(--wb-info)'
      : usando === 'global'
        ? 'var(--wb-violet)'
        : 'var(--wb-text-dim)';
  const presetTipo: LayoutPresetTipo = modo === 'full' ? 'posicionamento_full' : 'posicionamento';
  return (
    <section
      className="rounded-[var(--radius-sm)] border"
      style={{
        background: 'color-mix(in oklch, var(--wb-accent) 5%, var(--wb-bg-card))',
        borderColor: 'color-mix(in oklch, var(--wb-accent) 30%, var(--wb-border))',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 border-0 bg-transparent px-3 py-2 text-left transition-opacity hover:opacity-90"
      >
        <Flag size={12} className="flex-shrink-0 text-[var(--wb-accent)]" />
        <strong className="text-[12px] font-bold text-[var(--wb-ink)]">Definir padrões</strong>
        <span
          className="rounded-full px-2 py-0.5 font-code text-[9.5px] font-bold uppercase tracking-[0.04em]"
          style={{
            background: 'color-mix(in oklch, ' + chipTone + ' 14%, transparent)',
            color: chipTone,
          }}
        >
          {label}
        </span>
        <div className="flex-1" />
        <ChevronDown
          size={13}
          className="text-[var(--wb-text-dim)] transition-transform"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>
      {open && (
        <div className="border-t border-[var(--wb-border-soft)] p-3">
          <p className="mb-2.5 text-[10.5px] leading-snug text-[var(--wb-text-mute)]">
            Cada nível define o posicionamento desse escopo (e fundo + placa em
            Corte/Projeto/Global). A prioridade é{' '}
            <strong>segmento &gt; segmento (padrão) &gt; corte &gt; projeto &gt; global</strong>.
          </p>

          {/* F-060: alterna entre definir o posicionamento Full ou Compartilhada. */}
          <div className="mb-2.5 flex items-center gap-2">
            <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
              Definindo
            </span>
            <div className="inline-flex items-center overflow-hidden rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)]">
              {(['full', 'compartilhada'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onChangeModo(m)}
                  aria-pressed={modo === m}
                  className={cn(
                    'h-6 px-2 font-code text-[10px] font-bold uppercase tracking-[0.04em] transition-colors',
                    modo === m
                      ? 'bg-[var(--wb-accent)] text-white'
                      : 'bg-transparent text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
                  )}
                >
                  {MODE_LABEL[m]}
                </button>
              ))}
            </div>
          </div>

          <DefinirScopeRow
            title="Corte"
            icon={Scissors}
            tone="var(--wb-accent)"
            definido={corteDefinido}
            presetNome={presetCorteNome}
            presetTipo={presetTipo}
            onDefinir={onDefinirCorte}
            onPreset={onPresetCorte}
            pendingDefinir={false}
          />
          <DefinirScopeRow
            title="Segmento (padrão deste corte)"
            icon={Flag}
            tone="var(--wb-violet)"
            definido={segmentoPadraoDefinido}
            presetNome={presetSegmentoPadraoNome}
            presetTipo={presetTipo}
            onDefinir={onDefinirSegmentoPadrao}
            onPreset={onPresetSegmentoPadrao}
            onReset={segmentoPadraoDefinido ? onResetSegmentoPadrao : undefined}
            pendingDefinir={false}
          />
          <DefinirScopeRow
            title="Projeto"
            icon={Folder}
            tone="var(--wb-info)"
            definido={projetoDefinido}
            presetNome={presetProjetoNome}
            presetTipo={presetTipo}
            onDefinir={onDefinirProjeto}
            onPreset={onPresetProjeto}
            pendingDefinir={pendingProjeto}
          />
          <DefinirScopeRow
            title="Global"
            icon={Globe}
            tone="var(--wb-violet)"
            definido={globalDefinido}
            presetNome={presetGlobalNome}
            presetTipo={presetTipo}
            onDefinir={onDefinirGlobal}
            onPreset={onPresetGlobal}
            pendingDefinir={pendingGlobal}
          />
        </div>
      )}
    </section>
  );
}

function DefinirScopeRow({
  title,
  icon: Icon,
  definido,
  presetNome,
  presetTipo,
  tone,
  onDefinir,
  onPreset,
  onReset,
  pendingDefinir,
}: {
  title: string;
  icon: typeof Folder;
  /** Tem JSON salvo neste escopo (i.e. nao herda do nivel acima). */
  definido: boolean;
  /** Nome do preset salvo que bate com o config atual deste escopo. */
  presetNome: string | null;
  /** F-060: tipo de preset listado no dropdown (por modo). */
  presetTipo: LayoutPresetTipo;
  tone: string;
  onDefinir: () => void;
  onPreset: (preset: LayoutPreset) => void;
  /** Opcional: limpa este escopo (usado pelo Segmento padrao p/ destrarvar). */
  onReset?: () => void;
  pendingDefinir: boolean;
}) {
  let subtitulo: string;
  if (!definido) subtitulo = 'Sem preset (herda do nível acima)';
  else if (presetNome) subtitulo = `Preset: ${presetNome}`;
  else subtitulo = 'Personalizado (não bate com preset salvo)';

  return (
    <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] p-2 last:mb-0">
      <span
        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: 'color-mix(in oklch, ' + tone + ' 18%, transparent)', color: tone }}
      >
        <Icon size={13} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-bold text-[var(--wb-text)]">{title}</div>
        <div className="truncate font-code text-[10px] text-[var(--wb-text-dim)]" title={subtitulo}>
          {subtitulo}
        </div>
      </div>
      <DefinirSplitButton
        label="Definir"
        onOpenModal={onDefinir}
        onApplyPreset={onPreset}
        presetTipo={presetTipo}
        pending={pendingDefinir}
      />
      {onReset && (
        <Tooltip label="Remover este padrão (volta a herdar)" side="left">
          <button
            type="button"
            onClick={onReset}
            aria-label="Remover padrao"
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-err-soft)] hover:text-[var(--wb-err)]"
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

export function PadraoAtualChip({
  escopo,
  presetNome,
}: {
  escopo: 'corte' | 'projeto' | 'global' | 'default';
  presetNome: string | null;
}) {
  const TONE: Record<typeof escopo, string> = {
    corte: 'var(--wb-accent)',
    projeto: 'var(--wb-info)',
    global: 'var(--wb-violet)',
    default: 'var(--wb-text-dim)',
  };
  const LABEL: Record<typeof escopo, string> = {
    corte: 'Corte',
    projeto: 'Projeto',
    global: 'Global',
    default: 'Default',
  };
  const tone = TONE[escopo];
  const sub =
    escopo === 'default'
      ? 'sem padrão salvo — usa fallback padrão da app'
      : presetNome
        ? `preset "${presetNome}"`
        : 'personalizado neste nível';
  return (
    <span
      className="inline-flex items-center gap-1 truncate rounded-full px-2 py-0.5 font-code text-[9.5px] font-bold uppercase tracking-[0.04em]"
      style={{ background: 'color-mix(in oklch, ' + tone + ' 14%, transparent)', color: tone }}
      title={`Vem do escopo ${LABEL[escopo]} — ${sub}`}
    >
      {LABEL[escopo]} · {sub}
    </span>
  );
}

// (LayoutSubLabel removido: os titulos das secoes viraram parte do
// componente Collapsible.)

// ─── InlineModeToggle — linha unica compacta (decisao Paulo) ──────
// Caption a esquerda + segmented 2 pilulas a direita. Substitui o
// ProjectTypeToggle vertical e o grid 2-col de ModePicker grande
// (ambos ocupavam muita altura desnecessaria no header).
export function InlineModeToggle({
  label,
  hint,
  value,
  pending,
  onChange,
  herdando = false,
  herdandoDe,
}: {
  label: string;
  hint?: string;
  value: YoutubeLayoutMode;
  pending?: boolean;
  onChange: (modo: YoutubeLayoutMode) => void;
  /** I-025: quando true, nenhuma pílula fica pressed e exibe chip "herdando do projeto: X". */
  herdando?: boolean;
  herdandoDe?: YoutubeLayoutMode;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <Flag size={10} className="flex-shrink-0 text-[var(--wb-accent)]" />
        <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
          {label}
        </span>
        {herdando && herdandoDe ? (
          <span className="truncate font-code text-[9px] text-[var(--wb-text-faint)]">
            · herdando do projeto: {MODE_LABEL[herdandoDe]}
          </span>
        ) : hint ? (
          <span className="truncate font-code text-[9px] text-[var(--wb-text-faint)]">
            · {hint}
          </span>
        ) : null}
      </div>
      <div className="inline-flex items-center overflow-hidden rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)]">
        {(['full', 'compartilhada'] as const).map((m) => {
          const pressed = !herdando && value === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              disabled={pending}
              aria-pressed={pressed}
              className={cn(
                'h-6 px-2 font-code text-[10px] font-bold uppercase tracking-[0.04em] transition-colors disabled:cursor-wait disabled:opacity-60',
                pressed
                  ? 'bg-[var(--wb-accent)] text-white'
                  : 'bg-transparent text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              {MODE_LABEL[m]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// SharedScreenCountToggle e ModePicker movidos para ./posicionamentoControls.tsx
// FundoPicker removido (F-060): o seletor de fundo migrou para o modal de
// posicionamento (PosicionamentoModal).

// ─── SceneStat (replica do utilizado em CenasPanel) ───────────────
export function SceneStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] px-2 py-1.5">
      <div className="font-code text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
        {label}
      </div>
      <div
        className="mt-0.5 font-code text-[11.5px] text-[var(--wb-text)]"
        style={{ fontVariantNumeric: 'tabular-nums' }}
      >
        {value}
      </div>
    </div>
  );
}

// PlacaField removido (F-060): a edicao da placa migrou para o modal de
// posicionamento (PosicionamentoModal).

// PadraoLayoutGroup REMOVIDO: substituido por PadraoLayoutCard + PadraoScopeRow
// (decisao Paulo: hierarquia compacta com 4 acoes Projeto/Global, modal de
// confirmacao). Veja a definicao mais acima neste arquivo.

// ─── RegionItem ────────────────────────────────────────────────
// F-049: pares de botões ± de ajuste fino (passo FINE_STEP_SEG) ao redor
// dos campos Início/Fim. Cada clique ajusta a borda da região E faz seek
// no player para o novo tempo, permitindo ver o quadro exato.
const FINE_STEP_SEG = 0.1;

export function RegionItem({
  region,
  active,
  duration,
  presetEmUsoNome,
  onSeek,
  onSeekTo,
  onRemove,
  onChangeInicio,
  onChangeFim,
  onChangeModo,
  onClearOverride,
  onAbrirPosicionamento,
  onAplicarPresetSegmento,
}: {
  region: YoutubeLayoutRegion;
  active: boolean;
  duration: number;
  presetEmUsoNome: string | null;
  onSeek: () => void;
  onSeekTo: (seg: number) => void;
  onRemove: () => void;
  onChangeInicio: (seg: number) => void;
  onChangeFim: (seg: number) => void;
  onChangeModo: (modo: YoutubeLayoutMode) => void;
  /** F-060: limpa o override de posicionamento da regiao (volta a herdar). */
  onClearOverride: () => void;
  onAbrirPosicionamento: () => void;
  onAplicarPresetSegmento: (preset: LayoutPreset) => void;
}) {
  const isShared = region.modo === 'compartilhada';
  const color = isShared ? 'var(--wb-info)' : 'var(--wb-violet)';
  // F-060: regioes full tambem tem override de posicionamento ({crop, slot}).
  const hasOverride = isShared
    ? region.compartilhada !== undefined && Object.keys(region.compartilhada).length > 0
    : region.full !== undefined && Object.keys(region.full).length > 0;

  // Replica o clamp de commitRegionInicio/Fim para que o seek caia no
  // mesmo ponto que será gravado. Sem isso, seek e valor salvo podem
  // divergir em até FINE_STEP_SEG nas bordas (inicio + 0.1, duration).
  const adjustInicio = (delta: number) => {
    const next = clamp(round(region.inicio + delta), 0, duration);
    if (next !== region.inicio) onChangeInicio(next);
    onSeekTo(next);
  };
  const adjustFim = (delta: number) => {
    const minFim = region.inicio + 0.1;
    const next = clamp(round(region.fim + delta), minFim, Math.max(minFim, duration));
    if (next !== region.fim) onChangeFim(next);
    onSeekTo(next);
  };

  return (
    <li
      className={cn(
        'rounded-[var(--radius-sm)] border p-2',
        active
          ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] shadow-[0_0_0_2px_var(--wb-accent-soft)]'
          : 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]',
      )}
    >
      <div className="flex items-center gap-2">
        <button type="button" onClick={onSeek} className="flex flex-1 items-center gap-2 text-left">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.04em]"
            style={{ color }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
            {region.modo}
          </span>
          <span
            className="font-code text-[10.5px] text-[var(--wb-text-mute)]"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {segParaMmSs(region.inicio, true)} → {segParaMmSs(region.fim, true)}
          </span>
        </button>
        <Tooltip label="Remover intervalo" side="left">
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remover intervalo"
            className="flex h-6 w-6 items-center justify-center rounded text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-err-soft)] hover:text-[var(--wb-err)]"
          >
            <Trash2 size={12} />
          </button>
        </Tooltip>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        <label className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
          Início
          <div className="flex items-center gap-1">
            <FineStepButton
              label="Recuar início 0,1s e ver o quadro"
              onClick={() => adjustInicio(-FINE_STEP_SEG)}
            >
              <Minus size={11} />
            </FineStepButton>
            <div className="min-w-0 flex-1">
              <TimeField
                valueSeg={region.inicio}
                ariaLabel="Início do intervalo (mm:ss)"
                onCommit={onChangeInicio}
              />
            </div>
            <FineStepButton
              label="Avançar início 0,1s e ver o quadro"
              onClick={() => adjustInicio(+FINE_STEP_SEG)}
            >
              <Plus size={11} />
            </FineStepButton>
          </div>
        </label>
        <label className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
          Fim
          <div className="flex items-center gap-1">
            <FineStepButton
              label="Recuar fim 0,1s e ver o quadro"
              onClick={() => adjustFim(-FINE_STEP_SEG)}
            >
              <Minus size={11} />
            </FineStepButton>
            <div className="min-w-0 flex-1">
              <TimeField
                valueSeg={region.fim}
                ariaLabel="Fim do intervalo (mm:ss)"
                onCommit={onChangeFim}
              />
            </div>
            <FineStepButton
              label="Avançar fim 0,1s e ver o quadro"
              onClick={() => adjustFim(+FINE_STEP_SEG)}
            >
              <Plus size={11} />
            </FineStepButton>
          </div>
        </label>
        <label className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
          Modo
          <select
            value={region.modo}
            onChange={(e) => onChangeModo(e.target.value as YoutubeLayoutMode)}
            className="h-7 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-2 text-[11px] text-[var(--wb-text)]"
          >
            <option value="full">Full</option>
            <option value="compartilhada">Compartilhada</option>
          </select>
        </label>
      </div>
      <div className="mt-2 flex flex-col gap-1 rounded-[var(--radius-xs)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.06em] text-[var(--wb-text-dim)]">
            Posicionamento
          </span>
          {hasOverride && (
            <span className="rounded-full bg-[var(--wb-accent-soft)] px-1.5 py-0.5 font-code text-[8.5px] font-bold uppercase tracking-[0.04em] text-[var(--wb-accent)]">
              personalizado
            </span>
          )}
          <div className="flex-1" />
          <DefinirSplitButton
            label="Mudar posicionamento"
            onOpenModal={onAbrirPosicionamento}
            onApplyPreset={onAplicarPresetSegmento}
            presetTipo={isShared ? 'posicionamento' : 'posicionamento_full'}
            compact
          />
          {hasOverride && (
            <Tooltip label="Voltar ao posicionamento do corte" side="left">
              <button
                type="button"
                onClick={onClearOverride}
                className="inline-flex items-center gap-1 bg-transparent font-code text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)]"
              >
                <RotateCw size={10} />
                Reverter
              </button>
            </Tooltip>
          )}
        </div>
        <span
          className="truncate font-code text-[9.5px] text-[var(--wb-text-dim)]"
          title={presetEmUsoNome ?? undefined}
        >
          {presetEmUsoNome
            ? `Preset: ${presetEmUsoNome}`
            : hasOverride
              ? 'Personalizado neste segmento (não bate com preset salvo)'
              : 'Herda do corte'}
        </span>
      </div>
    </li>
  );
}

function FineStepButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="inline-flex h-7 w-5 flex-shrink-0 items-center justify-center rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
      >
        {children}
      </button>
    </Tooltip>
  );
}

// CropPicker, SharedRectEditor, resizeSlotForCrop, rectFromPoints, rectToStyle,
// isCropRectKey, isFacecamRectKey, getRectLabel, clamp, IconControl movidos para
// ./posicionamentoControls.tsx (consumidos pelo PosicionamentoModal).

function parseTimeInput(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (t.includes(':')) {
    const parts = t.split(':');
    if (parts.length > 3) return null;
    const nums = parts.map((part) => Number(part));
    if (nums.some((n) => !Number.isFinite(n))) return null;
    return nums.reduce((acc, n) => acc * 60 + n, 0);
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function TimeField({
  valueSeg,
  onCommit,
  ariaLabel,
}: {
  valueSeg: number;
  onCommit: (seg: number) => void;
  ariaLabel: string;
}) {
  const [text, setText] = useState(() => segParaMmSs(valueSeg, true));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setText(segParaMmSs(valueSeg, true));
  }, [valueSeg, editing]);

  const commit = () => {
    setEditing(false);
    const seg = parseTimeInput(text);
    if (seg === null) {
      setText(segParaMmSs(valueSeg, true));
      return;
    }
    onCommit(seg);
  };

  return (
    <Input
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      value={text}
      placeholder="mm:ss"
      onFocus={() => setEditing(true)}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
      className="h-7 font-code text-[11px]"
    />
  );
}

