import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  GripVertical,
  Loader2,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  Star,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ClaudeAiButton } from '@/components/ui/claude-button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { ThumbnailHintsEditor } from '@/components/ThumbnailHintsEditor';
import { RetractableFooter } from '@/components/workbench/RetractableFooter';
import { cn } from '@/lib/utils';
import { AvaliacaoBrutoPanel } from '../avaliacao/AvaliacaoBrutoPanel';
import { resolverBadgeTrecho } from './trechoBadge';
import { hmsParaSeg } from '../timeUtils';
import { useCorte } from '@/hooks/useEditor';
import { useDiarizarCorte, useFalantes } from '@/hooks/useDiarizacao';
import type { FalantesMap } from '@/lib/api';
import type { Desvio, TranscricaoLinha } from '@/types/models';
import { textoDoTrecho } from './legendaDoTrecho';

// ─────────────────────────────────────────────────────────────
// RightTabsPanel — replica `design_reference/src/v2_bruto.jsx:405-624`.
// Funde TrechosPanel + TranscriptPanel num painel com abas.
// Header: grip + 2 abas (Trechos default + Transcricao) + refresh sempre
// visivel a direita.
// Preserva 100% da logica funcional (filtros IA/Manual/Silencios, busca,
// scroll-to, modal manual via `usePromptDesvios`).
//
// `variant="workbench"` (AUDITORIA-v2 §9, CP10) — move "⟳ Regerar
// transcrição" do header pro rodapé retrátil "⭐ MAIS AÇÕES" (fechado por
// padrão): é uma ação de baixo uso, então ganha com o rodapé em vez de
// ocupar o header sempre visível. `variant="legacy"` (default) preserva
// 100% o header atual (EditorFase1/shell antigo) — nada muda ali.
// Decisões que NÃO mudam em nenhum variant (ver deviations do commit):
//   - "🔍 Buscar na transcrição" fica onde está (topo da aba Transcrição,
//     sempre visível): é usada com frequência ao revisar um corte —
//     escondê-la atrás de um rodapé fechado por padrão pioraria o fluxo
//     comum, então a etapa pediu "só mover se fizer sentido" e aqui não
//     fez.
//   - "⭐ Influenciar a capa" (ThumbnailHintsEditor) não é tocado — mover
//     o trigger sem virar uma ação por-trecho mudaria o comportamento
//     (hoje é um editor sempre visível), fora do escopo desta etapa.
//   - "⤓ Exportar transcrição (SRT)" não existe (sem hook/endpoint) —
//     decisão já tomada fora desta etapa: não construir agora.
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
  /** AUDITORIA-v2 §9 (CP10): 'legacy' (default) preserva o header atual
   *  (EditorFase1). 'workbench' move "Regerar transcrição" pro rodapé
   *  retrátil "MAIS AÇÕES". */
  variant?: 'legacy' | 'workbench';
}

// D-447: a aba "Avaliação" mora aqui, e não numa tela nova, porque a
// pergunta que ela responde — "o que sobrou se sustenta?" — só faz sentido
// ao lado do material que a responde: os trechos removidos e a transcrição.
type TabId = 'trechos' | 'transcricao' | 'avaliacao';

/**
 * "00:22:09.000" → "22:09.0". O protótipo v3 mostra décimos: os
 * milissegundos cheios alargavam a coluna de tempo e empurravam o texto
 * do trecho, sem acrescentar precisão útil na leitura.
 */
