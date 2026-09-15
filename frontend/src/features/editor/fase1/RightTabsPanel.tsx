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
import { GeminiAiButton } from '@/components/ui/gemini-button';
import { IconButton } from '@/components/ui/icon-button';
import { Tooltip } from '@/components/ui/tooltip';
import { ThumbnailHintsEditor } from '@/components/ThumbnailHintsEditor';
import { RetractableFooter } from '@/components/workbench/RetractableFooter';
import { cn } from '@/lib/utils';
import { AvaliacaoBrutoPanel } from '../avaliacao/AvaliacaoBrutoPanel';
import { BlocosTab } from './BlocosTab';
import { resolverBadgeTrecho } from './trechoBadge';
import { hmsParaSeg } from '../timeUtils';
import { useCorte } from '@/hooks/useEditor';
import { useDiarizarCorte, useFalantes } from '@/hooks/useDiarizacao';
import type { FalantesMap } from '@/lib/api';
import type { Desvio, TranscricaoLinha } from '@/types/models';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// RightTabsPanel Ã¢â‚¬â€ replica `design_reference/src/v2_bruto.jsx:405-624`.
// Funde TrechosPanel + TranscriptPanel num painel com abas.
// Header: grip + 2 abas (Trechos default + Transcricao) + refresh sempre
// visivel a direita.
// Preserva 100% da logica funcional (filtros IA/Manual/Silencios, busca,
// scroll-to, modal manual via `usePromptDesvios`).
//
// `variant="workbench"` (AUDITORIA-v2 Ã‚Â§9, CP10) Ã¢â‚¬â€ move "Ã¢Å¸Â³ Regerar
// transcriÃƒÂ§ÃƒÂ£o" do header pro rodapÃƒÂ© retrÃƒÂ¡til "Ã¢Â­Â MAIS AÃƒâ€¡Ãƒâ€¢ES" (fechado por
// padrÃƒÂ£o): ÃƒÂ© uma aÃƒÂ§ÃƒÂ£o de baixo uso, entÃƒÂ£o ganha com o rodapÃƒÂ© em vez de
// ocupar o header sempre visÃƒÂ­vel. `variant="legacy"` (default) preserva
// 100% o header atual (EditorFase1/shell antigo) Ã¢â‚¬â€ nada muda ali.
// DecisÃƒÂµes que NÃƒÆ’O mudam em nenhum variant (ver deviations do commit):
//   - "Ã°Å¸â€Â Buscar na transcriÃƒÂ§ÃƒÂ£o" fica onde estÃƒÂ¡ (topo da aba TranscriÃƒÂ§ÃƒÂ£o,
//     sempre visÃƒÂ­vel): ÃƒÂ© usada com frequÃƒÂªncia ao revisar um corte Ã¢â‚¬â€
//     escondÃƒÂª-la atrÃƒÂ¡s de um rodapÃƒÂ© fechado por padrÃƒÂ£o pioraria o fluxo
//     comum, entÃƒÂ£o a etapa pediu "sÃƒÂ³ mover se fizer sentido" e aqui nÃƒÂ£o
//     fez.
//   - "Ã¢Â­Â Influenciar a capa" (ThumbnailHintsEditor) nÃƒÂ£o ÃƒÂ© tocado Ã¢â‚¬â€ mover
//     o trigger sem virar uma aÃƒÂ§ÃƒÂ£o por-trecho mudaria o comportamento
//     (hoje ÃƒÂ© um editor sempre visÃƒÂ­vel), fora do escopo desta etapa.
//   - "Ã¢Â¤â€œ Exportar transcriÃƒÂ§ÃƒÂ£o (SRT)" nÃƒÂ£o existe (sem hook/endpoint) Ã¢â‚¬â€
//     decisÃƒÂ£o jÃƒÂ¡ tomada fora desta etapa: nÃƒÂ£o construir agora.
// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

interface RightTabsPanelProps {
  // F-058: influÃƒÂªncia manual do editor no prompt da thumbnail.
  corteId: string;
  hintsThumbnail?: string;
  // Trechos
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  onSeek: (seg: number) => void;
  onAdicionarDesvio: (d: Desvio) => void;
  onRemoverDesvio: (idx: number) => void;
  onGerarManual: () => void;
  onGerarTrechosIA: (provider: 'claude' | 'gemini') => void;
  pendingTrechos: {
    adicionando?: boolean;
    removendo?: boolean;
    claude?: { isPending: boolean; provider?: string };
  };
  // Transcricao
  transcricao?: TranscricaoLinha[];
  currentTime: number;
  onAtualizarTranscricao: () => void;
  transcricaoAtualizando: boolean;
  /** AUDITORIA-v2 Ã‚Â§9 (CP10): 'legacy' (default) preserva o header atual
   *  (EditorFase1). 'workbench' move "Regerar transcriÃƒÂ§ÃƒÂ£o" pro rodapÃƒÂ©
   *  retrÃƒÂ¡til "MAIS AÃƒâ€¡Ãƒâ€¢ES". */
  variant?: 'legacy' | 'workbench';
}

