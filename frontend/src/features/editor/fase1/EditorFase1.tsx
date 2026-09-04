import type { RefObject } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { Corte, StatusBrutoResponse } from '@/types/models';
import { PlayerPanel, type PlayerHandle } from './PlayerPanel';
import { TimelinePanel } from './TimelinePanel';
import { RightTabsPanel } from './RightTabsPanel';

// ─────────────────────────────────────────────────────────────
// EditorFase1 — layout do Bruto (`01_BRUTO.md > Layout geral`)
// adaptado por decisao Paulo: containers redimensionaveis via
// react-resizable-panels (em vez de grid CSS fixo).
//
// Esquerda (62% default):
//   - Player (65% default, min 30%)
//   - Timeline (35% default, min 15%)
// Direita (38%): RightTabsPanel span vertical inteiro.
//
// Container do Player CRESCE para ocupar espaco quando a Timeline e
// reduzida (resize). O waveform interno usa height:'auto' do WaveSurfer
// para preencher o painel sem deixar faixa cinza embaixo.
// ─────────────────────────────────────────────────────────────

const PANEL_PERSIST = 'editor-fase1-panels-v2';

interface Props {
  videoSrc: string;
  audioSrc: string;
  waveformPeaksSrc: string;
  corte: Corte;
  audioOffsetSec: number;
  currentTime: number;
  playbackRate: number;
  brutoStatus?: StatusBrutoResponse;
  brutoPronto?: boolean;
  playerRef: RefObject<PlayerHandle>;
  // F-063: sincronia fina de áudio (lip-sync).
  audioPreviewSrc?: string;
  audioPreviewStartSec?: number;
  audioOffsetMs?: number;
  onAudioOffsetChange?: (ms: number) => void;
  onTimeUpdate: (t: number) => void;
  onSeek: (seg: number) => void;
  onSkip: (delta: number) => void;
  onChangeSpeed: (delta: number) => void;
  onSetInicioAqui: () => void;
  onSetFimAqui: () => void;
  onAtualizarAudioTimeline: () => void;
  trechoLocked: boolean;
  onToggleTrechoLocked: () => void;
  pointerMode: boolean;
  onTogglePointerMode: () => void;
  smartPlay: boolean;
  onToggleSmartPlay: () => void;
  selectedDesvioIdx: number | null;
  onSelectDesvioByTime: (time: number) => void;
  onAdicionarTrechoAqui: () => void;
  onGerarBruto: () => void;
  onAtualizarTranscricao: () => void;
  onChangeDesvio: (idx: number, novoInicio: string, novoFim: string) => void;
  onAdicionarDesvio: (d: { inicio_hms: string; fim_hms: string; motivo: string }) => void;
  onRemoverDesvio: (idx: number) => void;
  onCriarCorteDaSelecao: (inicioHms: string, fimHms: string, titulo: string) => void;
  onDividirCorteAqui: () => void;
  dividindoCorte: boolean;
  onGerarManual: () => void;
  onGerarTrechosClaude: () => void;
  pending: {
    bruto?: boolean;
    transcricao?: boolean;
    adicionando?: boolean;
    removendo?: boolean;
    claude?: boolean;
  };
}

