import {
  forwardRef,
  
  
  
  
  
  
  
} from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { rawVideoRedirectUrl } from '@/lib/api';
import { segParaMmSs } from '../timeUtils';
import { PosicionamentoModal } from './PosicionamentoModal';
import {
  
  
  
  findMatchingFullPreset,
  findMatchingPreset,
  fullConfigDoPreset,
  
  mergeFullConfig,
  mergeSharedConfig,
  
  
  
  sharedConfigDoPreset,
  sharedConfigFromFull,
  
  
  type YoutubeFullConfig,
  type YoutubeLayout,
  
  
  
  type YoutubeSharedConfig,
} from '@/shared/palco/youtubeLayout';
import { EscopoLadder, ModoBlock, RegionItem } from './youtubeLayoutPanel/components';
import { MODE_LABEL } from './youtubeLayoutPanel/shared';
import { useYoutubeLayoutPanel } from './useYoutubeLayoutPanel';
import { Icon } from '@/upgrade/Icon';

// ─────────────────────────────────────────────────────────────
// YoutubeLayoutPanel — replica `design_reference/src/v3_pos.jsx > TabLayout`
// (linhas 900-1620). Refinos chave em relacao ao codigo antigo:
//   - Fundo: substituiu letra G/H/I/B/D/F por mini-preview SVG line-art
//     (FundoThumb, portado de v3_pos.jsx:1144-1169).
//   - Bloco "Padrao" reagrupado em card destacado no fim quando existe
//     palco compartilhado. Antes Padrao Projeto/Global/Usar Padrao ficavam
//     soltos espremidos no header.
//   - "Preset" virou link discreto no cabecalho de "Posicionamento".
//   - Em Full sem regioes compartilhadas: esconde fundo/placa/posicionamento
//     e mostra aviso.
//
// Decisoes Paulo (sobrescrevem hand-off):
//   - `Tipo do projeto` (Full | Compartilhada) lido do
//     `projeto.layout_youtube_padrao.modo_padrao` (parse JSON). Mostrado
//     como caption no header — fonte de verdade do default global.
//   - `definirComoPadrao` NAO forca mais 'compartilhada': preserva o
//     tipo do projeto/global. Permite que o usuario fixe o projeto como
//     "Full" e tenha regioes compartilhadas pontuais.
//   - `Usar padrao` aplica o `modo_padrao` salvo (nao forca).
//   - +Comp / +Full ficaram em "Regioes customizadas" temporariamente
//     ate a Fase 6 (timeline cuidara dessa adicao inline).
//
// Mutations preservadas: useAtualizarCorte, definirPadraoProjeto/Global.
// ─────────────────────────────────────────────────────────────

export interface Props {
  corteId: string;
  projetoId: string;
  layout: YoutubeLayout;
  currentTime: number;
  duration: number;
  onSeek: (seg: number) => void;
}

// SharedRectKey / CropRectKey movidos para ./posicionamentoControls.tsx

// Helpers de posicionamento (RECT_LABEL, SharedRectKey, etc.) movidos para
// `./posicionamentoControls.tsx` e usados pelo PosicionamentoModal.

// Helpers `readPadraoModo` e `draftMatchesPreset` extraidos para
// `./youtubeLayoutPadrao.ts` (testaveis em isolamento).

export interface YoutubeLayoutPanelHandle {
  /** Salva se houver pendencias. Retorna true se disparou a mutation. */
  saveIfDirty: () => boolean;
  /** I-029 v2: limpa o registro de regioes deletadas localmente — usado
   *  pelo Ctrl+Z em EditorFase2 para que regioes voltem ao painel sem
   *  serem barradas pelo filtro de sincronizacao. */
  clearDeletedRegions: () => void;
}