// D-447: a aba "AvaliaÃƒÂ§ÃƒÂ£o" mora aqui, e nÃƒÂ£o numa tela nova, porque a
// pergunta que ela responde Ã¢â‚¬â€ "o que sobrou se sustenta?" Ã¢â‚¬â€ sÃƒÂ³ faz sentido
// ao lado do material que a responde: os trechos removidos e a transcriÃƒÂ§ÃƒÂ£o.
// D-576: a aba "Ordem" fica ao lado de "Trechos a remover" porque as duas
// respondem perguntas vizinhas sobre o MESMO material Ã¢â‚¬â€ o que sai e em que
// ordem entra o que ficou. Separadas para o editor nÃƒÂ£o confundir remover com
// mover; vizinhas para ele nÃƒÂ£o ter de trocar de tela entre as duas.
type TabId = 'trechos' | 'ordem' | 'transcricao' | 'avaliacao';

/**
 * "00:22:09.000" Ã¢â€ â€™ "22:09.0". O protÃƒÂ³tipo v3 mostra dÃƒÂ©cimos: os
 * milissegundos cheios alargavam a coluna de tempo e empurravam o texto
 * do trecho, sem acrescentar precisÃƒÂ£o ÃƒÂºtil na leitura.
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
  onGerarTrechosIA,
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

  // D-360: diarizaÃƒÂ§ÃƒÂ£o por corte. projetoId sai do corte jÃƒÂ¡ em cache; o mapa de
  // falantes resolve SPEAKER_xx Ã¢â€ â€™ nome/canal na etiqueta inline da transcriÃƒÂ§ÃƒÂ£o.
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
      {/* F-058: influÃƒÂªncia manual do editor no prompt da thumbnail. */}
      <div className="flex-shrink-0 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <ThumbnailHintsEditor corteId={corteId} initialValue={hintsThumbnail} />
      </div>
      {/* Tabs planas com sublinhado (DE-PARA-v3 Ã‚Â§3): sem caixa e sem sombra,
          alinhadas ao TabStrip fino do shell. O fundo `inset` saiu junto Ã¢â‚¬â€
          a faixa agora sÃƒÂ³ tem a divisÃƒÂ³ria inferior. */}
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
          id="ordem"
          active={tab === 'ordem'}
          onClick={() => setTab('ordem')}
          label="Ordem"
        />
        <TabButton
          id="transcricao"
          active={tab === 'transcricao'}
          onClick={() => setTab('transcricao')}
          label="TranscriÃƒÂ§ÃƒÂ£o"
          count={transcricao?.length ?? 0}
        />
        <TabButton
          id="avaliacao"
          active={tab === 'avaliacao'}
          onClick={() => setTab('avaliacao')}
          label="AvaliaÃƒÂ§ÃƒÂ£o"
        />
        <div className="flex-1" />
        {/* AUDITORIA-v2 Ã‚Â§9 (CP10): no Workbench o refresh sai do header
            (baixo uso) e migra pro rodapÃƒÂ© "MAIS AÃƒâ€¡Ãƒâ€¢ES" abaixo; legacy
            mantÃƒÂ©m 100% como sempre. */}
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
      ) : tab === 'ordem' ? (
        <BlocosTab
          corteId={corteId}
          projetoId={projetoId}
          pontoSeg={currentTime}
          onSeek={onSeek}
        />
      ) : tab === 'trechos' ? (
        <TrechosList
          desvios={desvios}
          selectedDesvioIdx={selectedDesvioIdx}
          onSeek={onSeek}
          onAdicionarDesvio={onAdicionarDesvio}
          onRemoverDesvio={onRemoverDesvio}
          onGerarManual={onGerarManual}
          onGerarTrechosIA={onGerarTrechosIA}
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
          label="Mais aÃƒÂ§ÃƒÂµes"
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
            {refreshPending ? 'Atualizando transcriÃƒÂ§ÃƒÂ£oÃ¢â‚¬Â¦' : 'Regerar transcriÃƒÂ§ÃƒÂ£o'}
          </button>
        </RetractableFooter>
      )}
    </section>
  );
}

/**
 * Aba plana com sublinhado (DE-PARA-v3 Ã‚Â§3). Antes era uma caixa com borda,
 * fundo prÃƒÂ³prio e `shadow-sm` Ã¢â‚¬â€ visual de tab antigo, destoando do TabStrip
 * fino e plano do resto do shell. Agora: sÃƒÂ³ rÃƒÂ³tulo + contador, ativo marcado
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
  /** Ausente = aba sem contador (a de AvaliaÃƒÂ§ÃƒÂ£o nÃƒÂ£o conta itens). */
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ TrechosList Ã¢â‚¬â€ v2_bruto.jsx:484-548 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

