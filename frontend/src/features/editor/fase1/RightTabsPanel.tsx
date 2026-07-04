import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  FileText,
  GripVertical,
  Loader2,
  Plus,
  RotateCw,
  Scissors,
  Search,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClaudeAiButton } from '@/components/ui/claude-button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { ThumbnailHintsEditor } from '@/components/ThumbnailHintsEditor';
import { cn } from '@/lib/utils';
import { hmsParaSeg } from '../timeUtils';
import type { Desvio, TranscricaoLinha } from '@/types/models';

// ─────────────────────────────────────────────────────────────
// RightTabsPanel — replica `design_reference/src/v2_bruto.jsx:405-624`.
// Funde TrechosPanel + TranscriptPanel num painel com abas.
// Header: grip + 2 abas (Trechos default + Transcricao) + refresh sempre
// visivel a direita.
// Preserva 100% da logica funcional (filtros IA/Manual/Silencios, busca,
// scroll-to, modal manual via `usePromptDesvios`).
// ─────────────────────────────────────────────────────────────

interface RightTabsPanelProps {
  // F-058: influência manual do editor no prompt da thumbnail.
  corteId: string;
  hintsThumbnail?: string;
  // Trechos
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  onSeek: (seg: number) => void;
  onAdicionarDesvio: (d: Desvio) => void;
  onRemoverDesvio: (idx: number) => void;
  onGerarManual: () => void;
  onGerarTrechosClaude: () => void;
  pendingTrechos: {
    adicionando?: boolean;
    removendo?: boolean;
    claude?: boolean;
  };
  // Transcricao
  transcricao?: TranscricaoLinha[];
  currentTime: number;
  onAtualizarTranscricao: () => void;
  transcricaoAtualizando: boolean;
}

type TabId = 'trechos' | 'transcricao';

export function RightTabsPanel({
  corteId,
  hintsThumbnail,
  desvios,
  selectedDesvioIdx,
  onSeek,
  onAdicionarDesvio,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosClaude,
  pendingTrechos,
  transcricao,
  currentTime,
  onAtualizarTranscricao,
  transcricaoAtualizando,
}: RightTabsPanelProps) {
  const [tab, setTab] = useState<TabId>('trechos');

  // Decisao Paulo: refresh do header SEMPRE atualiza a transcricao,
  // independente da aba ativa. "Reanalisar trechos" continua via o botao
  // "IA" na sub-barra dentro da aba Trechos.
  const refreshTitle = 'Atualizar transcricao';
  const refreshPending = transcricaoAtualizando;
  const onRefresh = onAtualizarTranscricao;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      {/* F-058: influência manual do editor no prompt da thumbnail. */}
      <div className="flex-shrink-0 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <ThumbnailHintsEditor corteId={corteId} initialValue={hintsThumbnail} />
      </div>
      {/* Tabs header — v2_bruto.jsx:415-476 */}
      <header className="flex flex-shrink-0 items-center gap-1 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <GripVertical size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
        <TabButton
          id="trechos"
          active={tab === 'trechos'}
          onClick={() => setTab('trechos')}
          icon={Scissors}
          label="Trechos a remover"
          count={desvios.length}
          countTone="err"
        />
        <TabButton
          id="transcricao"
          active={tab === 'transcricao'}
          onClick={() => setTab('transcricao')}
          icon={FileText}
          label="Transcricao"
          count={transcricao?.length ?? 0}
        />
        <div className="flex-1" />
        <Tooltip label={refreshTitle} side="bottom">
          <IconButton
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshPending}
            aria-label={refreshTitle}
          >
            {refreshPending ? <Loader2 className="animate-spin" /> : <RotateCw />}
          </IconButton>
        </Tooltip>
      </header>

      {tab === 'trechos' ? (
        <TrechosList
          desvios={desvios}
          selectedDesvioIdx={selectedDesvioIdx}
          onSeek={onSeek}
          onAdicionarDesvio={onAdicionarDesvio}
          onRemoverDesvio={onRemoverDesvio}
          onGerarManual={onGerarManual}
          onGerarTrechosClaude={onGerarTrechosClaude}
          pending={pendingTrechos}
        />
      ) : (
        <TranscriptList linhas={transcricao ?? []} currentTime={currentTime} onSeek={onSeek} />
      )}
    </section>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
  count,
  countTone,
}: {
  id: TabId;
  active: boolean;
  onClick: () => void;
  icon: typeof Scissors;
  label: string;
  count: number;
  countTone?: 'err';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
        active
          ? 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] text-[var(--wb-ink)] shadow-sm'
          : 'border-transparent text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      )}
      aria-current={active ? 'page' : undefined}
    >
      <Icon size={12} />
      {label}
      <span
        className={cn(
          'rounded-full px-1.5 font-code text-[9.5px] font-bold',
          countTone === 'err' && active
            ? 'bg-[var(--wb-err-soft)] text-[var(--wb-err)]'
            : countTone === 'err'
              ? 'bg-[var(--wb-bg-inset)] text-[var(--wb-err)]'
              : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-dim)]',
        )}
      >
        {count}
      </span>
    </button>
  );
}

