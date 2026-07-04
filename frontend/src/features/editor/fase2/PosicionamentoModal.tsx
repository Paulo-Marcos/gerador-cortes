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

import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Loader2, Pencil, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { cn } from '@/lib/utils';
import {
  CropPicker,
  ModePicker,
  RECT_KEYS_ONE_SCREEN,
  RECT_KEYS_TWO_SCREENS,
  SharedRectEditor,
  SharedScreenCountToggle,
  SlotPreview,
  getRectLabel,
  isCropRectKey,
  isFacecamRectKey,
  resizeSlotForCrop,
  type SharedRectKey,
} from './posicionamentoControls';
import {
  useDeleteLayoutPreset,
  useLayoutPresets,
  useSaveLayoutPreset,
  useUpdateLayoutPreset,
} from './useLayoutPresets';
import {
  fullConfigDoPreset,
  fundoPlacaDoPreset,
  sharedConfigDoPreset,
  sharedConfigEquals,
  sharedConfigFromFull,
  type YoutubeBackgroundId,
  type YoutubeLayoutMode,
  type YoutubePlaca,
  type YoutubeSharedConfig,
  type YoutubeSharedRect,
  type YoutubeSharedScreenCount,
} from './youtubeLayout';
import { FundoThumb, YOUTUBE_BACKGROUND_OPTIONS } from './youtubeBackgrounds';
import type { LayoutPreset, LayoutPresetTipo } from '@/types/presets';

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
}: PosicionamentoModalProps) {
  const { notify } = useToast();
  const isFullMode = mode === 'full';
  const presetTipo: LayoutPresetTipo = isFullMode ? 'posicionamento_full' : 'posicionamento';
  const { data: presets = [] } = useLayoutPresets({ tipo: presetTipo });
  const savePreset = useSaveLayoutPreset();
  const updatePreset = useUpdateLayoutPreset();
  const deletePreset = useDeleteLayoutPreset();

  const [config, setConfig] = useState<YoutubeSharedConfig>(initialConfig);
  const [draftFundo, setDraftFundo] = useState<YoutubeBackgroundId>(fundo);
  const [draftPlaca, setDraftPlaca] = useState<YoutubePlaca>(placa);
  const [rectKey, setRectKey] = useState<SharedRectKey>(isFullMode ? 'crop_tela' : 'crop_facecam');
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
    () => (isFullMode || sharedScreenCount === 1 ? RECT_KEYS_ONE_SCREEN : RECT_KEYS_TWO_SCREENS),
    [isFullMode, sharedScreenCount],
  );

  useEffect(() => {
    if (sharedScreenCount === 1 && isFacecamRectKey(rectKey)) {
      setRectKey(rectKey === 'crop_facecam' ? 'crop_tela' : 'slot_tela');
    }
  }, [sharedScreenCount, rectKey]);

  const selectedRect = config[rectKey];
  const selectedCropKey = isCropRectKey(rectKey) ? rectKey : null;
  const selectedBaseRect =
    rectKey === 'slot_facecam'
      ? config.crop_facecam
      : rectKey === 'slot_tela'
        ? config.crop_tela
        : undefined;

  const updateRect = (key: SharedRectKey, rect: YoutubeSharedRect) => {
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
  const configDoPreset = (preset: LayoutPreset): YoutubeSharedConfig | null => {
    if (isFullMode) {
      const full = fullConfigDoPreset(preset);
      return full ? sharedConfigFromFull(full) : null;
    }
    return sharedConfigDoPreset(preset);
  };

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
    if (fundoPlacaEditavel) {
      const extras = fundoPlacaDoPreset(preset);
      if (extras.fundo) setDraftFundo(extras.fundo);
      if (extras.placa) setDraftPlaca(extras.placa);
    }
    setPresetSelecionado(preset.id);
    notify(`Preset "${preset.nome}" aplicado.`, { tone: 'success' });
  };

  const handleAplicarPresetSelecionado = () => {
    const preset = presets.find((p) => p.id === presetSelecionado);
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
        }
      : { compartilhada: config, fundo: draftFundo, placa: { ...draftPlaca } };

  // F-048: detecta o preset selecionado e se o config atual divergiu dele,
  // habilitando "Atualizar preset".
  const presetSelecionadoObj = useMemo(
    () => presets.find((p) => p.id === presetSelecionado) ?? null,
    [presets, presetSelecionado],
  );
  const presetConfigOriginal = useMemo(
    () => (presetSelecionadoObj ? configDoPreset(presetSelecionadoObj) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presetSelecionadoObj, isFullMode],
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
    onSave({ config, fundo: draftFundo, placa: draftPlaca });
    onClose();
  };

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
      <div className="flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
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
            <X size={15} />
          </button>
        </header>

        {/* Body — duas colunas: controles a esquerda, preview do video a direita */}
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,360px)_1fr] gap-0 overflow-hidden">
          {/* Coluna controles */}
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto border-r border-[var(--wb-border-soft)] p-4">
            {/* Preset bar */}
            <section className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2">
              <div className="mb-1.5 flex items-center gap-1.5">
                <Bookmark size={12} className="text-[var(--wb-text-dim)]" aria-hidden />
                <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                  Presets
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select
                  value={presetSelecionado}
                  onChange={(event) => setPresetSelecionado(event.target.value)}
                  className="h-7 min-w-0 flex-1 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-1.5 font-code text-[11px] text-[var(--wb-text)]"
                >
                  <option value="">
                    {presets.length === 0 ? 'Nenhum preset salvo' : 'Selecione um preset…'}
                  </option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.nome}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAplicarPresetSelecionado}
                  disabled={!presetSelecionado}
                >
                  Aplicar
                </Button>
                <Tooltip label="Renomear preset selecionado" side="top">
                  <span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={abrirRenomearPreset}
                      disabled={!presetSelecionado || updatePreset.isPending}
                      aria-label="Renomear preset selecionado"
                    >
                      <Pencil size={12} />
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip label="Remover preset selecionado" side="top">
                  <span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleDeletePreset}
                      disabled={!presetSelecionado || deletePreset.isPending}
                      aria-label="Remover preset selecionado"
                    >
                      {deletePreset.isPending ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <X size={12} />
                      )}
                    </Button>
                  </span>
                </Tooltip>
              </div>
            </section>

            {!isFullMode && (
              <SharedScreenCountToggle value={sharedScreenCount} onChange={handleScreenCount} />
            )}

            <div className={cn('grid gap-1.5', 'grid-cols-2')}>
              {rectOptions.map((key) => (
                <ModePicker
                  key={key}
                  active={rectKey === key}
                  label={getRectLabel(key, isFullMode ? 1 : sharedScreenCount)}
                  onClick={() => setRectKey(key)}
                />
              ))}
            </div>

            <SharedRectEditor
              className="mt-1"
              rect={selectedRect}
              baseRect={selectedBaseRect}
              onChange={(rect) => updateRect(rectKey, rect)}
              onChangeDraft={(rect) => updateRect(rectKey, rect)}
              onCommit={() => undefined}
            />

            {/* F-060: Fundo + Placa fazem parte do preset/escopo — editados
                aqui, nao mais na pagina de Layout. Segmentos herdam do corte. */}
            {fundoPlacaEditavel && (
              <>
                <section className="mt-1 rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2">
                  <div className="mb-1.5 font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                    Fundo
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {YOUTUBE_BACKGROUND_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        aria-pressed={draftFundo === opt.id}
                        title={opt.descricao}
                        onClick={() => setDraftFundo(opt.id)}
                        className={cn(
                          'flex h-[58px] flex-col items-stretch justify-between gap-1 overflow-hidden rounded-[var(--radius-xs)] border p-1.5 pt-1 text-left transition-colors',
                          draftFundo === opt.id
                            ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]'
                            : 'border-[var(--wb-border)] bg-[var(--wb-bg-card)] text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
                        )}
                      >
                        <span
                          className={cn(
                            'flex flex-1 items-center justify-center overflow-hidden rounded-[3px] border border-[var(--wb-border-soft)]',
                            draftFundo === opt.id
                              ? 'bg-[var(--wb-bg-card)]'
                              : 'bg-[var(--wb-bg-inset)]',
                          )}
                        >
                          <FundoThumb id={opt.id} />
                        </span>
                        <span className="truncate text-center text-[9px] font-semibold leading-[1.05]">
                          {opt.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="rounded-[var(--radius-sm)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] p-2">
                  <div className="mb-1.5 font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                    Placa de nome
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                      Nome
                      <Input
                        value={draftPlaca.nome}
                        maxLength={80}
                        placeholder="Ex.: Nome do Apresentador"
                        onChange={(event) =>
                          setDraftPlaca((current) => ({ ...current, nome: event.target.value }))
                        }
                        className="h-7 text-[11.5px]"
                      />
                    </label>
                    <label className="flex flex-col gap-0.5 font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                      Papel
                      <Input
                        value={draftPlaca.papel}
                        maxLength={80}
                        placeholder="Ex.: CTO"
                        onChange={(event) =>
                          setDraftPlaca((current) => ({ ...current, papel: event.target.value }))
                        }
                        className="h-7 text-[11.5px]"
                      />
                    </label>
                  </div>
                </section>
              </>
            )}
          </div>

          {/* Coluna preview — Recorte mostra video pra desenhar; Encaixe
              mostra previa do palco com slots arrastaveis. */}
          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-4">
            {selectedCropKey ? (
              <>
                <CropPicker
                  videoSrc={videoSrc}
                  currentTime={currentTime}
                  rect={config[selectedCropKey]}
                  drawingEnabled={drawingEnabled}
                  onToggleDrawing={() => setDrawingEnabled((v) => !v)}
                  onChange={(rect) => updateRect(selectedCropKey, rect)}
                />
                <p className="font-code text-[10px] leading-snug text-[var(--wb-text-dim)]">
                  Editor mostra o quadro do vídeo no tempo atual. Clique{' '}
                  <strong className="text-[var(--wb-text)]">Desenhar</strong> e arraste sobre o
                  quadro para definir o recorte.
                </p>
              </>
            ) : (
              <>
                <SlotPreview
                  config={config}
                  rectKey={rectKey}
                  videoSrc={videoSrc}
                  currentTime={currentTime}
                  fundo={draftFundo}
                  placa={draftPlaca}
                  onChangeSlot={(key, rect) => updateRect(key, rect)}
                />
                <p className="font-code text-[10px] leading-snug text-[var(--wb-text-dim)]">
                  Pré-visualização do palco. Arraste o retângulo destacado para mover o encaixe; use
                  os controles à esquerda para ajustar escala (escala muda o tamanho do encaixe
                  respeitando o recorte).
                </p>
              </>
            )}
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
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Save size={13} />
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
            <Bookmark size={13} />
            Salvar como novo
          </Button>
          <div className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" variant="default" size="sm" onClick={handleConfirm}>
            <Save size={13} />
            Aplicar e fechar
          </Button>
        </footer>

        {/* Mini modal aninhado para nomear o preset */}
        {salvarPresetOpen && (
          <div
            className="absolute inset-0 z-[90] flex items-center justify-center bg-black/40"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setSalvarPresetOpen(false);
            }}
          >
            <div className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              <strong className="block font-editorial text-[14px] text-[var(--wb-ink)]">
                Salvar posicionamento como preset
              </strong>
              <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
                Dê um nome ao preset. Ele fica disponível em qualquer escopo (corte, projeto,
                global, segmento).
              </p>
              <label className="mt-3 flex flex-col gap-1">
                <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                  Nome
                </span>
                <Input
                  autoFocus
                  value={nomePreset}
                  onChange={(event) => setNomePreset(event.target.value)}
                  placeholder="Ex.: Estúdio principal — facecam menor"
                  maxLength={120}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && nomePreset.trim()) {
                      event.preventDefault();
                      handleSalvarPreset();
                    }
                  }}
                />
              </label>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSalvarPresetOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleSalvarPreset}
                  disabled={!nomePreset.trim() || savePreset.isPending}
                >
                  {savePreset.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  Salvar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Mini modal aninhado para renomear o preset selecionado */}
        {renomearPresetOpen && (
          <div
            className="absolute inset-0 z-[90] flex items-center justify-center bg-black/40"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setRenomearPresetOpen(false);
            }}
          >
            <div className="w-full max-w-sm rounded-[var(--radius)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              <strong className="block font-editorial text-[14px] text-[var(--wb-ink)]">
                Renomear preset
              </strong>
              <p className="mt-1 text-[11px] text-[var(--wb-text-mute)]">
                Edite o nome exibido para este preset. O conteúdo (recortes/encaixes) não muda.
              </p>
              <label className="mt-3 flex flex-col gap-1">
                <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                  Nome
                </span>
                <Input
                  autoFocus
                  value={nomeRenomear}
                  onChange={(event) => setNomeRenomear(event.target.value)}
                  placeholder="Novo nome do preset"
                  maxLength={120}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && nomeRenomear.trim()) {
                      event.preventDefault();
                      handleRenomearPreset();
                    }
                  }}
                />
              </label>
              <div className="mt-4 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenomearPresetOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleRenomearPreset}
                  disabled={!nomeRenomear.trim() || updatePreset.isPending}
                >
                  {updatePreset.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                  Renomear
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
