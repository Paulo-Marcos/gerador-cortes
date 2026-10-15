/**
 * Modal grande de posicionamento (F-048 / F-060).
 *
 * Substitui a secao inline `Posicionamento` do painel: editor de crops/slots +
 * preview de video + barra de presets + botão "Salvar como preset". O caller
 * passa um `initialConfig` e um `onSave(...)`; o modal mantém um draft
 * local até a confirmação (Cancelar não aplica nada).
 *
 * F-060:
 * - `mode='full'` edita o posicionamento do modo FULL. Internamente o FULL é
 *   representado como config sintético de 1 tela (crop/slot → crop_tela/
 *   slot_tela), reusando CropPicker/SlotPreview sem mudança.
 * - Fundo e Placa de nome agora são definidos AQUI (por preset/escopo), não
 *   mais na página de Layout. Presets carregam fundo+placa no payload.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import {
  RECT_KEYS_FULL,
  RECT_KEYS_ONE_SCREEN,
  RECT_KEYS_TWO_SCREENS,
  comZonaManual,
  isCardZoneKey,
  isCropRectKey,
  isFacecamRectKey,
  resizeSlotForCrop,
  semZonaManual,
  type SharedRectKey,
} from './posicionamentoControls';
import { NomeDoPresetDialog } from './NomeDoPresetDialog';
import { AbaixoDaPrevia, PainelDoPalco } from './PaineisDoPalco';
import { PainelDasTelas } from './PainelDasTelas';
import { MenuDoModal, gruposDoModal, type GrupoDoModal } from './MenuDoModal';
import { PreviaQueCabe } from './PreviaQueCabe';
import { CropPicker } from './CropPicker';
import { SlotPreview } from './SlotPreview';
import { edicaoDoRascunho } from './ComponentesArrastaveis';
import { PresetsNaFaixa } from './BarraDePresets';
import { cenaDeExemplo } from './ExemploDoCard';
import { estiloDasCenasDe } from '@/shared/palco/palcoLimpo';
import { EstiloNoModal } from '@/features/channels/EstiloNoModal';
import type { AlvoDoEstilo } from '@/features/channels/palcoDoEscopo';
import { usePalcoDoModal } from '@/features/channels/usePalcoDoModal';
import { presetsDoEstilo } from '@/shared/palco/presetsPorEstilo';
import {
  useDeleteLayoutPreset,
  useLayoutPresets,
  useSaveLayoutPreset,
  useUpdateLayoutPreset,
} from '@/shared/palco/useLayoutPresets';
import {
  fullConfigDoPreset,
  fundoPlacaDoPreset,
  normalizeZonaCard,
  sharedConfigDoPreset,
  sharedConfigEquals,
  sharedConfigFromFull,
  sharedVerticalCardZone,
  type YoutubeBackgroundId,
  type YoutubeLayoutMode,
  type YoutubePlaca,
  type YoutubeSharedConfig,
  type YoutubeSharedRect,
  type YoutubeSharedScreenCount,
} from '@/shared/palco/youtubeLayout';
import type { LayoutPreset, LayoutPresetTipo } from '@/types/presets';
import { ICONE_DO_CONCEITO, Icon } from '@/upgrade/Icon';

/** Resultado da confirmação do modal (F-060: inclui fundo e placa). */
export interface PosicionamentoModalResult {
  config: YoutubeSharedConfig;
  fundo: YoutubeBackgroundId;
  placa: YoutubePlaca;
}