// ───── TrechosList — v2_bruto.jsx:484-548 ─────

type TrechoTag = 'silencio' | 'hesitacao' | 'off' | 'rep' | 'manual' | 'claude' | 'gemini' | 'n8n';

function detectarTag(desvio: Desvio): TrechoTag {
  // WHY: a origem persistida (I-020) é o sinal canônico — usa direto quando
  // existe. Para desvios legados sem `origem`, cai no regex de motivo
  // (silêncios técnicos sempre têm "silêncio" no motivo; o resto vai para
  // 'manual' por compatibilidade com o badge antigo).
  const origem = desvio.origem;
  if (origem === 'claude') return 'claude';
  if (origem === 'gemini') return 'gemini';
  if (origem === 'n8n') return 'n8n';
  if (origem === 'tecnico') return 'silencio';
  if (origem === 'manual') return 'manual';

  const m = (desvio.motivo ?? '').toLowerCase();
  if (m.includes('silenc')) return 'silencio';
  if (m.includes('hesit')) return 'hesitacao';
  if (m.includes('off')) return 'off';
  if (m.includes('repet') || m.includes('rep.')) return 'rep';
  return 'manual';
}

const TAG_META: Record<TrechoTag, { label: string; bg: string; fg: string }> = {
  silencio: { label: 'silencio', bg: 'var(--wb-info-soft)', fg: 'var(--wb-info)' },
  hesitacao: { label: 'hesitacao', bg: 'var(--wb-warn-soft)', fg: 'var(--wb-warn)' },
  off: { label: 'off-topic', bg: 'var(--wb-violet-soft)', fg: 'var(--wb-violet)' },
  rep: { label: 'repeticao', bg: 'var(--wb-bg-inset)', fg: 'var(--wb-text-mute)' },
  manual: { label: 'manual', bg: 'var(--wb-accent-soft)', fg: 'var(--wb-accent)' },
  claude: { label: 'IA', bg: 'var(--wb-accent-soft)', fg: 'var(--wb-accent)' },
  gemini: { label: 'IA Gemini', bg: 'var(--wb-violet-soft)', fg: 'var(--wb-violet)' },
  n8n: { label: 'IA n8n', bg: 'var(--wb-violet-soft)', fg: 'var(--wb-violet)' },
};

