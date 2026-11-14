import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useState } from 'react';
import type { RefObject } from 'react';
import type { CenaRemotion, Corte, FontePreset } from '@/types/models';
import type { PlayerHandle } from '../fase1/PlayerPanel';
import { cn } from '@/lib/utils';
import { CenaPlayerPanel } from './CenaPlayerPanel';
import { ComTempoDoPlayer, type RelogioDoPlayer } from './relogioDoPlayer';
import { CenasPanel } from './CenasPanel';
import { SceneTimeline } from './SceneTimeline';
import { AberturaEditorial } from './AberturaEditorial';
import { AlertaCenasForaDoCorte } from './AlertaCenasForaDoCorte';
import { FiltroDoCanal } from './FiltroDoCanal';
import { YoutubeLayoutPanel } from './YoutubeLayoutPanel';
import { SegmentoDetectadoPopover } from './SegmentoDetectadoPopover';
import { PanelShell } from '@/components/workbench/PanelShell';
import { useEditorFase2 } from './useEditorFase2';
import { PainelLateralComPiso } from './PainelLateralComPiso';
import { Icon } from '@/upgrade/Icon';

// D-1072: a aba Filtros saiu: o filtro é do canal (RN-25) e aparece como linha.
export type AbaDireita = 'cenas' | 'layout';

const FONT_PRESET_OPTIONS: Array<{
  id: FontePreset;
  label: string;
  stack: string;
}> = [
  { id: 'atual', label: 'Atual', stack: 'Space + Source + IBM Mono' },
  { id: 'moderna', label: 'Moderna', stack: 'Inter + Lora + JetBrains' },
  { id: 'cientifica', label: 'Cientifica', stack: 'IBM Plex (sans+serif+mono)' },
  { id: 'minimalista', label: 'Minimalista', stack: 'DM Sans + DM Serif + Space Mono' },
  { id: 'tecnica', label: 'Tecnica', stack: 'Roboto (sans+serif+mono)' },
];

export interface Props {
  videoSrc: string;
  modoLabel: string;
  corte: Corte;
  cenas: CenaRemotion[];
  formato?: string;
  paleta?: Record<string, string>;
  playerRef: RefObject<PlayerHandle | null>;
  /** D-657: o tempo do player. Ler com `agora()` num gesto; assinar para desenhar. */
  relogio: RelogioDoPlayer;
  onSeek: (seg: number) => void;
  onCenasChange: (cenas: CenaRemotion[]) => void;
  onAbrirStudio: () => void;
  abrindoStudio: boolean;
  playbackRate?: number;
  /** Shell Workbench (AUDITORIA §2b): painéis CENAS/LAYOUT retráteis. */
  workbench?: boolean;
}

const PANEL_PERSIST = 'editor-fase2-panels-v1';
const GRUPO_DOS_PAINEIS = 'editor-fase2-paineis';

