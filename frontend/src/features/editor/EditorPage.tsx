import { Navigate } from 'react-router-dom';
import { audioProxyUrl, waveformPeaksUrl } from '@/lib/api';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EditorFase1 } from './fase1/EditorFase1';
import { TrechosManualModal } from './fase1/TrechosManualModal';
import { BrutoContextStrip } from './fase1/BrutoContextStrip';
import { ShortcutsHelpModal } from './ShortcutsHelpModal';
import { hmsParaSeg, segParaMmSs } from './timeUtils';
import { BancadaChrome } from '@/features/editor/BancadaChrome';
import { montarBarraDoEditor } from './acoesDoEditor';
import { resolveWaveformWindow } from './editorEditState';
import { rawEditorPath } from '@/features/post-production/postProductionNavigation';
import { estaAprovado } from '@/lib/statusDoCorte';
import { ORIGEM_API } from '@/lib/apiBase';
import { useEditorPage } from './useEditorPage';
import { EstadoCarregando, EstadoVazio } from '@/components/ui/estado-vazio';
import { EstadoDeErro } from '@/components/ui/estado-de-erro';
import { CabecalhoDoCorte } from './CabecalhoDoCorte';

function appendQueryParams(url: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params).toString();
  return `${url}${url.includes('?') ? '&' : '?'}${search}`;
}

export function EditorPage() {
  const { adicionarDesvio, adicionarTrechoAqui, alternarVelocidade, atualizarCorte, bindings, brutoMutationPendenteNoCorteAtual, brutoPronto, brutoStatusAtual, confirmacao, contextoCorte, corte, corteId, corteQuery, corteUI, cortes, cortesQuery, currentTime, dividirCorte, exportStatusQ, handleGerarBrutoPrincipal, handleGerarTrechosIA, intervaloAberto, irParaPos, isDirty, juntarCortes, liquidoSeg, metaClaudeStatus, nextCut, onChangeDesvio, onChangeSpeed, onCriarCorteDaSelecao, onDividirCorteAqui, onJuntarProximoCorte, onSeekTimeline, onSelectDesvioByTime, patchDirty, playbackRate, playerRef, pointerMode, previousCut, projeto, projetoId, qc, riscados, riscar, salvarMudancas, selectedDesvioIdx, setCurrentTime, setFimAtual, setInicioAtual, setIntervaloAberto, setPointerMode, setShortcutsOpen, setSmartPlay, setTrechoLocked, setTrechosManualOpen, setWaveformRefreshKey, shortcutsOpen, sincTrans, smartPlay, statusBruto, toggleAprovado, toggleFire, toggleLeitura, trechoLocked, trechosClaudePendente, trechosManualOpen, waveformRefreshKey, waveformWindowRef } = useEditorPage();


  if (!projetoId) return <Navigate to="/projetos" replace />;

  if (!corteId && !cortesQuery.isLoading && cortes.length === 0) {
    return (
      <EstadoVazio className="h-full" icone="scissors" titulo="Esta live ainda não tem cortes"
        descricao="Rode a análise da live ou importe cortes para abrir o editor." />
    );
  }

  if (corteQuery.isLoading || cortesQuery.isLoading || !corteUI) {
    return <EstadoCarregando className="p-6" frase="Carregando o corte…" linhas={2} />;
  }

  if (corteQuery.isError) {
    return (
      <EstadoDeErro className="h-full" titulo="Não foi possível carregar o corte"
        motivo={(corteQuery.error as Error).message} />
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
      <ConfirmDialog
        pedido={confirmacao.pedido}
        onCancel={confirmacao.cancelar}
        onConfirm={confirmacao.confirmar}
      />
    </>
  );

  // D-1150 (§7.3): cabeçalho com o mapa compacto (troca de corte; a lista lateral
  // saiu) → contexto → duas colunas: palco, transporte e linha do tempo à esquerda,
  // as abas à direita. O principal da barra diz o próximo passo do corte (D-1041).

  return (
    <>
      <BancadaChrome
        projetoId={projetoId}
        tituloLive={projeto.data?.titulo_live ?? 'Live'}
        cortes={cortes}
        corte={corteUI}
        exportStatus={exportStatusQ.data?.cortes ?? []}
        caminhoDoCorte={(item) => rawEditorPath(projetoId, item.id)}
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
        barra={montarBarraDoEditor({ aprovado: estaAprovado(corteUI.status), brutoPronto, brutoOcupado: brutoStatusAtual === 'processando' || brutoMutationPendenteNoCorteAtual, salvando: atualizarCorte.isPending, brutoDefasado: Boolean(statusBruto.data?.bruto_defasado), onAlternarVeredito: toggleAprovado, onGerarBruto: handleGerarBrutoPrincipal, onIrParaPos: irParaPos })}
        riscar={{ onRiscar: riscar.riscarCorte, bloqueio: riscar.bloqueio }}
        semLista
      />

      <div data-sala="" className="relative flex h-full min-h-0 flex-col overflow-hidden">
        <CabecalhoDoCorte
          projetoId={projetoId}
          tituloLive={projeto.data?.titulo_live ?? 'Live'}
          duracaoLiveSeg={projeto.data?.duracao_segundos ?? 0}
          cortes={cortes}
          corte={corteUI}
          caminhoDoCorte={(item) => rawEditorPath(projetoId, item.id)}
          comRiscados
        />

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
            proximoInicioSeg={nextCut?.inicio_seg}
            proximoNumero={nextCut?.numero}
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
            riscados={riscados}
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
              removendo: riscados.ocupado,
              claude: trechosClaudePendente,
            }}
          />
        </div>
      </div>

      {editorModals}
    </>
  );
}
