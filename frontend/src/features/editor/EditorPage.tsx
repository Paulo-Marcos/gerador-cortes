import { Navigate } from 'react-router-dom';
import { audioProxyUrl, waveformPeaksUrl } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2 } from 'lucide-react';
import { EditorFase1 } from './fase1/EditorFase1';
import { TrechosManualModal } from './fase1/TrechosManualModal';
import { BrutoContextStrip } from './fase1/BrutoContextStrip';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';
import { hmsParaSeg, segParaMmSs } from './timeUtils';
import { BancadaChrome } from '@/features/editor/BancadaChrome';
import { AvaliacaoCorteModal } from './avaliacao/AvaliacaoCorteModal';
import { resolveWaveformWindow } from './editorEditState';
import { resolveCorteStagePath } from '@/features/post-production/postProductionNavigation';
import { ORIGEM_API } from '@/lib/apiBase';
import { useEditorPage } from './useEditorPage';

function appendQueryParams(url: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${search}`;
}

export function EditorPage() {
  const { adicionarDesvio, adicionarTrechoAqui, alternarVelocidade, atualizarCorte, avaliacaoOpen, bindings, brutoMutationPendenteNoCorteAtual, brutoPronto, brutoStatusAtual, confirmacao, contextoCorte, corte, corteId, corteQuery, corteUI, cortes, cortesQuery, currentTime, dividirCorte, excluirCorte, exportStatusQ, handleGerarBrutoPrincipal, handleGerarTrechosIA, intervaloAberto, isDirty, juntarCortes, liquidoSeg, metaClaudeStatus, nextCut, onAdicionarDesvio, onChangeDesvio, onChangeSpeed, onCriarCorteDaSelecao, onDividirCorteAqui, onJuntarProximoCorte, onRemoverDesvio, onSeekTimeline, onSelectDesvioByTime, patchDirty, playbackRate, playerRef, pointerMode, previousCut, projeto, projetoId, qc, removerDesvio, salvarMudancas, selectedDesvioIdx, setAvaliacaoOpen, setCurrentTime, setFimAtual, setInicioAtual, setIntervaloAberto, setPointerMode, setShortcutsOpen, setSmartPlay, setTrechoLocked, setTrechosManualOpen, setWaveformRefreshKey, shortcutsOpen, sincTrans, smartPlay, statusBruto, toggleAprovado, toggleFire, toggleLeitura, trechoLocked, trechosClaudePendente, trechosManualOpen, waveformRefreshKey, waveformWindowRef } = useEditorPage();


  if (!projetoId) return <Navigate to="/projetos" replace />;

  if (!corteId && !cortesQuery.isLoading && cortes.length === 0) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3 p-8 text-center text-[var(--wb-text-mute)]">
        <h1 className="font-editorial text-3xl font-medium text-[var(--wb-text)]">
          Este projeto ainda nao tem cortes
        </h1>
        <p className="max-w-md text-sm">
          Rode a analise da live ou importe cortes para abrir o editor funcional.
        </p>
      </div>
    );
  }

  if (corteQuery.isLoading || cortesQuery.isLoading || !corteUI) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] items-center justify-center text-[var(--wb-text-dim)]">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Carregando corte...
      </div>
    );
  }

  if (corteQuery.isError) {
    return (
      <div className="flex min-h-[calc(100vh-3.5rem)] flex-col items-center justify-center gap-3 p-8 text-center text-error">
        <h1 className="font-editorial text-3xl font-medium">Nao foi possivel carregar o corte</h1>
        <p className="max-w-xl text-sm">{(corteQuery.error as Error).message}</p>
      </div>
    );
  }

  const videoOriginal = `${ORIGEM_API}/videos/${projetoId}/video.mkv`;
  const persistedInicioSeg = corte?.inicio_seg ?? corteUI.inicio_seg;
  const persistedFimSeg = corte?.fim_seg ?? corteUI.fim_seg;
  const waveformWindow = (() => {
    const next = resolveWaveformWindow({
      current: waveformWindowRef.current,
      corteId,
      inicioSeg: persistedInicioSeg,
      fimSeg: persistedFimSeg,
      refreshKey: waveformRefreshKey,
      preloadBeforeSec: contextoCorte.antesSeg,
      preloadAfterSec: contextoCorte.depoisSeg,
    });
    waveformWindowRef.current = next;
    return next;
  })();
  const waveformVersion = waveformWindow.version;
  const shouldRefreshWaveform = waveformRefreshKey > 0;
  const waveformAudio = appendQueryParams(audioProxyUrl(corteId, shouldRefreshWaveform), {
    v: waveformVersion,
  });
  const waveformPeaks = appendQueryParams(waveformPeaksUrl(corteId, shouldRefreshWaveform), {
    v: waveformVersion,
  });
  const waveformOffsetSec = waveformWindow.startSec;

  // Loading enquanto QUALQUER passo roda: vídeo+cenas (status fica "cortando" até
  // o worker inteiro terminar) OU metadados (mutation paralela do front).
  const brutoBusy =
    brutoStatusAtual === 'processando' ||
    brutoMutationPendenteNoCorteAtual ||
    metaClaudeStatus === 'rodando';
  const durSeg = Math.max(0, corteUI.fim_seg - corteUI.inicio_seg);

  function aplicarIntervaloManual(novoInicioHms: string, novoFimHms: string) {
    const inicioSeg = hmsParaSeg(novoInicioHms);
    const fimSeg = hmsParaSeg(novoFimHms);
    patchDirty({
      inicio_hms: novoInicioHms,
      fim_hms: novoFimHms,
      inicio_seg: inicioSeg,
      fim_seg: fimSeg,
    });
    setIntervaloAberto(false);
  }

  const exportStatuses = exportStatusQ.data?.cortes ?? [];

  const editorModals = (
    <>
      <ShortcutsHelpModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
        bindings={bindings}
      />
      <TrechosManualModal
        open={trechosManualOpen}
        onClose={() => setTrechosManualOpen(false)}
        corteId={corteId}
      />
      <AvaliacaoCorteModal
        open={avaliacaoOpen}
        corteId={corteId}
        onClose={() => setAvaliacaoOpen(false)}
        descricao="O bruto está sendo gerado em segundo plano"
      />
      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
    </>
  );

  // ── Shell Workbench (Etapa 3): mesma orquestração, re-hospedada ──
  // Painel CORTES retrátil + centro (player 16:9 com cap → transporte →
  // contexto → timeline flex:1) + painel direito retrátil. A lógica acima
  // (hooks, atalhos, dirty, waveform window) é EXATAMENTE a mesma do
  // layout legado — só o container muda.

  return (
    <>
      <BancadaChrome
        projetoId={projetoId}
        tituloLive={projeto.data?.titulo_live ?? 'Live'}
        cortes={cortes}
        corte={corteUI}
        exportStatus={exportStatusQ.data?.cortes ?? []}
        caminhoDoCorte={(item) =>
          resolveCorteStagePath({
            projetoId,
            corte: item,
            status: exportStatuses.find((status) => status.corte_id === item.id),
          })
        }
        sub={`bruto ${segParaMmSs(durSeg)} · líquido ${segParaMmSs(liquidoSeg)} · ${(corteUI.desvios ?? []).length} trechos`}
        fire={corteUI.is_fire}
        sujo={isDirty}
        salvando={atualizarCorte.isPending}
        brutoPronto={brutoPronto}
        brutoOcupado={brutoBusy}
        onSalvar={salvarMudancas}
        onGerarBruto={handleGerarBrutoPrincipal}
        onToggleFire={() => toggleFire.mutate()}
        fireOcupado={toggleFire.isPending}
        leitura={{
          ativo: Boolean(corteUI.is_leitura),
          autor: corteUI.autor_leitura ?? '',
          parte: corteUI.parte_leitura ?? 1,
          ocupado: toggleLeitura.isPending,
          onAlternar: () => toggleLeitura.mutate(corteUI),
          // Mesmo caminho do legado: o backend reaplica o prefixo
          // "Leitura - autor - PT.n |" no título e o metadado é invalidado.
          onAtualizar: (patch) =>
            atualizarCorte.mutate(patch, {
              onSuccess: () => qc.invalidateQueries({ queryKey: ['metadado', corteId] }),
            }),
        }}
        onAprovar={toggleAprovado}
        onExcluir={excluirCorte}
      />

      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >

        <BrutoContextStrip
          previous={previousCut ? { numero: previousCut.numero, hms: previousCut.fim_hms } : null}
          next={nextCut ? { numero: nextCut.numero, hms: nextCut.inicio_hms } : null}
          inicioHms={corteUI.inicio_hms}
          fimHms={corteUI.fim_hms}
          inicioSeg={hmsParaSeg(corteUI.inicio_hms)}
          currentTime={currentTime}
          durSeg={durSeg}
          liquidoSeg={liquidoSeg}
          intervaloAberto={intervaloAberto}
          onToggleIntervalo={() => setIntervaloAberto((v) => !v)}
          onAplicarIntervalo={aplicarIntervaloManual}
        />

        <div className="min-h-0 flex-1">
          <EditorFase1
            videoSrc={videoOriginal}
            audioSrc={waveformAudio}
            waveformPeaksSrc={waveformPeaks}
            corte={corteUI}
            audioOffsetSec={waveformOffsetSec}
            currentTime={currentTime}
            playbackRate={playbackRate}
            brutoStatus={statusBruto.data}
            brutoPronto={brutoPronto}
            playerRef={playerRef}
            audioPreviewSrc={waveformAudio}
            audioPreviewStartSec={waveformOffsetSec}
            audioOffsetMs={corteUI.audio_offset_ms ?? 0}
            onAudioOffsetChange={(ms) => patchDirty({ audio_offset_ms: ms })}
            onTimeUpdate={setCurrentTime}
            onSeek={onSeekTimeline}
            onChangeSpeed={onChangeSpeed}
            onSetInicioAqui={setInicioAtual}
            onSetFimAqui={setFimAtual}
            onAtualizarAudioTimeline={() => setWaveformRefreshKey((k) => k + 1)}
            trechoLocked={trechoLocked}
            onToggleTrechoLocked={() => setTrechoLocked((v) => !v)}
            pointerMode={pointerMode}
            onTogglePointerMode={() => setPointerMode((v) => !v)}
            smartPlay={smartPlay}
            onToggleSmartPlay={() => setSmartPlay((v) => !v)}
            selectedDesvioIdx={selectedDesvioIdx}
            onSelectDesvioByTime={onSelectDesvioByTime}
            onAdicionarTrechoAqui={adicionarTrechoAqui}
            onGerarBruto={handleGerarBrutoPrincipal}
            onAtualizarTranscricao={() => sincTrans.mutate()}
            onChangeDesvio={onChangeDesvio}
            onAdicionarDesvio={onAdicionarDesvio}
            onRemoverDesvio={onRemoverDesvio}
            onCriarCorteDaSelecao={onCriarCorteDaSelecao}
            onDividirCorteAqui={onDividirCorteAqui}
            dividindoCorte={dividirCorte.isPending}
            onJuntarProximoCorte={onJuntarProximoCorte}
            juntandoCorte={juntarCortes.isPending}
            onAlternarVelocidade={alternarVelocidade}
            onGerarManual={() => setTrechosManualOpen(true)}
            onGerarTrechosIA={handleGerarTrechosIA}
            pending={{
              bruto: brutoMutationPendenteNoCorteAtual,
              transcricao: sincTrans.isPending,
              adicionando: adicionarDesvio.isPending,
              removendo: removerDesvio.isPending,
              claude: trechosClaudePendente,
            }}
          />
        </div>
      </div>

      {editorModals}
    </>
  );
}