// D-422: o badge do trecho passou a mostrar o MOTIVO da remoÃƒÂ§ÃƒÂ£o (repetiÃƒÂ§ÃƒÂ£o,
// tangente, imprecisÃƒÂ£oÃ¢â‚¬Â¦) em vez de um "IA" ÃƒÂºnico para tudo que a IA propÃƒÂ´s. A
// resoluÃƒÂ§ÃƒÂ£o vive em `trechoBadge.ts` (testÃƒÂ¡vel, cobre legados sem `categoria`).

function TrechosList({
  desvios,
  selectedDesvioIdx,
  onSeek,
  onAdicionarDesvio,
  onRemoverDesvio,
  onGerarManual,
  onGerarTrechosIA,
  pending,
}: {
  desvios: Desvio[];
  selectedDesvioIdx: number | null;
  onSeek: (seg: number) => void;
  onAdicionarDesvio: (d: Desvio) => void;
  onRemoverDesvio: (idx: number) => void;
  onGerarManual: () => void;
  onGerarTrechosIA: (provider: 'claude' | 'gemini') => void;
  pending: {
    adicionando?: boolean;
    removendo?: boolean;
    claude?: { isPending: boolean; provider?: string };
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
      motivo: 'Manual Ã¢â‚¬â€ recortado pelo editor',
    });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Sub-barra compacta do protÃƒÂ³tipo v3: AI|Manual num segmented pequeno
          (antes eram dois botÃƒÂµes de altura cheia, que pesavam mais que as
          prÃƒÂ³prias linhas de trecho) e o Ã¯Â¼â€¹ em acento suave, 30Ãƒâ€”30. */}
      <div className="flex flex-shrink-0 items-center gap-1.5 px-3 pb-2 pt-2">
        <div className="inline-flex gap-0.5 rounded-[8px] border border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-[3px]">
          <Tooltip label="Gerar trechos a remover via Claude" side="bottom">
            <ClaudeAiButton
              size="sm"
              pending={pending.claude?.isPending && pending.claude?.provider === 'claude'}
              disabled={pending.claude?.isPending && pending.claude?.provider !== 'claude'}
              onClick={() => onGerarTrechosIA('claude')}
              className="h-[26px] gap-1.5 rounded-[6px] px-3 text-[10.5px]"
            />
          </Tooltip>
          <Tooltip label="Gerar trechos a remover via Gemini" side="bottom">
            <GeminiAiButton
              size="sm"
              pending={pending.claude?.isPending && pending.claude?.provider === 'gemini'}
              disabled={pending.claude?.isPending && pending.claude?.provider !== 'gemini'}
              onClick={() => onGerarTrechosIA('gemini')}
              className="h-[26px] gap-1.5 rounded-[6px] px-3 text-[10.5px] ml-1"
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

      {/* Lista Ã¢â‚¬â€ v2_bruto.jsx:507-547 */}
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
                      Ã¢Ë†â€™{delta.toFixed(1)}s
                    </span>
                  </div>
                  {/* DE-PARA-v3 Ã‚Â§3: o motivo ÃƒÂ© apoio, nÃƒÂ£o o conteÃƒÂºdo principal
                      da linha Ã¢â‚¬â€ daÃƒÂ­ o tom mudo.

                      D-511: mas ele deixou de ser CORTADO. Com `line-clamp-2` o
                      motivo terminava no meio de uma frase, e conferir o corte
                      exigia sair da tela. Um motivo longo ocupa mais trÃƒÂªs
                      linhas; um motivo pela metade custa uma ida e volta. */}
                  <div className="whitespace-pre-wrap break-words text-[11px] leading-[1.4] text-[var(--wb-text-mute)]">
                    {d.motivo || 'Ã¢â‚¬â€'}
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

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ TranscriptList Ã¢â‚¬â€ v2_bruto.jsx:550-624 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

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

  // D-360: sÃƒÂ³ mostra a etiqueta quando ao menos uma linha tem falante.
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
      {/* Busca Ã¢â‚¬â€ v2_bruto.jsx:553-582 */}
      <div className="flex-shrink-0 space-y-2 border-b border-[var(--wb-border-soft)] px-3 py-2.5">
        <div className="flex h-[30px] items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-2.5">
          <Search size={13} className="text-[var(--wb-text-dim)]" aria-hidden />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar palavra..."
            className="flex-1 bg-transparent text-[12.5px] text-[var(--wb-text)] outline-none placeholder:text-[var(--wb-text-dim)]"
          />
          <span className="font-code text-[10px] text-[var(--wb-text-dim)]">Ã¢Å’ËœF</span>
        </div>
        {/* D-360: diariza sÃƒÂ³ este corte (evita rodar o vÃƒÂ­deo inteiro). */}
        <Tooltip
          label="Identifica os falantes sÃƒÂ³ neste corte (nÃƒÂ£o roda o vÃƒÂ­deo todo)"
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

      {/* Linhas Ã¢â‚¬â€ v2_bruto.jsx:584-621 */}
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

// D-360: chip inline do falante. Resolve SPEAKER_xx Ã¢â€ â€™ nome/canal via mapa; sem
// nome batizado cai para "Falante N". Linhas sem `speaker` (fora da janela
// diarizada) nÃƒÂ£o renderizam badge.
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
