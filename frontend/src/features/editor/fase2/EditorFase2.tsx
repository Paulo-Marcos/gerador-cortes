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
import { AlertaCenasForaDoCorte } from './AlertaCenasForaDoCorte';
import { FiltroTestePanel } from '@/features/post-production/FiltroTestePanel';
import { YoutubeLayoutPanel } from './YoutubeLayoutPanel';
import { SegmentoDetectadoPopover } from './SegmentoDetectadoPopover';
import { PanelShell } from '@/components/workbench/PanelShell';
import { useEditorFase2 } from './useEditorFase2';
import { Icon } from '@/upgrade/Icon';

export type AbaDireita = 'cenas' | 'layout' | 'filtros';

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
  const { abaDireita, brutoPronto, cenaAtivaIdx, cenasFora, cenasPanelRef, decidindoSegmento, decidirSegmento, detectandoSegmentos, duracaoDoCorte, fontePresetMutation, fontePresetSelecionado, handleAddRegion, handleAjustarRegiaoSelecionada, handleResizeRegion, handleSelecionarCena, handleSelecionarRegiao, handleToggleRemotion, layoutPanelRef, layoutYoutube, offsetSeg, popoverSegmento, projeto, remotionEnabled, reprocessarSegmentos, segmentosDetectados, selectedCenaIdx, selectedRegionIdx, setAbaDireita, setPopoverSegmento, timelineDuration, timelineWrapperRef } = useEditorFase2(props);


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
          headerExtra={
            <button
              type="button"
              onClick={() => setAbaDireita(abaDireita === 'filtros' ? 'layout' : 'filtros')}
              className="rounded-md bg-[var(--wb-bg-inset)] px-2 py-0.5 text-[9px] font-bold text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]"
            >
              {abaDireita === 'filtros' ? '← layout' : 'filtros'}
            </button>
          }
        >
          <div className="min-h-0 flex-1">
            {abaDireita === 'filtros' ? (
              <div className="flex h-full min-h-0 flex-col bg-[var(--wb-bg-card)]">
                <FontePresetPanel
                  value={fontePresetSelecionado}
                  pending={fontePresetMutation.isPending}
                  onChange={(next) => fontePresetMutation.mutate(next)}
                />
                <div className="min-h-0 flex-1">
                  <FiltroTestePanel
                    corteId={corte.id}
                    projetoId={corte.projeto_id}
                    brutoPronto={brutoPronto}
                  />
                </div>
              </div>
            ) : (
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
            )}
          </div>
        </PanelShell>
      </div>
    );
  }

  return (
    <PanelGroup direction="horizontal" autoSaveId={PANEL_PERSIST} className="flex-1">
      <Panel defaultSize={70} minSize={40} order={1}>
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
      <Panel defaultSize={30} minSize={22} order={2}>
        <div className="flex h-full min-h-0 flex-col">
          {/* Tabs header — replica v3_pos.jsx:385-432. Select "Filtro padrao"
              foi MOVIDO para dentro da aba Filtros (Fase 5 do hand-off):
              o card "Padrão do projeto" + lista com "Salvar como padrão"
              substituem o select que vivia aqui. */}
          <div
            role="tablist"
            aria-label="Painel lateral"
            className="flex shrink-0 items-center gap-1 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2"
          >
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
            <AbaButton
              ativo={abaDireita === 'filtros'}
              onClick={() => setAbaDireita('filtros')}
              icon={<Icon name="sliders-horizontal" />}
              label="Filtros"
            />
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
            ) : abaDireita === 'layout' ? (
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
            ) : (
              <div className="flex h-full min-h-0 flex-col bg-[var(--wb-bg-card)]">
                <FontePresetPanel
                  value={fontePresetSelecionado}
                  pending={fontePresetMutation.isPending}
                  onChange={(next) => fontePresetMutation.mutate(next)}
                />
                <div className="min-h-0 flex-1">
                  <FiltroTestePanel
                    corteId={corte.id}
                    projetoId={corte.projeto_id}
                    brutoPronto={brutoPronto}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </Panel>
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

// D-314: abertura editorial do corte — contextualização (frase que situa o
// assunto, que a D-295 leva para a 1ª cena) + frase-gancho (ponto de entrada
// mais forte, com o timestamp na live). Fica no topo do painel de Cenas, junto
// de onde a 1ª cena é editada. Só renderiza o que tem conteúdo; nada preenchido
// (corte antigo/manual) → não ocupa espaço.
export interface AberturaEditorialProps {
  fraseGancho?: string;
  fraseGanchoHms?: string;
  contextualizacao?: string;
}

function AberturaEditorial({
  fraseGancho,
  fraseGanchoHms,
  contextualizacao,
}: AberturaEditorialProps) {
  const contexto = contextualizacao?.trim();
  const gancho = fraseGancho?.trim();
  const ganchoHms = fraseGanchoHms?.trim();
  if (!contexto && !gancho) return null;

  return (
    <section
      className="shrink-0 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2.5"
      aria-label="Abertura editorial do corte"
    >
      {contexto && (
        <div className="flex items-start gap-2">
          <Icon name="sparkles" className="mt-0.5 shrink-0 text-[var(--wb-accent)]" />
          <div className="min-w-0">
            <div className="font-code text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
              Contextualização · 1ª cena
            </div>
            <p className="mt-0.5 font-editorial text-[12.5px] leading-snug text-[var(--wb-text)]">
              {contexto}
            </p>
          </div>
        </div>
      )}
      {gancho && (
        <div className={cn('flex items-start gap-2', contexto && 'mt-2')}>
          <Icon name="quote" className="mt-0.5 shrink-0 text-[var(--wb-text-mute)]" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-code text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                Gancho
              </span>
              {ganchoHms && (
                <span className="font-code text-[9px] tabular-nums text-[var(--wb-text-dim)]">
                  {ganchoHms}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] italic leading-snug text-[var(--wb-text-mute)]">
              “{gancho}”
            </p>
          </div>
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
        'inline-flex items-center gap-1.5 rounded-[var(--radius-xs)] border px-2.5 py-1 text-[11px] uppercase tracking-[0.04em] transition-colors',
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