function mmssDecimo(hms: string): string {
  const semHora = hms.slice(3);
  const ponto = semHora.indexOf('.');
  return ponto === -1 ? semHora : semHora.slice(0, ponto + 2);
}

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
  variant = 'legacy',
}: RightTabsPanelProps) {
  const [tab, setTab] = useState<TabId>('trechos');
  const [maisAcoesOpen, setMaisAcoesOpen] = useState(false);
  const isWorkbench = variant === 'workbench';

  // D-360: diarização por corte. projetoId sai do corte já em cache; o mapa de
  // falantes resolve SPEAKER_xx → nome/canal na etiqueta inline da transcrição.
  const projetoId = useCorte(corteId).data?.projeto_id;
  const falantes = useFalantes(projetoId, tab === 'transcricao').data?.falantes;
  const diarizar = useDiarizarCorte(corteId, projetoId);

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
      {/* Tabs planas com sublinhado (DE-PARA-v3 §3): sem caixa e sem sombra,
          alinhadas ao TabStrip fino do shell. O fundo `inset` saiu junto —
          a faixa agora só tem a divisória inferior. */}
      <header className="flex flex-shrink-0 items-center gap-2.5 border-b border-[var(--wb-border-soft)] px-3 pt-2">
        <GripVertical size={13} className="mb-2 text-[var(--wb-text-dim)]" aria-hidden />
        <TabButton
          id="trechos"
          active={tab === 'trechos'}
          onClick={() => setTab('trechos')}
          label="Trechos a remover"
          count={desvios.length}
          countTone="err"
        />
        <TabButton
          id="transcricao"
          active={tab === 'transcricao'}
          onClick={() => setTab('transcricao')}
          label="Transcrição"
          count={transcricao?.length ?? 0}
        />
        <TabButton
          id="avaliacao"
          active={tab === 'avaliacao'}
          onClick={() => setTab('avaliacao')}
          label="Avaliação"
        />
        <div className="flex-1" />
        {/* AUDITORIA-v2 §9 (CP10): no Workbench o refresh sai do header
            (baixo uso) e migra pro rodapé "MAIS AÇÕES" abaixo; legacy
            mantém 100% como sempre. */}
        {!isWorkbench && (
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
        )}
      </header>

      {tab === 'avaliacao' ? (
        <AvaliacaoBrutoPanel corteId={corteId} />
      ) : tab === 'trechos' ? (
        <TrechosList
          desvios={desvios}
          transcricao={transcricao}
          selectedDesvioIdx={selectedDesvioIdx}
          onSeek={onSeek}
          onAdicionarDesvio={onAdicionarDesvio}
          onRemoverDesvio={onRemoverDesvio}
          onGerarManual={onGerarManual}
          onGerarTrechosClaude={onGerarTrechosClaude}
          pending={pendingTrechos}
        />
      ) : (
        <TranscriptList
          linhas={transcricao ?? []}
          currentTime={currentTime}
          onSeek={onSeek}
          falantes={falantes}
          onDiarizar={() => diarizar.mutate()}
          diarizando={diarizar.isPending}
        />
      )}

      {isWorkbench && (
        <RetractableFooter
          icon={<Star size={13} />}
          label="Mais ações"
          open={maisAcoesOpen}
          onToggle={() => setMaisAcoesOpen((v) => !v)}
        >
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshPending}
            className="flex items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[11.5px] font-semibold text-[var(--wb-text)] hover:bg-[var(--wb-bg-inset)] disabled:pointer-events-none disabled:opacity-60"
          >
            {refreshPending ? (
              <Loader2 size={13} className="animate-spin text-[var(--wb-text-dim)]" aria-hidden />
            ) : (
              <RotateCw size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
            )}
            {refreshPending ? 'Atualizando transcrição…' : 'Regerar transcrição'}
          </button>
        </RetractableFooter>
      )}
    </section>
  );
}

/**
 * Aba plana com sublinhado (DE-PARA-v3 §3). Antes era uma caixa com borda,
 * fundo próprio e `shadow-sm` — visual de tab antigo, destoando do TabStrip
 * fino e plano do resto do shell. Agora: só rótulo + contador, ativo marcado
 * por `border-bottom: 2px var(--wb-accent)`. Sem caixa, sem sombra.
 */
