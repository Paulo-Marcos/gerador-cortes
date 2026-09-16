import type { RefObject } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { TransporteBar } from '@/upgrade/telas/TransporteBar';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';
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
// D-599: a casca nova tem outra geometria (o palco manda no enquadramento e a
// coluna direita e mais estreita). Chave de persistencia propria para que o
// layout que o Paulo ajustou numa casca nao seja imposto a outra.
const PANEL_PERSIST_AP = 'editor-fase1-panels-ap';
const CASCA_NOVA = isUpgradeShellEnabled();

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
  onJuntarProximoCorte?: () => void;
  juntandoCorte?: boolean;
  onAlternarVelocidade?: () => void;
  onGerarManual: () => void;
  onGerarTrechosIA: (provider: 'claude' | 'gemini') => void;
  pending: {
    bruto?: boolean;
    transcricao?: boolean;
    adicionando?: boolean;
    removendo?: boolean;
    claude?: { isPending: boolean; provider?: string };
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
  onJuntarProximoCorte,
  juntandoCorte,
  onAlternarVelocidade,
  onGerarManual,
  onGerarTrechosIA,
  pending,
}: Props) {
  const brutoPronto = brutoProntoProp ?? !!brutoStatus?.clip_gerado;
  const statusBruto =
    (brutoStatus?.status as 'idle' | 'processando' | 'concluido' | 'erro') ?? 'idle';

  return (
    <PanelGroup
      direction="horizontal"
      autoSaveId={`${CASCA_NOVA ? PANEL_PERSIST_AP : PANEL_PERSIST}-h`}
      className={CASCA_NOVA ? 'h-full py-2' : 'h-full p-3'}
      style={{ gap: CASCA_NOVA ? 14 : 12 }}
    >
      {/* Esquerda: Player (cresce) + Timeline (compact rente aos timecodes) */}
      {/* No design a coluna direita e uma faixa fixa de 320px; aqui ela
          continua redimensionavel (decisao anterior do Paulo) com o default
          aproximado dessa largura. */}
      <Panel defaultSize={CASCA_NOVA ? 68 : 62} minSize={40} order={1}>
        <PanelGroup
          direction="vertical"
          autoSaveId={`${CASCA_NOVA ? PANEL_PERSIST_AP : PANEL_PERSIST}-left-v`}
        >
          <Panel defaultSize={65} minSize={30} order={1}>
            <PlayerPanel
              ref={playerRef}
              variant={CASCA_NOVA ? 'ap' : 'legacy'}
              selo={brutoPronto ? 'BRUTO · pronto' : 'VÍDEO ORIGINAL'}
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
          {/* D-599: o protótipo separa ASSISTIR de EDITAR em dois cartões.
              A barra fica fora do painel redimensionável de propósito: ela
              tem altura fixa, e deixá-la encolher junto com a linha do tempo
              esconderia o play — o controle que mais se usa. */}
          {CASCA_NOVA ? (
            <TransporteBar
              playerRef={playerRef}
              inicioSeg={corte.inicio_seg}
              fimSeg={corte.fim_seg}
              currentTime={currentTime}
              playbackRate={playbackRate}
              onChangeSpeed={onChangeSpeed}
              trechos={(corte.desvios ?? []).length}
              fontes={[{ texto: brutoPronto ? 'Bruto pronto' : 'Vídeo original', ativa: true }]}
            />
          ) : null}
          <Panel defaultSize={35} minSize={15} order={2}>
            <TimelinePanel
              variant={CASCA_NOVA ? 'ap' : undefined}
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
              onJuntarProximo={onJuntarProximoCorte}
              juntando={juntandoCorte}
              onAlternarVelocidade={onAlternarVelocidade}
              onGerarBruto={onGerarBruto}
              brutoPronto={brutoPronto}
              brutoStatus={statusBruto}
            />
          </Panel>
        </PanelGroup>
      </Panel>

      <PanelResizeHandle className="w-2 transition-colors hover:bg-[var(--wb-border-soft)]" />

      {/* Direita: RightTabsPanel vertical inteiro */}
      {/* 32% e nao 26%: a casca ja gasta 462px com trilho + contexto, e 26% do
          que sobra numa tela de 1366px dava ~230px — a lista de trechos
          quebrava palavra por letra. 32% fica perto dos 320px do design nas
          larguras comuns (1366 a 1920). */}
      <Panel defaultSize={CASCA_NOVA ? 32 : 38} minSize={CASCA_NOVA ? 26 : 22} order={2}>
        <RightTabsPanel
          corteId={corte.id}
          hintsThumbnail={corte.hints_thumbnail}
          desvios={corte.desvios ?? []}
          selectedDesvioIdx={selectedDesvioIdx}
          onSeek={onSeek}
          onAdicionarDesvio={onAdicionarDesvio}
          onRemoverDesvio={onRemoverDesvio}
          onGerarManual={onGerarManual}
          onGerarTrechosIA={onGerarTrechosIA}
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