export function EditorFase2(props: Props) {
  const {
  videoSrc,
  modoLabel,
  cenas,
  formato,
  paleta,
  corte,
  playerRef,
  relogio,
  onSeek,
  onCenasChange,
  onAbrirStudio,
  abrindoStudio,
  playbackRate,
  workbench = false,
} = props;
  const { abaDireita, cenaAtivaIdx, cenasFora, cenasPanelRef, decidindoSegmento, decidirSegmento, detectandoSegmentos, duracaoDoCorte, fontePresetMutation, fontePresetSelecionado, handleAddRegion, handleAjustarRegiaoSelecionada, handleResizeRegion, handleSelecionarCena, handleSelecionarRegiao, handleToggleRemotion, layoutPanelRef, layoutYoutube, offsetSeg, popoverSegmento, projeto, remotionEnabled, reprocessarSegmentos, segmentosDetectados, selectedCenaIdx, selectedRegionIdx, setAbaDireita, setPopoverSegmento, timelineDuration, timelineWrapperRef } = useEditorFase2(props);


  // ── Shell Workbench (AUDITORIA §2b): CENAS à esquerda, preview+timeline
  // no centro, LAYOUT YOUTUBE à direita — mesmos componentes e estado do
  // modo legado, só o container muda (painéis retráteis do design).
  if (workbench) {
    return (
      <div className="flex h-full min-h-0">
        <PanelShell
          id="cenas"
          side="left"
          title={`CENAS · ${cenas.length}`}
          indicator={<span aria-hidden className="h-2 w-2 rounded-full bg-[var(--wb-accent)]" />}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <AberturaEditorial
              fraseGancho={corte.frase_gancho_texto}
              fraseGanchoHms={corte.frase_gancho_hms}
              contextualizacao={corte.contextualizacao}
            />
            <div className="min-h-0 flex-1">
              <CenasPanel
                ref={cenasPanelRef}
                corteId={corte.id}
                projetoId={corte.projeto_id}
                cenas={cenas}
                formato={formato}
                paleta={paleta}
                cenaAtivaIdx={cenaAtivaIdx}
                cenasValidadas={corte.cenas_validadas === 1}
                onSeek={onSeek}
                onCenasChange={onCenasChange}
              />
            </div>
          </div>
        </PanelShell>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-2.5">
          <AlertaCenasForaDoCorte fora={cenasFora} duracaoCorte={duracaoDoCorte} />
          <div className="min-h-0 flex-1">
            <CenaPlayerPanel
              ref={playerRef}
              src={videoSrc}
              cenas={cenas}
              durationSeg={timelineDuration}
              offsetSeg={offsetSeg}
              modoLabel={modoLabel}
              relogio={relogio}
              onAbrirStudio={onAbrirStudio}
              abrindoStudio={abrindoStudio}
              sombraNivelPadrao={projeto?.sombra_nivel_padrao ?? 'nenhuma'}
              layoutCardPadrao={projeto?.layout_card_padrao ?? 'vertical'}
              fontPreset={fontePresetSelecionado}
              layoutYoutube={layoutYoutube}
              playbackRate={playbackRate}
              remotionEnabled={remotionEnabled}
              onToggleRemotion={handleToggleRemotion}
            />
          </div>
          <div ref={timelineWrapperRef} className="relative flex-none">
            <ComTempoDoPlayer relogio={relogio}>
              {(t) => (
                <SceneTimeline
                  cenas={cenas}
                  currentTime={t + offsetSeg}
                  duration={timelineDuration}
                  layoutYoutube={layoutYoutube}
                  activeIdx={cenaAtivaIdx}
                  selectedCenaIdx={selectedCenaIdx}
                  selectedRegionIdx={selectedRegionIdx}
                  onSeek={onSeek}
                  onSelectCena={(idx) => handleSelecionarCena(idx)}
                  onSelectRegion={(idx) => handleSelecionarRegiao(idx)}
                  onAddRegion={handleAddRegion}
                  onRegionResize={handleResizeRegion}
                  onAjustarInicioPinada={() => handleAjustarRegiaoSelecionada('inicio')}
                  onAjustarFimPinada={() => handleAjustarRegiaoSelecionada('fim')}
                  waveformCorteId={corte.id}
                  waveformSourceStartSec={corte.inicio_seg}
                  waveformSourceEndSec={corte.fim_seg}
                  waveformDesvios={corte.desvios}
                  segmentosDetectados={segmentosDetectados}
                  onReprocessarSegmentosDetectados={
                    corte.arquivo_clip_path ? reprocessarSegmentos : undefined
                  }
                  detectandoSegmentos={detectandoSegmentos}
                  onSelectSegmentoDetectado={(indice, anchorClientX) => {
                    const wrapper = timelineWrapperRef.current;
                    if (!wrapper) return;
                    const rect = wrapper.getBoundingClientRect();
                    setPopoverSegmento({
                      indice,
                      anchorLeft: anchorClientX - rect.left,
                      anchorTop: 28,
                    });
                  }}
                />
              )}
            </ComTempoDoPlayer>
            {popoverSegmento && segmentosDetectados[popoverSegmento.indice] && (
              <SegmentoDetectadoPopover
                segmento={segmentosDetectados[popoverSegmento.indice]}
                indice={popoverSegmento.indice}
                anchor={{
                  left: popoverSegmento.anchorLeft,
                  top: popoverSegmento.anchorTop,
                }}
                disabled={decidindoSegmento}
                onDecidir={(idx, decisao) => decidirSegmento(idx, decisao)}
                onFechar={() => setPopoverSegmento(null)}
              />
            )}
          </div>
        </div>

        <PanelShell
          id="layout"
          side="right"
          title="LAYOUT YOUTUBE"
          headerExtra={<FiltroDoCanal />}
        >
          <div className="flex h-full min-h-0 flex-col">
            <FontePresetPanel
              value={fontePresetSelecionado}
              pending={fontePresetMutation.isPending}
              onChange={(next) => fontePresetMutation.mutate(next)}
            />
            <div className="min-h-0 flex-1">
              <ComTempoDoPlayer relogio={relogio}>
                {(t) => (
                  <YoutubeLayoutPanel
                    ref={layoutPanelRef}
                    corteId={corte.id}
                    projetoId={corte.projeto_id}
                    layout={layoutYoutube}
                    currentTime={t + offsetSeg}
                    duration={timelineDuration}
                    onSeek={onSeek}
                  />
                )}
              </ComTempoDoPlayer>
            </div>
          </div>
        </PanelShell>
      </div>
    );
  }

  return (
    <PanelGroup id={GRUPO_DOS_PAINEIS} direction="horizontal" autoSaveId={PANEL_PERSIST} className="flex-1">
      <Panel id="editor-fase2-principal" defaultSize={70} minSize={40} order={1}>
        <div className="flex h-full min-h-0 flex-col gap-3">
          <AlertaCenasForaDoCorte fora={cenasFora} duracaoCorte={duracaoDoCorte} />
          <div className="min-h-0 flex-1">
            <CenaPlayerPanel
              ref={playerRef}
              src={videoSrc}
              cenas={cenas}
              durationSeg={timelineDuration}
              offsetSeg={offsetSeg}
              modoLabel={modoLabel}
              relogio={relogio}
              onAbrirStudio={onAbrirStudio}
              abrindoStudio={abrindoStudio}
              sombraNivelPadrao={projeto?.sombra_nivel_padrao ?? 'nenhuma'}
              layoutCardPadrao={projeto?.layout_card_padrao ?? 'vertical'}
              fontPreset={fontePresetSelecionado}
              layoutYoutube={layoutYoutube}
              playbackRate={playbackRate}
              remotionEnabled={remotionEnabled}
              onToggleRemotion={handleToggleRemotion}
            />
          </div>
          <div ref={timelineWrapperRef} className="relative">
            <ComTempoDoPlayer relogio={relogio}>
              {(t) => (
                <SceneTimeline
                  cenas={cenas}
                  currentTime={t + offsetSeg}
                  duration={timelineDuration}
                  layoutYoutube={layoutYoutube}
                  activeIdx={cenaAtivaIdx}
                  selectedCenaIdx={selectedCenaIdx}
                  selectedRegionIdx={selectedRegionIdx}
                  onSeek={onSeek}
                  onSelectCena={(idx) => handleSelecionarCena(idx)}
                  onSelectRegion={(idx) => handleSelecionarRegiao(idx)}
                  onAddRegion={handleAddRegion}
                  onRegionResize={handleResizeRegion}
                  onAjustarInicioPinada={() => handleAjustarRegiaoSelecionada('inicio')}
                  onAjustarFimPinada={() => handleAjustarRegiaoSelecionada('fim')}
                  waveformCorteId={corte.id}
                  waveformSourceStartSec={corte.inicio_seg}
                  waveformSourceEndSec={corte.fim_seg}
                  waveformDesvios={corte.desvios}
                  segmentosDetectados={segmentosDetectados}
                  onReprocessarSegmentosDetectados={
                    corte.arquivo_clip_path ? reprocessarSegmentos : undefined
                  }
                  detectandoSegmentos={detectandoSegmentos}
                  onSelectSegmentoDetectado={(indice, anchorClientX) => {
                    // Converte coord global do click para coord local do wrapper.
                    const wrapper = timelineWrapperRef.current;
                    if (!wrapper) return;
                    const rect = wrapper.getBoundingClientRect();
                    setPopoverSegmento({
                      indice,
                      anchorLeft: anchorClientX - rect.left,
                      // Sobe um pouco acima da trilha do Layout YT pra nao tampar.
                      anchorTop: 28,
                    });
                  }}
                />
              )}
            </ComTempoDoPlayer>
            {popoverSegmento && segmentosDetectados[popoverSegmento.indice] && (
              <SegmentoDetectadoPopover
                segmento={segmentosDetectados[popoverSegmento.indice]}
                indice={popoverSegmento.indice}
                anchor={{
                  left: popoverSegmento.anchorLeft,
                  top: popoverSegmento.anchorTop,
                }}
                disabled={decidindoSegmento}
                onDecidir={(idx, decisao) => decidirSegmento(idx, decisao)}
                onFechar={() => setPopoverSegmento(null)}
              />
            )}
          </div>
        </div>
      </Panel>
      <PanelResizeHandle className="w-1 bg-[var(--border)] hover:bg-[color-mix(in_srgb,var(--wb-accent)_50%,transparent)]" />
      <PainelLateralComPiso grupoId={GRUPO_DOS_PAINEIS}>
        <div className="flex h-full min-h-0 flex-col">
          {/* Tabs header — replica v3_pos.jsx:385-432. D-1072: Cenas e Layout. D-1086: o filtro do canal (RN-25)
              é um chip nesta linha, FORA do tablist (o ARIA só admite abas nele), não uma faixa fixa. */}
          <div
            data-testid="linha-das-abas"
            className="flex shrink-0 items-center gap-1 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2"
          >
            <div role="tablist" aria-label="Painel lateral" className="flex items-center gap-1">
              <AbaButton
                ativo={abaDireita === 'cenas'}
                onClick={() => setAbaDireita('cenas')}
                icon={<Icon name="film" />}
                label="Cenas Remotion"
              />
              <AbaButton
                ativo={abaDireita === 'layout'}
                onClick={() => setAbaDireita('layout')}
                icon={<Icon name="monitor" />}
                label="Layout"
              />
            </div>
            <FiltroDoCanal className="ml-auto" />
          </div>
          <div className="min-h-0 flex-1">
            {abaDireita === 'cenas' ? (
              <div className="flex h-full min-h-0 flex-col">
                <AberturaEditorial
                  fraseGancho={corte.frase_gancho_texto}
                  fraseGanchoHms={corte.frase_gancho_hms}
                  contextualizacao={corte.contextualizacao}
                />
                <div className="min-h-0 flex-1">
                  <CenasPanel
                    ref={cenasPanelRef}
                    corteId={corte.id}
                    projetoId={corte.projeto_id}
                    cenas={cenas}
                    formato={formato}
                    paleta={paleta}
                    cenaAtivaIdx={cenaAtivaIdx}
                    cenasValidadas={corte.cenas_validadas === 1}
                    onSeek={onSeek}
                    onCenasChange={onCenasChange}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full min-h-0 flex-col">
                <FontePresetPanel
                  value={fontePresetSelecionado}
                  pending={fontePresetMutation.isPending}
                  onChange={(next) => fontePresetMutation.mutate(next)}
                />
                <div className="min-h-0 flex-1">
                  <ComTempoDoPlayer relogio={relogio}>
                    {(t) => (
                      <YoutubeLayoutPanel
                        ref={layoutPanelRef}
                        corteId={corte.id}
                        projetoId={corte.projeto_id}
                        layout={layoutYoutube}
                        currentTime={t + offsetSeg}
                        duration={timelineDuration}
                        onSeek={onSeek}
                      />
                    )}
                  </ComTempoDoPlayer>
                </div>
              </div>
            )}
          </div>
        </div>
      </PainelLateralComPiso>
    </PanelGroup>
  );
}