function TabButton({
  active,
  onClick,
  label,
  count,
  countTone,
}: {
  id: TabId;
  active: boolean;
  onClick: () => void;
  label: string;
  /** Ausente = aba sem contador (a de Avaliação não conta itens). */
  count?: number;
  countTone?: 'err';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-[7px] whitespace-nowrap border-b-2 px-1 py-2 text-[11.5px] transition-colors',
        active
          ? 'border-b-[var(--wb-accent)] font-bold text-[var(--wb-text)]'
          : 'border-b-transparent font-semibold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      )}
      aria-current={active ? 'page' : undefined}
    >
      {label}
      {count !== undefined && (
        <span
          className={cn(
            'rounded-[5px] px-1.5 py-px font-code text-[9px] font-bold',
            countTone === 'err'
              ? 'bg-[var(--wb-err-soft)] text-[var(--wb-err-ink)]'
              : 'bg-[var(--wb-bg-inset)] text-[var(--wb-text-mute)]',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

// ───── TrechosList — v2_bruto.jsx:484-548 ─────

// D-422: o badge do trecho passou a mostrar o MOTIVO da remoção (repetição,
// tangente, imprecisão…) em vez de um "IA" único para tudo que a IA propôs. A
// resolução vive em `trechoBadge.ts` (testável, cobre legados sem `categoria`).

function TrechosList({
  desvios,
  transcricao,
  selectedDesvioIdx,
  onSeek,
  onAdicionarDesvio,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosClaude,
  pending,
}: {
  desvios: Desvio[];
  /** D-511: para mostrar no card o que está sendo dito no trecho. */
  transcricao?: TranscricaoLinha[];
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
      {/* Sub-barra compacta do protótipo v3: AI|Manual num segmented pequeno
          (antes eram dois botões de altura cheia, que pesavam mais que as
          próprias linhas de trecho) e o ＋ em acento suave, 30×30. */}
      <div className="flex flex-shrink-0 items-center gap-1.5 px-3 pb-2 pt-2">
        <div className="inline-flex gap-0.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-[3px]">
          <Tooltip label="Gerar trechos a remover via Claude" side="bottom">
            <ClaudeAiButton
              size="sm"
              pending={pending.claude}
              onClick={onGerarTrechosClaude}
              className="h-[26px] gap-1.5 rounded-[6px] px-3 text-[10.5px]"
            />
          </Tooltip>
          <Tooltip label="Importar trechos manualmente (cola JSON da IA)" side="bottom">
            <button
              type="button"
              onClick={onGerarManual}
              className="inline-flex h-[26px] items-center gap-1.5 rounded-[6px] px-3 text-[10.5px] font-semibold text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-panel)] hover:text-[var(--wb-text)]"
            >
              <WandSparkles size={12} aria-hidden />
              Manual
            </button>
          </Tooltip>
        </div>
        <div className="flex-1" />
        <Tooltip label="Adicionar trecho" side="bottom">
          <button
            type="button"
            onClick={adicionarAqui}
            disabled={pending.adicionando}
            aria-label="Adicionar trecho"
            className="flex h-[30px] w-[30px] items-center justify-center rounded-[8px] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)] transition-colors hover:bg-[var(--wb-accent)] hover:text-[var(--wb-accent-fg)] disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus size={15} strokeWidth={2.2} aria-hidden />
          </button>
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
          const badge = resolverBadgeTrecho(d);
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
                    {mmssDecimo(d.inicio_hms)}
                  </span>
                  <ChevronDown size={9} className="text-[var(--wb-text-dim)]" />
                  <span
                    className="font-code text-[10.5px] text-[var(--wb-text-mute)]"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {mmssDecimo(d.fim_hms)}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-1.5">
                    <span
                      className="inline-flex items-center rounded-full px-2 py-0.5 font-code text-[10px] font-semibold uppercase tracking-[0.04em]"
                      style={{ background: badge.bg, color: badge.fg }}
                      title={badge.titulo}
                    >
                      {badge.label}
                    </span>
                    <span
                      className="font-code text-[10px] font-semibold text-[var(--wb-err-ink)]"
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      −{delta.toFixed(1)}s
                    </span>
                  </div>
                  {/* DE-PARA-v3 §3: o motivo é apoio, não o conteúdo principal
                      da linha — daí o tom mudo.

                      D-511: mas ele deixou de ser CORTADO. Com `line-clamp-2` o
                      motivo terminava no meio de uma frase, e conferir o corte
                      exigia sair da tela. Um motivo longo ocupa mais três
                      linhas; um motivo pela metade custa uma ida e volta. */}
                  <div className="whitespace-pre-wrap break-words text-[11px] leading-[1.4] text-[var(--wb-text-mute)]">
                    {d.motivo || '—'}
                  </div>
                  {/* D-511: o que está sendo DITO ali. O motivo diz por que sai;
                      isto diz o que sai, que é o que se julga. */}
                  {textoDoTrecho(transcricao ?? [], d) && (
                    <p className="mt-1 border-l-2 border-[var(--wb-border)] pl-2 text-[11px] italic leading-[1.45] text-[var(--wb-text-dim)]">
                      “{textoDoTrecho(transcricao ?? [], d)}”
                    </p>
                  )}
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
  falantes,
  onDiarizar,
  diarizando,
}: {
  linhas: TranscricaoLinha[];
  currentTime: number;
  onSeek: (seg: number) => void;
  falantes?: FalantesMap;
  onDiarizar: () => void;
  diarizando: boolean;
}) {
  const [busca, setBusca] = useState('');

  // D-360: só mostra a etiqueta quando ao menos uma linha tem falante.
  const temFalante = useMemo(() => linhas.some((l) => l.speaker), [linhas]);

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
      <div className="flex-shrink-0 space-y-2 border-b border-[var(--wb-border-soft)] px-3 py-2.5">
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
        {/* D-360: diariza só este corte (evita rodar o vídeo inteiro). */}
        <Tooltip
          label="Identifica os falantes só neste corte (não roda o vídeo todo)"
          side="bottom"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onDiarizar}
            disabled={diarizando}
          >
            {diarizando ? <Loader2 className="animate-spin" /> : <Users />}
            {diarizando ? 'Diarizando...' : 'Diarizar este corte'}
          </Button>
        </Tooltip>
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
                {temFalante && <FalanteBadge speaker={l.speaker} falantes={falantes} />}
                {l.texto}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// D-360: chip inline do falante. Resolve SPEAKER_xx → nome/canal via mapa; sem
// nome batizado cai para "Falante N". Linhas sem `speaker` (fora da janela
// diarizada) não renderizam badge.
function FalanteBadge({ speaker, falantes }: { speaker?: string; falantes?: FalantesMap }) {
  if (!speaker) return null;
  const info = falantes?.[speaker];
  const isCanal = !!info?.is_canal;
  const nome = info?.nome?.trim();
  const label =
    nome || `Falante ${speaker.replace(/^SPEAKER_?/i, '').replace(/^0+/, '') || speaker}`;
  return (
    <span
      className="mr-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 align-baseline font-code text-[9.5px] font-semibold uppercase tracking-[0.03em]"
      style={
        isCanal
          ? { background: 'var(--wb-accent-soft)', color: 'var(--wb-accent)' }
          : { background: 'var(--wb-violet-soft)', color: 'var(--wb-violet)' }
      }
    >
      {isCanal ? `Canal${nome ? `: ${nome}` : ''}` : label}
    </span>
  );
}

function hmsString(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${ms}`;
}