interface PosicionamentoModalProps {
  open: boolean;
  onClose: () => void;
  /** F-060: qual posicionamento esta sendo definido. Em 'full', `initialConfig`
   *  chega como config sintetico de 1 tela (use `sharedConfigFromFull`). */
  mode: YoutubeLayoutMode;
  /** Config inicial do escopo (corte/projeto/global/segmento) ja resolvido. */
  initialConfig: YoutubeSharedConfig;
  /** Persistido quando o usuario confirma. */
  onSave: (result: PosicionamentoModalResult) => void;
  /** Texto curto do escopo: "Corte", "Projeto", "Global", "Segmento". */
  scopeLabel: string;
  /** URL do video bruto para o CropPicker mostrar o quadro vivo. */
  videoSrc: string;
  /** Tempo atual do player do corte (segundos). */
  currentTime: number;
  /** Fundo editorial inicial do escopo. */
  fundo: YoutubeBackgroundId;
  /** Placa inicial do escopo. */
  placa: YoutubePlaca;
  /** F-060: escopos de segmento herdam fundo/placa do corte — nao editam aqui. */
  fundoPlacaEditavel?: boolean;
  /** D-923: o corte e o projeto do modal, e onde a troca de estilo grava. */
  projetoId?: string;
  corteId?: string;
  alvoDoEstilo?: AlvoDoEstilo;
}