function TrechosList({
  desvios,
  selectedDesvioIdx,
  onSeek,
  onAdicionarDesvio,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosClaude,
  pending,
}: {
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  onSeek: (seg: number) => void;
  onAdicionarDesvio: (d: Desvio) => void;
  onRemoverDesvio: (idx: number) => void;
  onGerarManual: () => void;
  onGerarTrechosClaude: () => void;
  pending: {
    adicionando?: boolean;
    removendo?: boolean;
    claude?: boolean;
  };
}) {
  const sortedWithOriginalIdx = useMemo(
    () =>
      desvios
        .map((d, i) => ({ d, i }))
        .sort((a, b) => hmsParaSeg(a.d.inicio_hms) - hmsParaSeg(b.d.inicio_hms)),
    [desvios],
  );

  const origIdxToSortedPos = useMemo(() => {
    const map = new Map<number, number>();
    sortedWithOriginalIdx.forEach(({ i }, sortPos) => map.set(i, sortPos));
    return map;
  }, [sortedWithOriginalIdx]);

  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (selectedDesvioIdx == null || selectedDesvioIdx < 0) return;
    const sortedPos = origIdxToSortedPos.get(selectedDesvioIdx);
    if (sortedPos == null) return;
    itemRefs.current[sortedPos]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedDesvioIdx, origIdxToSortedPos]);

  function adicionarAqui() {
    onAdicionarDesvio({
      inicio_hms: '00:00:00',
      fim_hms: '00:00:05',
      motivo: 'Manual — recortado pelo editor',
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sub-barra de filtros — v2_bruto.jsx:494-506 */}
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-[var(--wb-border-soft)] px-3 py-2">
        <Tooltip label="Gerar trechos a remover via Claude" side="bottom">
          <ClaudeAiButton pending={pending.claude} onClick={onGerarTrechosClaude} />
        </Tooltip>
        <Tooltip label="Importar trechos manualmente (cola JSON da IA)" side="bottom">
          <Button type="button" variant="outline" size="sm" onClick={onGerarManual}>
            <WandSparkles />
            Manual
          </Button>
        </Tooltip>
        <div className="flex-1" />
        <Tooltip label="Adicionar trecho" side="bottom">
          <IconButton
            type="button"
            variant="accent"
            size="sm"
            onClick={adicionarAqui}
            disabled={pending.adicionando}
            aria-label="Adicionar trecho"
          >
            <Plus />
          </IconButton>
        </Tooltip>
      </div>

      {/* Lista — v2_bruto.jsx:507-547 */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto px-2.5 py-2">
        {sortedWithOriginalIdx.length === 0 && (
          <div className="m-auto flex flex-col items-center gap-1 py-8 text-center text-[12px] text-[var(--wb-text-dim)]">
            <Sparkles size={20} className="opacity-60" />
            Nenhum trecho marcado.
            <span className="text-[11px]">Use IA / Manual / Silencios para gerar.</span>
          </div>
        )}
        {sortedWithOriginalIdx.map(({ d, i }, sortPos) => {
          const tag = detectarTag(d);
          const meta = TAG_META[tag];
          const ds = hmsParaSeg(d.inicio_hms);
          const de = hmsParaSeg(d.fim_hms);
          const delta = Math.max(0, de - ds);
          const ativo = selectedDesvioIdx === i;
          return (
            <div
              key={`${d.inicio_hms}-${i}`}
              ref={(el) => {
                itemRefs.current[sortPos] = el;
              }}
              className="relative"
            >
              <button
                type="button"
                onClick={() => onSeek(ds)}
                className={cn(
                  'group flex w-full cursor-pointer items-start gap-2.5 rounded-[var(--radius-sm)] border bg-[var(--wb-bg-card-elev)] px-2.5 py-2 pr-10 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
                  ativo
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                    : 'border-[var(--wb-border-soft)] hover:border-[var(--wb-border)]',
                )}
                aria-label={`Pular para ${d.inicio_hms}`}
              >
                <div className="flex min-w-[52px] flex-col items-center gap-0.5 rounded text-left transition-opacity group-hover:opacity-80">
                  <span
                    className="font-code text-[10.5px] font-bold text-[var(--wb-text)]"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {d.inicio_hms.slice(3)}
                  </span>
                  <ChevronDown size={9} className="text-[var(--wb-text-dim)]" />
                  <span
                    className="font-code text-[10.5px] text-[var(--wb-text-mute)]"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {d.fim_hms.slice(3)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 font-code text-[10px] font-semibold uppercase tracking-[0.04em]"
                      style={{ background: meta.bg, color: meta.fg }}
                    >
                      {meta.label}
                    </span>
                    <span
                      className="font-code text-[10px] font-semibold text-[var(--wb-err)]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      −{delta.toFixed(1)}s
                    </span>
                  </div>
                  <div className="text-[12.5px] leading-tight text-[var(--wb-text)]">
                    {d.motivo || '—'}
                  </div>
                </div>
              </button>
              <Tooltip label="Remover" side="left">
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-2 top-2"
                  onClick={() => onRemoverDesvio(i)}
                  disabled={pending.removendo}
                  aria-label="Remover trecho"
                >
                  <Trash2 />
                </IconButton>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───── TranscriptList — v2_bruto.jsx:550-624 ─────

function TranscriptList({
  linhas,
  currentTime,
  onSeek,
}: {
  linhas: TranscricaoLinha[];
  currentTime: number;
  onSeek: (seg: number) => void;
}) {
  const [busca, setBusca] = useState('');

  const linhasFiltradas = useMemo(() => {
    if (!linhas) return [];
    if (!busca.trim()) return linhas;
    const q = busca.toLowerCase();
    return linhas.filter((l) => l.texto.toLowerCase().includes(q));
  }, [linhas, busca]);

  const linhaAtivaIdx = useMemo(() => {
    if (!linhas || linhas.length === 0) return -1;
    let exato = -1;
    let ultimaAtras = -1;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i];
      if (currentTime >= l.start && currentTime < l.end) {
        exato = i;
        break;
      }
      if (currentTime >= l.start) ultimaAtras = i;
    }
    return exato !== -1 ? exato : ultimaAtras;
  }, [linhas, currentTime]);

  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [linhaAtivaIdx]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Busca — v2_bruto.jsx:553-582 */}
      <div className="flex-shrink-0 border-b border-[var(--wb-border-soft)] px-3 py-2.5">
        <div className="flex h-[30px] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2.5">
          <Search size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar palavra..."
            className="flex-1 bg-transparent text-[12.5px] text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
          />
          <span className="font-code text-[10px] text-[var(--wb-text-dim)]">⌘F</span>
        </div>
      </div>

      {/* Linhas — v2_bruto.jsx:584-621 */}
      <div className="flex-1 overflow-y-auto py-1">
        {linhasFiltradas.length === 0 && (
          <div className="m-auto py-8 text-center text-[12px] text-[var(--wb-text-dim)]">
            {linhas.length === 0 ? 'Sem transcricao.' : 'Nenhum resultado.'}
          </div>
        )}
        {linhasFiltradas.map((l, i) => {
          const ativa = i === linhaAtivaIdx;
          return (
            <button
              key={`${l.start}-${i}`}
              ref={ativa ? activeRef : undefined}
              type="button"
              onClick={() => onSeek(l.start)}
              className={cn(
                'flex w-full items-baseline gap-2.5 border-l-2 px-3 py-1.5 text-left transition-colors',
                ativa
                  ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)]'
                  : 'border-transparent hover:bg-[var(--wb-bg-inset)]',
              )}
            >
              <span
                className={cn(
                  'min-w-[56px] font-code text-[10px]',
                  ativa
                    ? 'font-bold text-[var(--wb-accent)]'
                    : 'font-medium text-[var(--wb-text-dim)]',
                )}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {hmsString(l.start)}
              </span>
              <span
                className={cn(
                  'text-[13px] leading-snug',
                  ativa ? 'font-medium text-[var(--wb-ink)]' : 'text-[var(--wb-text)]',
                )}
              >
                {l.texto}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function hmsString(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}