export const YoutubeLayoutPanel = forwardRef<YoutubeLayoutPanelHandle, Props>(
  function YoutubeLayoutPanel(
    props: Props, ref,
  ) {
  const { corteId,   currentTime, duration, onSeek } = props;
  const { abrirModalPosicionamento, activeMode, aplicarOverrideSegmento, aplicarOverrideSegmentoFull, atualizar, commitRegionFim, commitRegionInicio, confirm, definirPadraoGlobalMutation, definirPadraoProjetoMutation, detectandoSegmentos, detectarSegmentos, dirty, draft, escopoAtivoCorte, escopoDefinido, handleDefault, handleDefinirTipoProjeto, handleModalSave, handlePresetEscopo, handleRegion, modal, modoEscada, modoHerdando, presetNomeDoEscopo, presetsDisponiveis, presetsFullDisponiveis, regioesOpen, removeRegion, removerPadraoSegmento, save, segmentosDetectados, setConfirm, setModal, setModoEscada, setRegioesOpen, shared, tipoProjeto } = useYoutubeLayoutPanel(props, ref);


    return (
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
        {/* overflow-x-hidden explícito: com só `overflow-y-auto`, o CSS
            promove o eixo X para `auto` e qualquer conteúdo largo (chip de
            padrão, rótulo de modo) criava barra horizontal no painel. */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          {/* Cabecalho */}
          <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3">
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <Icon name="layers" className="flex-none text-[var(--wb-text-mute)]" />
              <strong className="whitespace-nowrap font-editorial text-[17px] font-medium text-[var(--wb-ink)]">
                Layout YouTube
              </strong>
              {/* D-421: o chip só aparece quando o modo sob o playhead difere
                do modo do corte (i.e. há uma região ativa). Fora disso ele
                repetia, em outro formato, o segmented logo abaixo. */}
              {activeMode !== draft.modo_padrao && (
                <span className="rounded-full bg-[var(--wb-info-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-info)]">
                  agora: {MODE_LABEL[activeMode]}
                </span>
              )}
              <div className="flex-1" />
              <Tooltip
                label={
                  detectandoSegmentos
                    ? 'Detecção em andamento…'
                    : segmentosDetectados.length > 0
                      ? `Re-rodar detecção (${segmentosDetectados.filter((s) => s.status === 'sugerido').length} sugestões pendentes)`
                      : 'Detectar mudanças de cena no bruto'
                }
                side="bottom"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={detectarSegmentos}
                  disabled={detectandoSegmentos}
                  aria-label="Detectar segmentos no bruto"
                >
                  {detectandoSegmentos ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="scan-line" />}
                  Detectar
                </Button>
              </Tooltip>
              {dirty && (
                <Tooltip label="Salvar layout deste corte" side="bottom">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={save}
                    disabled={atualizar.isPending}
                  >
                    {atualizar.isPending ? <Icon name="loader-2" className="animate-spin" /> : <Icon name="save" />}
                    Salvar
                  </Button>
                </Tooltip>
              )}
            </div>

            {/* D-423: as duas decisões de MODO juntas — a deste corte e a que
              vale para novos cortes do projeto. A segunda tinha ido parar
              dentro da linha Projeto da escada (D-421), onde a pílula COMP.
              não cabia e ficava fora da área visível: não havia como pôr o
              projeto em Compartilhada. O ↺ devolve o corte ao modo do projeto. */}
            <ModoBlock
              modoCorte={draft.modo_padrao}
              onChangeModoCorte={handleDefault}
              herdando={modoHerdando}
              onResetCorte={
                !modoHerdando && draft.modo_padrao !== tipoProjeto
                  ? () => handleDefault(tipoProjeto)
                  : undefined
              }
              tipoProjeto={tipoProjeto}
              onChangeTipoProjeto={handleDefinirTipoProjeto}
              pendingProjeto={definirPadraoProjetoMutation.isPending}
            />

            {/* Stats numa linha (mesmo tratamento do CenasPanel na §2): os 3
              cards com borda eram um bloco alto para 3 números. */}
            <div className="mt-2 flex flex-wrap items-center gap-2 font-code text-[10.5px] tabular-nums">
              <span>
                <b className="font-bold text-[var(--wb-text)]">{draft.regioes.length}</b>{' '}
                <span className="text-[var(--wb-text-dim)]">regiões</span>
              </span>
              <span aria-hidden className="text-[var(--wb-border)]">
                ·
              </span>
              <span>
                <b className="font-bold text-[var(--wb-text)]">{shared.length}</b>{' '}
                <span className="text-[var(--wb-text-dim)]">shared</span>
              </span>
              <span aria-hidden className="text-[var(--wb-border)]">
                ·
              </span>
              <span>
                <b className="font-bold text-[var(--wb-text)]">{segParaMmSs(duration, true)}</b>{' '}
                <span className="text-[var(--wb-text-dim)]">duração</span>
              </span>
            </div>
          </header>

          {/* D-421: a escada de escopos deixou de morar atrás de "PADRÃO …
            definir ▾". A prioridade (segmento > corte > projeto > global) era
            prosa dentro de um card colapsado; agora é a própria ordem das
            linhas, sempre visível, com o escopo vencedor marcado "em uso". */}
          <div className="border-b border-[var(--wb-border-soft)] px-3 py-2">
            <EscopoLadder
              modo={modoEscada}
              onAlternarModo={setModoEscada}
              escopoAtivo={escopoAtivoCorte}
              corteDefinido={escopoDefinido('corte', modoEscada)}
              projetoDefinido={escopoDefinido('projeto', modoEscada)}
              globalDefinido={escopoDefinido('global', modoEscada)}
              segmentoPadraoDefinido={escopoDefinido('segmento_padrao', modoEscada)}
              presetCorteNome={presetNomeDoEscopo('corte', modoEscada)}
              presetProjetoNome={presetNomeDoEscopo('projeto', modoEscada)}
              presetGlobalNome={presetNomeDoEscopo('global', modoEscada)}
              presetSegmentoPadraoNome={presetNomeDoEscopo('segmento_padrao', modoEscada)}
              onDefinirCorte={() => abrirModalPosicionamento('corte', modoEscada)}
              onDefinirProjeto={() => abrirModalPosicionamento('projeto', modoEscada)}
              onDefinirGlobal={() => abrirModalPosicionamento('global', modoEscada)}
              onDefinirSegmentoPadrao={() =>
                abrirModalPosicionamento('segmento_padrao', modoEscada)
              }
              onPresetCorte={(preset) => handlePresetEscopo('corte', modoEscada, preset)}
              onPresetProjeto={(preset) => handlePresetEscopo('projeto', modoEscada, preset)}
              onPresetGlobal={(preset) => handlePresetEscopo('global', modoEscada, preset)}
              onPresetSegmentoPadrao={(preset) =>
                handlePresetEscopo('segmento_padrao', modoEscada, preset)
              }
              onResetSegmentoPadrao={() => removerPadraoSegmento(modoEscada)}
              pendingProjeto={definirPadraoProjetoMutation.isPending}
              pendingGlobal={definirPadraoGlobalMutation.isPending}
            />
          </div>

          {/* REGIÕES (AUDITORIA-v4 §3): resumo de UMA linha. A lista completa
            de RegionItem abre pelo próprio resumo — antes ficava expandida
            fixa, e com zero regiões ainda ocupava uma caixa vazia de 60px
            dizendo "Sem intervalos manuais". Criar região segue na timeline. */}
          <div className="px-3 pb-3 pt-1">
            <button
              type="button"
              onClick={() => setRegioesOpen((v) => !v)}
              aria-expanded={regioesOpen}
              disabled={draft.regioes.length === 0}
              className="flex w-full items-center gap-2 rounded-[var(--radius-xs)] px-1 py-1 text-left transition-colors hover:bg-[var(--wb-bg-inset)] disabled:pointer-events-none"
            >
              <span className="flex-none font-code text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Regiões
              </span>
              <span className="min-w-0 flex-1 truncate font-code text-[10.5px] text-[var(--wb-text-mute)]">
                {draft.regioes.length === 0
                  ? 'nenhuma · crie na timeline ↙'
                  : `${draft.regioes.length} manuais`}
              </span>
              {draft.regioes.length > 0 && (
                <Icon name="chevron-down" className="text-[var(--wb-text-dim)] transition-transform" style={{ transform: regioesOpen ? 'rotate(180deg)' : 'none' }} />
              )}
            </button>

            {draft.regioes.length > 0 && regioesOpen && (
              <ul role="list" className="flex flex-col gap-1.5">
                {draft.regioes.map((region, index) => {
                  const active = currentTime >= region.inicio && currentTime < region.fim;
                  const isSharedRegion = region.modo === 'compartilhada';
                  const effective = mergeSharedConfig(draft.compartilhada, region.compartilhada);
                  const effectiveFull = mergeFullConfig(draft.full, region.full);
                  const presetMatch = isSharedRegion
                    ? findMatchingPreset(presetsDisponiveis, effective)
                    : findMatchingFullPreset(presetsFullDisponiveis, effectiveFull);
                  return (
                    <RegionItem
                      key={`${region.modo}-${index}-${region.inicio}`}
                      region={region}
                      active={active}
                      duration={duration}
                      presetEmUsoNome={presetMatch?.nome ?? null}
                      onSeek={() => onSeek(region.inicio)}
                      onSeekTo={onSeek}
                      onRemove={() => removeRegion(index)}
                      onChangeInicio={(seg) => commitRegionInicio(index, region, seg)}
                      onChangeFim={(seg) => commitRegionFim(index, region, seg)}
                      onChangeModo={(modo) => handleRegion(index, { ...region, modo })}
                      onClearOverride={() =>
                        isSharedRegion
                          ? aplicarOverrideSegmento(index, undefined)
                          : aplicarOverrideSegmentoFull(index, undefined)
                      }
                      onAbrirPosicionamento={() =>
                        abrirModalPosicionamento('segmento', region.modo, {
                          regionIndex: index,
                          initialConfig: isSharedRegion
                            ? effective
                            : sharedConfigFromFull(effectiveFull),
                        })
                      }
                      onAplicarPresetSegmento={(preset) => {
                        // F-060: segmento aplica so o posicionamento do preset
                        // (fundo/placa vem do corte). Reduz para overrides apenas.
                        if (!isSharedRegion) {
                          const full = fullConfigDoPreset(preset);
                          if (!full) return;
                          const base = draft.full;
                          const partial: Partial<YoutubeFullConfig> = {};
                          (['crop', 'slot'] as const).forEach((chave) => {
                            const a = full[chave];
                            const b = base[chave];
                            if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) {
                              partial[chave] = a;
                            }
                          });
                          aplicarOverrideSegmentoFull(
                            index,
                            Object.keys(partial).length > 0 ? partial : undefined,
                          );
                          return;
                        }
                        const config = sharedConfigDoPreset(preset);
                        if (!config) return;
                        const base = draft.compartilhada;
                        const partial: Partial<YoutubeSharedConfig> = {};
                        if (config.telas !== base.telas) partial.telas = config.telas;
                        (
                          ['crop_facecam', 'crop_tela', 'slot_facecam', 'slot_tela'] as const
                        ).forEach((chave) => {
                          const a = config[chave];
                          const b = base[chave];
                          if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) {
                            partial[chave] = a;
                          }
                        });
                        aplicarOverrideSegmento(
                          index,
                          Object.keys(partial).length > 0 ? partial : undefined,
                        );
                      }}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Modal de confirmacao generico — usado pelas 4 acoes Projeto/Global */}
        <Modal
          open={confirm !== null}
          onClose={() => setConfirm(null)}
          title={confirm?.title ?? ''}
          description={confirm?.description}
          size="sm"
          footer={
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(null)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="default"
                size="sm"
                onClick={() => confirm?.onConfirm()}
              >
                {confirm?.confirmLabel ?? 'OK'}
              </Button>
            </>
          }
        >
          {null}
        </Modal>

        {/* F-048/F-060: Modal de posicionamento (grande) — abre via "Definir" no
          card de padroes ou via "Mudar posicionamento" em cada segmento. Em
          escopos corte/projeto/global tambem edita fundo + placa. */}
        {modal && (
          <PosicionamentoModal
            open={modal !== null}
            onClose={() => setModal(null)}
            mode={modal.modo}
            initialConfig={modal.initialConfig}
            onSave={handleModalSave}
            scopeLabel={modal.label}
            videoSrc={rawVideoRedirectUrl(corteId)}
            currentTime={currentTime}
            fundo={modal.initialFundo}
            placa={modal.initialPlaca}
            fundoPlacaEditavel={modal.fundoPlacaEditavel}
          />
        )}
      </section>
    );
},
);