export function PosicionamentoModal({
  open,
  onClose,
  mode,
  initialConfig,
  onSave,
  scopeLabel,
  videoSrc,
  currentTime,
  fundo,
  placa,
  fundoPlacaEditavel = true,
  projetoId,
  corteId,
  alvoDoEstilo = 'corte',
}: PosicionamentoModalProps) {
  const { notify } = useToast();
  const isFullMode = mode === 'full';
  const presetTipo: LayoutPresetTipo = isFullMode ? 'posicionamento_full' : 'posicionamento';
  const { data: todosOsPresets = [] } = useLayoutPresets({ tipo: presetTipo });
  const savePreset = useSaveLayoutPreset();
  const updatePreset = useUpdateLayoutPreset();
  const deletePreset = useDeleteLayoutPreset();

  const [config, setConfig] = useState<YoutubeSharedConfig>(initialConfig);
  const [draftFundo, setDraftFundo] = useState<YoutubeBackgroundId>(fundo);
  const [draftPlaca, setDraftPlaca] = useState<YoutubePlaca>(placa);
  // D-923: o palco do horizontal deste corte (ou projeto) em rascunho; a prévia e
  // a lista de presets seguem ele, e o "Aplicar" grava só naquele escopo.
  const palco = usePalcoDoModal({ tipo: 'horizontal', projetoId, corteId, alvo: alvoDoEstilo, aberto: open });
  const estiloDoPalco = palco.estilo;
  const presets = presetsDoEstilo(todosOsPresets, estiloDoPalco);
  const [rectKey, setRectKey] = useState<SharedRectKey>(isFullMode ? 'crop_tela' : 'crop_facecam');
  // D-927: o grupo de ajustes aberto no menu da esquerda; D-928: o card de exemplo.
  const [grupo, setGrupo] = useState<GrupoDoModal>('telas');
  const [exemplo, setExemplo] = useState('definicao_termo');
  const [drawingEnabled, setDrawingEnabled] = useState(false);
  const [presetSelecionado, setPresetSelecionado] = useState<string>('');
  const [salvarPresetOpen, setSalvarPresetOpen] = useState(false);
  const [nomePreset, setNomePreset] = useState('');
  const [renomearPresetOpen, setRenomearPresetOpen] = useState(false);
  const [nomeRenomear, setNomeRenomear] = useState('');

  // Resync ao abrir o modal — initialConfig pode mudar entre opens.
  useEffect(() => {
    if (open) {
      setConfig(initialConfig);
      setDraftFundo(fundo);
      setDraftPlaca(placa);
      setRectKey(isFullMode ? 'crop_tela' : 'crop_facecam');
      setPresetSelecionado('');
      setSalvarPresetOpen(false);
      setNomePreset('');
      setRenomearPresetOpen(false);
      setNomeRenomear('');
      setDrawingEnabled(false);
      setGrupo('telas');
    }
  }, [open, initialConfig, fundo, placa, isFullMode]);

  // Fecha com ESC.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const sharedScreenCount = config.telas;
  const rectOptions = useMemo(
    () =>
      isFullMode
        ? RECT_KEYS_FULL
        : sharedScreenCount === 1
          ? RECT_KEYS_ONE_SCREEN
          : RECT_KEYS_TWO_SCREENS,
    [isFullMode, sharedScreenCount],
  );

  useEffect(() => {
    if (sharedScreenCount === 1 && isFacecamRectKey(rectKey)) {
      setRectKey(rectKey === 'crop_facecam' ? 'crop_tela' : 'slot_tela');
    }
  }, [sharedScreenCount, rectKey]);

  // D-904: com a zona dos cards na regra automática o editor mostra onde ela
  // cai hoje; o operador só edita depois de passar para "Manual".
  const zonaManual = Boolean(config.zona_card);
  const selectedRect = isCardZoneKey(rectKey) ? sharedVerticalCardZone(config) : config[rectKey];
  const selectedCropKey = isCropRectKey(rectKey) ? rectKey : null;
  const selectedBaseRect =
    rectKey === 'slot_facecam'
      ? config.crop_facecam
      : rectKey === 'slot_tela'
        ? config.crop_tela
        : undefined;
  const editorLiberado = !isCardZoneKey(rectKey) || zonaManual;

  const updateRect = (key: SharedRectKey, rect: YoutubeSharedRect) => {
    if (isCardZoneKey(key)) {
      // O piso 240x180 e o quadro valem já no rascunho: o preview mostra o
      // mesmo retângulo que o backend vai gravar.
      setConfig((current) => ({ ...current, zona_card: normalizeZonaCard(rect) ?? rect }));
      return;
    }
    if (key === 'crop_facecam') {
      setConfig((current) => ({
        ...current,
        crop_facecam: rect,
        slot_facecam: resizeSlotForCrop(current.slot_facecam, current.crop_facecam, rect),
      }));
      return;
    }
    if (key === 'crop_tela') {
      setConfig((current) => ({
        ...current,
        crop_tela: rect,
        slot_tela: resizeSlotForCrop(current.slot_tela, current.crop_tela, rect),
      }));
      return;
    }
    setConfig((current) => ({ ...current, [key]: rect }));
  };

  const handleScreenCount = (telas: YoutubeSharedScreenCount) => {
    setConfig((current) => ({ ...current, telas }));
  };

  // F-060: extrai o config do preset no formato que o editor usa (sintetico
  // de 1 tela quando mode='full').
  const configDoPreset = useCallback(
    (preset: LayoutPreset): YoutubeSharedConfig | null => {
      if (isFullMode) {
        const full = fullConfigDoPreset(preset);
        return full ? sharedConfigFromFull(full) : null;
      }
      return sharedConfigDoPreset(preset);
    },
    [isFullMode],
  );

  const aplicarPreset = (preset: LayoutPreset) => {
    const presetConfig = configDoPreset(preset);
    if (!presetConfig) {
      notify(
        `Preset "${preset.nome}" não tem posicionamento ${isFullMode ? 'Full' : 'Compartilhada'}.`,
        {
          tone: 'error',
        },
      );
      return;
    }
    setConfig(presetConfig);
    // F-060: preset carrega fundo/placa. Presets legados (sem fundo/placa)
    // mantem o que esta no editor.
    palco.dePreset((preset.payload as { palco?: unknown } | null)?.palco);
    if (fundoPlacaEditavel) {
      const extras = fundoPlacaDoPreset(preset);
      if (extras.fundo) setDraftFundo(extras.fundo);
      if (extras.placa) setDraftPlaca(extras.placa);
    }
    setPresetSelecionado(preset.id);
    notify(`Preset "${preset.nome}" aplicado.`, { tone: 'success' });
  };

  const handleAplicarPreset = (id: string) => {
    const preset = presets.find((p) => p.id === id);
    if (preset) aplicarPreset(preset);
  };

  const handleDeletePreset = () => {
    const preset = presets.find((p) => p.id === presetSelecionado);
    if (!preset) return;
    if (!window.confirm(`Remover preset "${preset.nome}"?`)) return;
    deletePreset.mutate(preset.id, {
      onSuccess: () => {
        notify(`Preset "${preset.nome}" removido.`, { tone: 'success' });
        setPresetSelecionado('');
      },
      onError: (error) => {
        notify(error instanceof Error ? error.message : 'Erro ao remover preset.', {
          tone: 'error',
        });
      },
    });
  };

  const abrirRenomearPreset = () => {
    const preset = presets.find((p) => p.id === presetSelecionado);
    if (!preset) return;
    setNomeRenomear(preset.nome);
    setRenomearPresetOpen(true);
  };

  const handleRenomearPreset = () => {
    const preset = presets.find((p) => p.id === presetSelecionado);
    if (!preset) return;
    const nome = nomeRenomear.trim();
    if (!nome || nome === preset.nome) {
      setRenomearPresetOpen(false);
      return;
    }
    updatePreset.mutate(
      { id: preset.id, body: { nome } },
      {
        onSuccess: (updated) => {
          notify(`Preset renomeado para "${updated.nome}".`, { tone: 'success' });
          setRenomearPresetOpen(false);
          setNomeRenomear('');
        },
        onError: (error) => {
          notify(error instanceof Error ? error.message : 'Erro ao renomear preset.', {
            tone: 'error',
          });
        },
      },
    );
  };

  // F-060: payload persistido nos presets — sempre o shape novo com fundo/placa.
  const payloadAtual = () =>
    isFullMode
      ? {
          full: { crop: { ...config.crop_tela }, slot: { ...config.slot_tela } },
          fundo: draftFundo,
          placa: { ...draftPlaca },
          estilo: estiloDoPalco,
          palco: palco.paraPreset(),
        }
      : { compartilhada: config, fundo: draftFundo, placa: { ...draftPlaca }, estilo: estiloDoPalco, palco: palco.paraPreset() };

  // F-048: detecta o preset selecionado e se o config atual divergiu dele,
  // habilitando "Atualizar preset".
  const presetSelecionadoObj = useMemo(
    () => presets.find((p) => p.id === presetSelecionado) ?? null,
    [presets, presetSelecionado],
  );
  const presetConfigOriginal = useMemo(
    () => (presetSelecionadoObj ? configDoPreset(presetSelecionadoObj) : null),
    [presetSelecionadoObj, configDoPreset],
  );
  const presetExtrasOriginais = useMemo(
    () => (presetSelecionadoObj ? fundoPlacaDoPreset(presetSelecionadoObj) : {}),
    [presetSelecionadoObj],
  );
  const presetTemMudancas = Boolean(
    presetConfigOriginal &&
      (!sharedConfigEquals(presetConfigOriginal, config) ||
        (presetExtrasOriginais.fundo != null && presetExtrasOriginais.fundo !== draftFundo) ||
        (presetExtrasOriginais.placa != null &&
          (presetExtrasOriginais.placa.nome !== draftPlaca.nome ||
            presetExtrasOriginais.placa.papel !== draftPlaca.papel))),
  );

  const handleAtualizarPreset = () => {
    if (!presetSelecionadoObj || !presetTemMudancas) return;
    updatePreset.mutate(
      { id: presetSelecionadoObj.id, body: { payload: payloadAtual() } },
      {
        onSuccess: () => {
          notify(`Preset "${presetSelecionadoObj.nome}" atualizado.`, { tone: 'success' });
        },
        onError: (error) => {
          notify(error instanceof Error ? error.message : 'Erro ao atualizar preset.', {
            tone: 'error',
          });
        },
      },
    );
  };

  const handleSalvarPreset = () => {
    const nome = nomePreset.trim();
    if (!nome) return;
    savePreset.mutate(
      { nome, tipo: presetTipo, payload: payloadAtual() },
      {
        onSuccess: (created) => {
          notify(`Preset "${created.nome}" salvo.`, { tone: 'success' });
          setSalvarPresetOpen(false);
          setNomePreset('');
          setPresetSelecionado(created.id);
        },
        onError: (error) => {
          notify(error instanceof Error ? error.message : 'Erro ao salvar preset.', {
            tone: 'error',
          });
        },
      },
    );
  };

  const handleConfirm = () => {
    palco.aplicar();
    onSave({ config, fundo: draftFundo, placa: draftPlaca });
    onClose();
  };

  // D-927: o grupo que vale no estilo (o cabeçalho só existe no limpo) e o que a prévia mostra.
  const grupos = gruposDoModal(estiloDoPalco);
  const grupoAtivo = grupos.includes(grupo) ? grupo : 'telas';
  const cropNaPrevia = grupoAtivo === 'telas' && Boolean(selectedCropKey);
  const componenteAtivo = grupoAtivo === 'cabecalho' || grupoAtivo === 'placa' ? grupoAtivo : null;
  const componentes =
    palco.rascunho && alvoDoEstilo !== 'global'
      ? edicaoDoRascunho(palco.rascunho, palco.mudar, componenteAtivo, setGrupo)
      : undefined;

  if (!open) return null;

  const modeLabel = isFullMode ? 'Full' : 'Compartilhada';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Posicionamento ${modeLabel} — ${scopeLabel}`}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-full max-h-[920px] w-full max-w-7xl flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
        {/* Header */}
        <header className="flex items-center gap-3 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-5 py-3">
          <strong className="font-editorial text-[16px] font-medium text-[var(--wb-ink)]">
            Posicionamento — {scopeLabel}
          </strong>
          <span className="rounded-full bg-[var(--wb-info-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-info)]">
            {modeLabel}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal"
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]"
          >
            <Icon name="x" size={16} />
          </button>
        </header>

        <EstiloNoModal
          alvo={alvoDoEstilo}
          estilo={estiloDoPalco}
          origem={palco.origem}
          onEstilo={palco.setEstilo}
          acoes={<PresetsNaFaixa presets={presets} selecionado={presetSelecionado} onAplicar={handleAplicarPreset} onRenomear={abrirRenomearPreset}
            onRemover={handleDeletePreset} renomeando={updatePreset.isPending} removendo={deletePreset.isPending} />}
        />

        {/* D-927: menu de grupos | ajustes do grupo | prévia parada, que cabe inteira. */}
        <div className="grid min-h-0 flex-1 grid-cols-[84px_minmax(0,300px)_minmax(0,1fr)] overflow-hidden">
          <MenuDoModal grupos={grupos} ativo={grupoAtivo} onEscolher={setGrupo} />
          <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto border-r border-[var(--wb-border-soft)] p-3">
            {grupoAtivo === 'telas' ? (
              <PainelDasTelas
                isFullMode={isFullMode}
                telas={sharedScreenCount}
                onTelas={handleScreenCount}
                opcoes={rectOptions}
                rectKey={rectKey}
                onRectKey={setRectKey}
                zonaManual={zonaManual}
                onZonaAutomatica={() => setConfig((current) => semZonaManual(current))}
                onZonaManual={() => setConfig((current) => comZonaManual(current))}
                editorLiberado={editorLiberado}
                rect={selectedRect}
                baseRect={selectedBaseRect}
                onRect={(rect) => updateRect(rectKey, rect)}
              />
            ) : (
              <PainelDoPalco grupo={grupoAtivo} palco={palco} global={alvoDoEstilo === 'global'} editavel={fundoPlacaEditavel} fundo={draftFundo} placa={draftPlaca} onFundo={setDraftFundo} onPlaca={setDraftPlaca} exemplo={exemplo} onExemplo={setExemplo} />
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-col gap-2 p-3">
            <PreviaQueCabe reserva={cropNaPrevia ? 44 : 0}>
              {cropNaPrevia && selectedCropKey ? (
                <CropPicker
                  videoSrc={videoSrc}
                  currentTime={currentTime}
                  rect={config[selectedCropKey]}
                  drawingEnabled={drawingEnabled}
                  onToggleDrawing={() => setDrawingEnabled((v) => !v)}
                  onChange={(rect) => updateRect(selectedCropKey, rect)}
                />
              ) : (
                <SlotPreview
                  config={config}
                  rectKey={grupoAtivo === 'cards' ? 'zona_card' : rectKey}
                  comZonaDosCards={!isFullMode}
                  exemplo={grupoAtivo === 'cards' && exemplo && palco.componentes ? { cena: cenaDeExemplo(exemplo, isFullMode ? null : sharedVerticalCardZone(config)), estiloCenas: estiloDasCenasDe(palco.componentes) } : null}
                  videoSrc={videoSrc}
                  currentTime={currentTime}
                  fundo={draftFundo}
                  placa={draftPlaca}
                  palco={palco.componentes ?? undefined}
                  componentes={componentes}
                  onChangeSlot={(key, rect) => updateRect(key, rect)}
                />
              )}
            </PreviaQueCabe>
            <AbaixoDaPrevia grupo={grupoAtivo} palco={palco} global={alvoDoEstilo === 'global'} />
            <p className="font-code text-[11px] leading-snug text-[var(--wb-text-dim)]">
              {cropNaPrevia
                ? 'Quadro do vídeo no tempo atual: clique Desenhar e arraste para definir o recorte.'
                : 'Arraste para mover; a alça no canto redimensiona. Clique no cabeçalho ou na placa para editá-los.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-5 py-3">
          {/* F-048: editar preset existente — so aparece se ha preset selecionado
              e o config foi modificado em cima dele. */}
          {presetSelecionadoObj && (
            <Tooltip
              label={
                presetTemMudancas
                  ? `Salva as mudanças neste preset, atualizando "${presetSelecionadoObj.nome}" globalmente`
                  : 'Sem mudanças desde o preset selecionado'
              }
              side="top"
            >
              <span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAtualizarPreset}
                  disabled={!presetTemMudancas || updatePreset.isPending}
                >
                  {updatePreset.isPending ? (
                    <Icon name="loader-2" className="animate-spin" />
                  ) : (
                    <Icon name="save" />
                  )}
                  Atualizar preset
                </Button>
              </span>
            </Tooltip>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSalvarPresetOpen(true)}
          >
            <Icon name="bookmark" />
            Salvar como novo
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="default" size="sm" onClick={handleConfirm}>
            <Icon name="save" />
            Aplicar e fechar
          </Button>
        </footer>

        {salvarPresetOpen && (
          <NomeDoPresetDialog
            titulo="Salvar posicionamento como preset"
            descricao="Dê um nome ao preset. Ele fica disponível em qualquer escopo (corte, projeto, global, segmento)."
            placeholder="Ex.: Estúdio principal — facecam menor"
            value={nomePreset}
            onChange={setNomePreset}
            onConfirm={handleSalvarPreset}
            onClose={() => setSalvarPresetOpen(false)}
            confirmLabel="Salvar"
            confirmIcon="save"
            pending={savePreset.isPending}
          />
        )}

        {renomearPresetOpen && (
          <NomeDoPresetDialog
            titulo="Renomear preset"
            descricao="Edite o nome exibido para este preset. O conteúdo (recortes/encaixes) não muda."
            placeholder="Novo nome do preset"
            value={nomeRenomear}
            onChange={setNomeRenomear}
            onConfirm={handleRenomearPreset}
            onClose={() => setRenomearPresetOpen(false)}
            confirmLabel="Renomear"
            confirmIcon={ICONE_DO_CONCEITO.renomear}
            pending={updatePreset.isPending}
          />
        )}
      </div>
    </div>
  );
}