export interface FontePresetPanelProps {
  value: FontePreset;
  pending: boolean;
  onChange: (next: FontePreset) => void;
}

function FontePresetPanel({ value, pending, onChange }: FontePresetPanelProps) {
  // Collapsed por padrao: a lista de presets cresceu para 16 itens (F-036) e
  // ocupava ~340px verticais, sufocando a area de filtros logo abaixo.
  const [expanded, setExpanded] = useState(false);
  const ativo = FONT_PRESET_OPTIONS.find((opt) => opt.id === value);

  return (
    <section className="shrink-0 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)]">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--wb-bg-card)]"
        aria-expanded={expanded}
        aria-controls="fonte-preset-grid"
      >
        {expanded ? (
          <Icon name="chevron-down" className="text-[var(--wb-text-mute)]" />
        ) : (
          <Icon name="chevron-right" className="text-[var(--wb-text-mute)]" />
        )}
        <Icon name="type" className="text-[var(--wb-text-mute)]" />
        <strong className="font-editorial text-[13px] font-medium text-[var(--wb-text)]">
          Fonte dos cards
        </strong>
        {!expanded && ativo && (
          <span className="ml-auto inline-flex items-center gap-1.5 truncate">
            <span className="text-[11px] font-bold text-[var(--wb-text)]">{ativo.label}</span>
            <span className="font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
              {ativo.stack}
            </span>
          </span>
        )}
      </button>
      {expanded && (
        <div id="fonte-preset-grid" className="grid grid-cols-2 gap-1.5 px-3 pb-2.5">
          {FONT_PRESET_OPTIONS.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                type="button"
                disabled={pending}
                onClick={() => onChange(option.id)}
                className={cn(
                  'min-h-[42px] rounded-[var(--radius-xs)] border px-2 py-1.5 text-left transition-colors disabled:cursor-wait disabled:opacity-60',
                  active
                    ? 'border-[var(--sel-line)] bg-[var(--sel-bg)] text-[var(--wb-text)]'
                    : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:border-[var(--wb-text-dim)] hover:text-[var(--wb-text)]',
                )}
                aria-pressed={active}
                title={option.stack}
              >
                <span className="block text-[11px] font-bold leading-none">{option.label}</span>
                <span className="mt-1 block truncate font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                  {option.stack}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

export interface AbaButtonProps {
  ativo: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function AbaButton({ ativo, onClick, icon, label }: AbaButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={ativo}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-xs)] border px-2.5 py-1 text-[11px] uppercase tracking-[0.04em] transition-colors',
        ativo
          ? 'border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)] font-bold text-[var(--wb-ink)] shadow-sm'
          : 'border-transparent font-semibold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
      )}
    >
      {icon}
      {label}
    </button>
  );
}