export function EditorFase1({
  videoSrc,
  audioSrc,
  waveformPeaksSrc,
  corte,
  audioOffsetSec,
  currentTime,
  playbackRate,
  brutoStatus,
  brutoPronto: brutoProntoProp,
  playerRef,
  audioPreviewSrc,
  audioPreviewStartSec,
  audioOffsetMs,
  onAudioOffsetChange,
  onTimeUpdate,
  onSeek,
  onSkip,
  onChangeSpeed,
  onSetInicioAqui,
  onSetFimAqui,
  onAtualizarAudioTimeline,
  trechoLocked,
  onToggleTrechoLocked,
  pointerMode,
  onTogglePointerMode,
  smartPlay,
  onToggleSmartPlay,
  selectedDesvioIdx,
  onSelectDesvioByTime,
  onAdicionarTrechoAqui,
  onGerarBruto,
  onAtualizarTranscricao,
  onChangeDesvio,
  onAdicionarDesvio,
  onRemoverDesvio,
  onCriarCorteDaSelecao,
  onDividirCorteAqui,
  dividindoCorte,
  onGerarManual,
  onGerarTrechosClaude,
  pending,
}: Props) {
  const brutoPronto = brutoProntoProp ?? !!brutoStatus?.clip_gerado;
  const statusBruto =
    (brutoStatus?.status as 'idle' | 'processando' | 'concluido' | 'erro') ?? 'idle';

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId={`${PANEL_PERSIST}-h`}
      className="h-full p-3"
      style={{ gap: 12 }}
    >
      {/* Esquerda: Player (cresce) + Timeline (compact rente aos timecodes) */}
      <Panel defaultSize={62} minSize={40} order={1}>
        <PanelGroup direction="vertical" autoSaveId={`${PANEL_PERSIST}-left-v`}>
          <Panel defaultSize={65} minSize={30} order={1}>
            <PlayerPanel
              ref={playerRef}
              src={videoSrc}
              inicioSeg={corte.inicio_seg}
              fimSeg={corte.fim_seg}
              desvios={corte.desvios ?? []}
              playbackRate={playbackRate}
              smartPlay={smartPlay}
              onTimeUpdate={onTimeUpdate}
              audioPreviewSrc={audioPreviewSrc}
              audioPreviewStartSec={audioPreviewStartSec}
              audioOffsetMs={audioOffsetMs}
              onAudioOffsetChange={onAudioOffsetChange}
            />
          </Panel>
          <PanelResizeHandle className="h-2 transition-colors hover:bg-[var(--wb-border-soft)]" />
          <Panel defaultSize={35} minSize={15} order={2}>
            <TimelinePanel
              audioSrc={audioSrc}
              waveformPeaksSrc={waveformPeaksSrc}
              audioOffsetSec={audioOffsetSec}
              inicioSeg={corte.inicio_seg}
              fimSeg={corte.fim_seg}
              desvios={corte.desvios ?? []}
              currentTime={currentTime}
              playbackRate={playbackRate}
              playerRef={playerRef}
              onSeek={onSeek}
              onSkip={onSkip}
              onChangeSpeed={onChangeSpeed}
              onSetInicioAqui={onSetInicioAqui}
              onSetFimAqui={onSetFimAqui}
              onAtualizarAudioTimeline={onAtualizarAudioTimeline}
              locked={trechoLocked}
              onToggleLocked={onToggleTrechoLocked}
              pointer={pointerMode}
              onTogglePointer={onTogglePointerMode}
              smartPlay={smartPlay}
              onToggleSmartPlay={onToggleSmartPlay}
              onSelectDesvio={onSelectDesvioByTime}
              onAdicionarTrechoAqui={onAdicionarTrechoAqui}
              onChangeDesvio={onChangeDesvio}
              onCriarCorteDaSelecao={onCriarCorteDaSelecao}
              onDividirAqui={onDividirCorteAqui}
              dividindo={dividindoCorte}
              onGerarBruto={onGerarBruto}
              brutoPronto={brutoPronto}
              brutoStatus={statusBruto}
            />
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className="w-2 transition-colors hover:bg-[var(--wb-border-soft)]" />

      {/* Direita: RightTabsPanel vertical inteiro */}
      <Panel defaultSize={38} minSize={22} order={2}>
        <RightTabsPanel
          corteId={corte.id}
          hintsThumbnail={corte.hints_thumbnail}
          desvios={corte.desvios ?? []}
          selectedDesvioIdx={selectedDesvioIdx}
          onSeek={onSeek}
          onAdicionarDesvio={onAdicionarDesvio}
          onRemoverDesvio={onRemoverDesvio}
          onGerarManual={onGerarManual}
          onGerarTrechosClaude={onGerarTrechosClaude}
          pendingTrechos={{
            adicionando: pending.adicionando,
            removendo: pending.removendo,
            claude: pending.claude,
          }}
          transcricao={corte.transcricao_corte}
          currentTime={currentTime}
          onAtualizarTranscricao={onAtualizarTranscricao}
          transcricaoAtualizando={!!pending.transcricao}
        />
      </Panel>
    </PanelGroup>
  );
}
