import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Layers, Loader2, Save } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Tooltip } from '@/components/ui/tooltip';
import { corteKey, useAtualizarCorte } from '@/hooks/useEditor';
import { useToast } from '@/components/ui/toaster';
import type { AppSettings, Corte, Projeto } from '@/types/models';
import { api, rawVideoRedirectUrl } from '@/lib/api';
import { segParaMmSs } from '../timeUtils';
import { PosicionamentoModal, type PosicionamentoModalResult } from './PosicionamentoModal';
import {
  DEFAULT_FULL_CONFIG,
  DEFAULT_YOUTUBE_LAYOUT,
  findMatchingFullPreset,
  findMatchingPreset,
  fullConfigDoPreset,
  fundoPlacaDoPreset,
  mergeFullConfig,
  mergeSharedConfig,
  normalizeYoutubeLayout,
  resolveYoutubeModeAt,
  sharedConfigDoPreset,
  sharedConfigFromFull,
  sharedRegions,
  type YoutubeBackgroundId,
  type YoutubeFullConfig,
  type YoutubeLayout,
  type YoutubeLayoutMode,
  type YoutubeLayoutRegion,
  type YoutubePlaca,
  type YoutubeSharedConfig,
} from './youtubeLayout';
import { draftMatchesPreset, readPadraoModo } from './youtubeLayoutPadrao';
import { useLayoutPresets } from './useLayoutPresets';
import type { LayoutPreset } from '@/types/presets';
import { useSegmentosDetectados } from './useSegmentosDetectados';
import { ScanLine } from 'lucide-react';
import {
  DefinirPadroesCard,
  InlineModeToggle,
  PadraoAtualChip,
  RegionItem,
  SceneStat,
} from './youtubeLayoutPanel/components';
import { MODE_LABEL, clamp, round } from './youtubeLayoutPanel/shared';

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

interface Props {
  corteId: string;
  projetoId: string;
  layout: YoutubeLayout;
  currentTime: number;
  duration: number;
  onSeek: (seg: number) => void;
}

const LABEL_ESCOPO: Record<
  'corte' | 'projeto' | 'global' | 'segmento' | 'segmento_padrao',
  string
> = {
  corte: 'Corte',
  projeto: 'Projeto',
  global: 'Global',
  segmento: 'Segmento',
  segmento_padrao: 'Segmento (padrão)',
};

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

/** Identifica uma regiao por conteudo (sem IDs estaveis no schema). */
function regionFingerprint(r: { modo: string; inicio: number; fim: number }): string {
  return `${r.modo}:${r.inicio.toFixed(3)}-${r.fim.toFixed(3)}`;
}

export const YoutubeLayoutPanel = forwardRef<YoutubeLayoutPanelHandle, Props>(
  function YoutubeLayoutPanel(
    { corteId, projetoId, layout, currentTime, duration, onSeek }: Props,
    ref,
  ) {
    const queryClient = useQueryClient();
    const atualizar = useAtualizarCorte(corteId, projetoId);
    const { notify } = useToast();
    // F-054: gatilho manual de detecção de segmentos. Auto-trigger já roda no
    // pipeline do bruto; este botão re-roda quando o usuário quiser (ex.: ajustar
    // sensibilidade no futuro, ou cortes legados sem detecção).
    const {
      segmentos: segmentosDetectados,
      detectar: detectarSegmentos,
      detectando: detectandoSegmentos,
    } = useSegmentosDetectados(corteId, projetoId);
    const [draft, setDraft] = useState<YoutubeLayout>(() => normalizeYoutubeLayout(layout));
    const [dirty, setDirty] = useState(false);
    // I-029 v2: regioes deletadas localmente — usadas para FILTRAR o que vem
    // do cache na sincronizacao. Sem isso, um refetch do React Query (foco
    // de janela, staleTime, etc.) traria de volta as regioes que o usuario
    // achou que havia deletado, e o Ctrl+S persistia esse "zumbi". Limpa
    // automaticamente quando o save sucede (dirty -> false) ou quando o
    // EditorFase2 chama clearDeletedRegions() ao desfazer (Ctrl+Z).
    const deletedFingerprintsRef = useRef<Set<string>>(new Set());

    // F-048: estado do modal de posicionamento. scope identifica qual nivel
    // sera persistido no save; regionIndex e usado quando scope='segmento'.
    // I-029 v2: 'segmento_padrao' eh o padrao de segmento do corte (campo
    // compartilhada_segmento), separado do 'segmento' (override por-regiao).
    // F-060: modo identifica SE o modal define o posicionamento Compartilhada
    // ou Full (em full, initialConfig chega como sintetico de 1 tela). Fundo e
    // placa agora sao editados no modal (escopos corte/projeto/global).
    type ModalState = {
      scope: 'corte' | 'projeto' | 'global' | 'segmento' | 'segmento_padrao';
      modo: YoutubeLayoutMode;
      label: string;
      initialConfig: YoutubeSharedConfig;
      initialFundo: YoutubeBackgroundId;
      initialPlaca: YoutubePlaca;
      fundoPlacaEditavel: boolean;
      regionIndex?: number;
    };
    const [modal, setModal] = useState<ModalState | null>(null);

    // Queries: projeto (padrao por-projeto) + app-settings (padrao global,
    // escopo da aplicacao).
    const { data: projeto } = useQuery<Projeto>({
      queryKey: ['projeto', projetoId],
      queryFn: () => api.obterProjeto(projetoId),
      staleTime: 30_000,
    });
    const { data: appSettings } = useQuery<AppSettings>({
      queryKey: ['app-settings'],
      queryFn: api.obterSettings,
      staleTime: 30_000,
    });
    const padraoProjetoJson = projeto?.layout_youtube_padrao;
    const padraoGlobalJson = appSettings?.youtube_layout_padrao_global;

    // F-048: presets disponiveis para identificar qual esta em uso por escopo.
    const { data: presetsDisponiveis = [] } = useLayoutPresets({ tipo: 'posicionamento' });
    // F-060: presets do posicionamento FULL.
    const { data: presetsFullDisponiveis = [] } = useLayoutPresets({ tipo: 'posicionamento_full' });

    // Modal de confirmacao generico. Usado por Usar/Definir × Projeto/Global.
    const [confirm, setConfirm] = useState<null | {
      title: string;
      description: ReactNode;
      confirmLabel: string;
      onConfirm: () => void;
    }>(null);

    // Estado de expansao do card "Definir padroes" (comeca colapsado).
    // F-060: Fundo e Placa sairam do painel — agora vivem no modal "Definir".
    const [padraoOpen, setPadraoOpen] = useState(false);
    // F-060: qual modo o card "Definir padroes" esta configurando. Inicia no
    // modo do corte e re-sincroniza quando ele muda.
    const [modoDefinir, setModoDefinir] = useState<YoutubeLayoutMode>(draft.modo_padrao);
    useEffect(() => {
      setModoDefinir(draft.modo_padrao);
    }, [draft.modo_padrao]);

    const definirPadraoGlobalMutation = useMutation({
      mutationFn: (layoutJson: string) =>
        api.atualizarRenderConfig(projetoId, {
          layout_youtube_padrao: layoutJson,
          global_update: true,
        }),
      onSuccess: (updated) => {
        notify('Padrão global salvo. Vale para TODOS os projetos.', { tone: 'success' });
        queryClient.setQueryData(['projeto', projetoId], updated);
        void queryClient.invalidateQueries({ queryKey: ['projeto'] });
        // F-024: backend tambem persistiu no app-settings — invalida o cache
        // para o caption "Usando padrao Global" refletir imediatamente.
        void queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      },
      onError: (error) => {
        notify(error instanceof Error ? error.message : 'Erro ao definir padrão global.', {
          tone: 'error',
        });
      },
    });

    const definirPadraoProjetoMutation = useMutation({
      mutationFn: (layoutJson: string) =>
        api.atualizarRenderConfig(projetoId, {
          layout_youtube_padrao: layoutJson,
          global_update: false,
        }),
      onSuccess: (updated) => {
        notify('Padrão do projeto salvo com sucesso.', { tone: 'success' });
        queryClient.setQueryData(['projeto', projetoId], updated);
      },
      onError: (error) => {
        notify(error instanceof Error ? error.message : 'Erro ao definir padrão do projeto.', {
          tone: 'error',
        });
      },
    });

    // I-029 v2: a sincronizacao do draft com `layout` cobre 3 cenarios:
    //   1. Painel limpo (`dirty=false`): adota o `layout` externo integral —
    //      o usuario nao tem edicoes pendentes para preservar.
    //   2. Painel sujo + drag/+Comp/+Full pela timeline: regioes do cache
    //      diferem do draft. Adotamos as regioes do cache (mantendo
    //      fundo/placa/etc do draft, que podem estar com edicoes locais).
    //   3. Painel sujo + refetch do React Query: o cache volta ao estado do
    //      backend, que ainda tem regioes que o usuario deletou localmente.
    //      `deletedFingerprintsRef` filtra essas reaparicoes; sem isso, um
    //      Ctrl+S apos refetch re-introduzia as regioes deletadas.
    //
    // Tambem detecta mudancas via INDICE+CONTEUDO (drag-resize): o cache
    // tem [A, newC], o draft [A, OLD_C]; lengths batem mas conteudo nao. Por
    // isso sempre comparamos a lista filtrada com a do draft.
    useEffect(() => {
      if (!dirty) {
        setDraft(normalizeYoutubeLayout(layout));
        deletedFingerprintsRef.current.clear();
        return;
      }
      const externas = layout.regioes.filter(
        (lr) => !deletedFingerprintsRef.current.has(regionFingerprint(lr)),
      );
      setDraft((current) => {
        // Evita re-render quando o cache nao trouxe nada novo.
        if (JSON.stringify(current.regioes) === JSON.stringify(externas)) return current;
        return normalizeYoutubeLayout({ ...current, regioes: externas });
      });
    }, [layout, dirty]);

    const activeMode = resolveYoutubeModeAt(draft, currentTime);
    const shared = useMemo(() => sharedRegions(draft, duration), [draft, duration]);
    const tipoProjeto: YoutubeLayoutMode = readPadraoModo(padraoProjetoJson) ?? 'full';

    // I-025: o corte herda o "Modo" do projeto até o usuário escolher
    // explicitamente Full ou Compartilhada aqui. Considera "herdando" quando o
    // JSON salvo do corte é o sentinela inicial (sem compartilhada/fundo/placa/
    // regioes e sem modo='compartilhada' explícito) — espelha o `corte_configurado`
    // do backend. Como `patch` atualiza o cache do React Query, a flag flipa
    // imediatamente ao primeiro clique nas pílulas.
    const modoHerdando = useMemo(() => {
      const corteRaw = queryClient.getQueryData<Corte>(corteKey(corteId));
      const rawLayout = (corteRaw as unknown as { layout_youtube?: unknown } | undefined)
        ?.layout_youtube;
      if (!rawLayout) return true;
      try {
        const parsed = typeof rawLayout === 'string' ? JSON.parse(rawLayout || '{}') : rawLayout;
        if (!parsed || typeof parsed !== 'object') return true;
        const obj = parsed as Record<string, unknown>;
        const modoRaw = String(obj.modo_padrao ?? '').toLowerCase();
        const corteConfigurado =
          'compartilhada' in obj ||
          'fundo' in obj ||
          'placa' in obj ||
          (Array.isArray(obj.regioes) && obj.regioes.length > 0) ||
          modoRaw === 'compartilhada';
        return !corteConfigurado;
      } catch {
        return true;
      }
      // `draft` na dep list garante recomputo quando patch atualiza o cache local.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryClient, corteId, draft]);

    // syncQuery=false mantem a edicao apenas no draft local enquanto o
    // usuario digita num input controlado. Sincronizar o cache do React
    // Query no meio da digitacao re-renderiza a arvore pai (ScenesPostProduction
    // -> EditorFase2 -> YoutubeLayoutPanel) e o input perde o foco. O
    // commit no cache acontece no onBlur via commitDraft.
    const patch = (next: YoutubeLayout, syncQuery: boolean = true) => {
      const normalized = normalizeYoutubeLayout(next);
      setDraft(normalized);
      setDirty(true);
      if (syncQuery) {
        queryClient.setQueryData<Corte>(corteKey(corteId), (current) =>
          current ? ({ ...current, layout_youtube: normalized } as Corte) : current,
        );
      }
    };

    const handleDefault = (modo: YoutubeLayoutMode) => {
      patch({ ...draft, modo_padrao: modo });
    };

    const handleRegion = (index: number, region: YoutubeLayoutRegion) => {
      const regioes = draft.regioes.map((item, idx) => (idx === index ? region : item));
      patch({ ...draft, regioes });
    };

    const commitRegionInicio = (index: number, region: YoutubeLayoutRegion, seg: number) => {
      const inicio = clamp(round(seg), 0, duration);
      const fim = clamp(
        Math.max(region.fim, inicio + 1),
        inicio + 0.1,
        Math.max(inicio + 0.1, duration),
      );
      handleRegion(index, { ...region, inicio, fim });
    };

    const commitRegionFim = (index: number, region: YoutubeLayoutRegion, seg: number) => {
      const fim = clamp(round(seg), region.inicio + 0.1, Math.max(region.inicio + 0.1, duration));
      handleRegion(index, { ...region, fim });
    };

    // addRegion local removido (F-024 fase 6): adicionar regioes agora
    // vive na timeline (SceneTimeline -> EditorFase2.handleAddRegion).

    const removeRegion = (index: number) => {
      // I-029 v2: registra o "fingerprint" da regiao deletada para que um
      // refetch posterior do React Query nao a re-introduza pelo sync useEffect.
      const alvo = draft.regioes[index];
      if (alvo) {
        deletedFingerprintsRef.current.add(regionFingerprint(alvo));
      }
      patch({ ...draft, regioes: draft.regioes.filter((_, idx) => idx !== index) });
    };

    const aplicarOverrideSegmento = (
      index: number,
      override: Partial<YoutubeSharedConfig> | undefined,
      syncQuery: boolean = true,
    ) => {
      const regioes = draft.regioes.map((item, idx) => {
        if (idx !== index) return item;
        if (!override || Object.keys(override).length === 0) {
          const { compartilhada: _omit, ...rest } = item;
          void _omit;
          return rest as YoutubeLayoutRegion;
        }
        return { ...item, compartilhada: override };
      });
      patch({ ...draft, regioes }, syncQuery);
    };

    // F-060: analogo do aplicarOverrideSegmento para regioes modo=full.
    const aplicarOverrideSegmentoFull = (
      index: number,
      override: Partial<YoutubeFullConfig> | undefined,
      syncQuery: boolean = true,
    ) => {
      const regioes = draft.regioes.map((item, idx) => {
        if (idx !== index) return item;
        if (!override || Object.keys(override).length === 0) {
          const { full: _omit, ...rest } = item;
          void _omit;
          return rest as YoutubeLayoutRegion;
        }
        return { ...item, full: override };
      });
      patch({ ...draft, regioes }, syncQuery);
    };

    const save = useCallback(() => {
      const body = { layout_youtube: normalizeYoutubeLayout(draft) } as Partial<Corte>;
      atualizar.mutate(body, {
        onSuccess: () => {
          setDirty(false);
          notify('Layout YouTube salvo.', { tone: 'success' });
        },
        onError: (error) => {
          notify(error instanceof Error ? error.message : 'Erro ao salvar layout.', {
            tone: 'error',
          });
        },
      });
    }, [draft, atualizar, notify]);

    // Ctrl+S na tela Pos delega para save via ref. Sem dirty, retorna
    // false (parent fica em silencio).
    useImperativeHandle(
      ref,
      () => ({
        saveIfDirty: () => {
          if (!dirty || atualizar.isPending) return false;
          save();
          return true;
        },
        clearDeletedRegions: () => {
          deletedFingerprintsRef.current.clear();
        },
      }),
      [dirty, atualizar.isPending, save],
    );

    // F-048 + I-029 v2: helpers para extrair o compartilhada efetivo de cada
    // escopo. 'segmento_padrao' eh o padrao de segmento DESTE corte (vive
    // em draft.compartilhada_segmento), so existe localmente.
    type EscopoPadrao = 'corte' | 'projeto' | 'global' | 'segmento_padrao';
    const compartilhadaDoEscopo = (escopo: EscopoPadrao): YoutubeSharedConfig => {
      if (escopo === 'corte') return draft.compartilhada;
      if (escopo === 'segmento_padrao') {
        return draft.compartilhada_segmento ?? draft.compartilhada;
      }
      const json = escopo === 'projeto' ? padraoProjetoJson : padraoGlobalJson;
      if (!json || json === '{}') return DEFAULT_YOUTUBE_LAYOUT.compartilhada;
      try {
        return normalizeYoutubeLayout(JSON.parse(json)).compartilhada;
      } catch {
        return DEFAULT_YOUTUBE_LAYOUT.compartilhada;
      }
    };

    // F-060: analogo do compartilhadaDoEscopo para o posicionamento FULL.
    const fullDoEscopo = (escopo: EscopoPadrao): YoutubeFullConfig => {
      if (escopo === 'corte') return draft.full;
      if (escopo === 'segmento_padrao') {
        return draft.full_segmento ?? draft.full;
      }
      const json = escopo === 'projeto' ? padraoProjetoJson : padraoGlobalJson;
      if (!json || json === '{}') return DEFAULT_FULL_CONFIG;
      try {
        return normalizeYoutubeLayout(JSON.parse(json)).full;
      } catch {
        return DEFAULT_FULL_CONFIG;
      }
    };

    // F-048/F-060: padrao definido nesse nivel PARA O MODO. Para o corte e
    // projeto/global, lemos o raw (o normalizado nao distingue "definido" de
    // "herdando" — o default preenche tudo).
    const escopoDefinido = (escopo: EscopoPadrao, modo: YoutubeLayoutMode): boolean => {
      const chave = modo === 'full' ? 'full' : 'compartilhada';
      if (escopo === 'corte') {
        const corteRaw = queryClient.getQueryData<Corte>(corteKey(corteId));
        const rawLayout = (corteRaw as unknown as { layout_youtube?: unknown } | undefined)
          ?.layout_youtube;
        if (!rawLayout) return false;
        try {
          const parsed = typeof rawLayout === 'string' ? JSON.parse(rawLayout || '{}') : rawLayout;
          return Boolean(parsed && typeof parsed === 'object' && chave in parsed);
        } catch {
          return false;
        }
      }
      if (escopo === 'segmento_padrao') {
        return modo === 'full' ? draft.full_segmento != null : draft.compartilhada_segmento != null;
      }
      const json = escopo === 'projeto' ? padraoProjetoJson : padraoGlobalJson;
      if (!json || json === '{}') return false;
      try {
        const parsed = JSON.parse(json);
        return Boolean(parsed && typeof parsed === 'object' && chave in parsed);
      } catch {
        return false;
      }
    };

    // F-048: nome do preset salvo nesse escopo (se algum bater por posicionamento).
    const presetNomeDoEscopo = (escopo: EscopoPadrao, modo: YoutubeLayoutMode): string | null => {
      if (!escopoDefinido(escopo, modo)) return null;
      if (modo === 'full') {
        const match = findMatchingFullPreset(presetsFullDisponiveis, fullDoEscopo(escopo));
        return match?.nome ?? null;
      }
      const match = findMatchingPreset(presetsDisponiveis, compartilhadaDoEscopo(escopo));
      return match?.nome ?? null;
    };

    // Qual escopo esta efetivamente "alimentando" o corte agora (no modo dele)?
    // Hierarquia: corte (se definido) > projeto > global > default.
    const modoChip = draft.modo_padrao;
    const escopoAtivoCorte: 'corte' | 'projeto' | 'global' | 'default' = escopoDefinido(
      'corte',
      modoChip,
    )
      ? 'corte'
      : escopoDefinido('projeto', modoChip)
        ? 'projeto'
        : escopoDefinido('global', modoChip)
          ? 'global'
          : 'default';
    const presetNomeAtivo =
      escopoAtivoCorte === 'default' ? null : presetNomeDoEscopo(escopoAtivoCorte, modoChip);

    // F-060: o modal trabalha com config sintetico de 1 tela quando modo=full;
    // na persistencia voltamos para o shape {crop, slot}.
    const fullFromSynthetic = (config: YoutubeSharedConfig): YoutubeFullConfig => ({
      crop: { ...config.crop_tela },
      slot: { ...config.slot_tela },
    });

    // Persiste config de posicionamento num escopo, no modo dado. F-060:
    // fundo/placa agora acompanham o posicionamento (vem do modal/preset) nos
    // escopos corte/projeto/global; segmentos herdam do corte e nao recebem.
    const persistirEscopo = (
      escopo: EscopoPadrao,
      modo: YoutubeLayoutMode,
      config: YoutubeSharedConfig,
      extras?: { fundo?: YoutubeBackgroundId; placa?: YoutubePlaca },
    ) => {
      if (escopo === 'corte') {
        const next: YoutubeLayout =
          modo === 'full'
            ? { ...draft, full: fullFromSynthetic(config) }
            : { ...draft, compartilhada: config };
        if (extras?.fundo) next.fundo = extras.fundo;
        if (extras?.placa) next.placa = extras.placa;
        patch(next);
        return;
      }
      if (escopo === 'segmento_padrao') {
        // I-029 v2: salva o padrao de segmento direto no corte (campo opcional).
        if (modo === 'full') {
          patch({ ...draft, full_segmento: fullFromSynthetic(config) });
        } else {
          patch({ ...draft, compartilhada_segmento: config });
        }
        return;
      }
      const json = escopo === 'projeto' ? padraoProjetoJson : padraoGlobalJson;
      let base = DEFAULT_YOUTUBE_LAYOUT;
      if (json && json !== '{}') {
        try {
          base = normalizeYoutubeLayout(JSON.parse(json));
        } catch {
          // ignora — usa default
        }
      }
      const novoJson = JSON.stringify({
        modo_padrao: base.modo_padrao,
        fundo: extras?.fundo ?? base.fundo,
        placa: extras?.placa ?? base.placa,
        compartilhada: modo === 'full' ? base.compartilhada : config,
        full: modo === 'full' ? fullFromSynthetic(config) : base.full,
      });
      if (escopo === 'global') {
        definirPadraoGlobalMutation.mutate(novoJson);
      } else {
        definirPadraoProjetoMutation.mutate(novoJson);
      }
    };

    const abrirModalPosicionamento = (
      escopo: 'corte' | 'projeto' | 'global' | 'segmento' | 'segmento_padrao',
      modo: YoutubeLayoutMode,
      options?: { regionIndex?: number; initialConfig?: YoutubeSharedConfig },
    ) => {
      const label = LABEL_ESCOPO[escopo];
      // F-060: fundo/placa sao editaveis nos escopos corte/projeto/global; o
      // valor inicial vem do JSON do proprio escopo (corte usa o draft).
      const fundoPlacaEditavel = escopo === 'corte' || escopo === 'projeto' || escopo === 'global';
      let initialFundo = draft.fundo;
      let initialPlaca = draft.placa;
      if (escopo === 'projeto' || escopo === 'global') {
        const json = escopo === 'projeto' ? padraoProjetoJson : padraoGlobalJson;
        if (json && json !== '{}') {
          try {
            const base = normalizeYoutubeLayout(JSON.parse(json));
            initialFundo = base.fundo;
            initialPlaca = base.placa;
          } catch {
            // ignora — usa o draft
          }
        }
      }
      if (escopo === 'segmento') {
        const initial =
          options?.initialConfig ??
          (modo === 'full' ? sharedConfigFromFull(draft.full) : draft.compartilhada);
        setModal({
          scope: 'segmento',
          modo,
          label,
          initialConfig: initial,
          initialFundo,
          initialPlaca,
          fundoPlacaEditavel: false,
          regionIndex: options?.regionIndex,
        });
        return;
      }
      const initialConfig =
        modo === 'full'
          ? sharedConfigFromFull(fullDoEscopo(escopo))
          : compartilhadaDoEscopo(escopo);
      setModal({
        scope: escopo,
        modo,
        label,
        initialConfig,
        initialFundo,
        initialPlaca,
        fundoPlacaEditavel,
      });
    };

    const handleModalSave = (result: PosicionamentoModalResult) => {
      if (!modal) return;
      const { config, fundo, placa } = result;
      if (modal.scope === 'segmento' && modal.regionIndex !== undefined) {
        if (modal.modo === 'full') {
          // Override FULL de segmento: reduz para campos que diferem da base.
          const base = draft.full;
          const novo = fullFromSynthetic(config);
          const partial: Partial<YoutubeFullConfig> = {};
          (['crop', 'slot'] as const).forEach((chave) => {
            const a = novo[chave];
            const b = base[chave];
            if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) {
              partial[chave] = a;
            }
          });
          aplicarOverrideSegmentoFull(
            modal.regionIndex,
            Object.keys(partial).length > 0 ? partial : undefined,
          );
          return;
        }
        // Override de segmento: reduz para campos que diferem da base do corte.
        const base = draft.compartilhada;
        const partial: Partial<YoutubeSharedConfig> = {};
        if (config.telas !== base.telas) partial.telas = config.telas;
        (['crop_facecam', 'crop_tela', 'slot_facecam', 'slot_tela'] as const).forEach((chave) => {
          const a = config[chave];
          const b = base[chave];
          if (a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h) {
            partial[chave] = a;
          }
        });
        aplicarOverrideSegmento(
          modal.regionIndex,
          Object.keys(partial).length > 0 ? partial : undefined,
        );
      } else if (
        modal.scope === 'corte' ||
        modal.scope === 'projeto' ||
        modal.scope === 'global' ||
        modal.scope === 'segmento_padrao'
      ) {
        persistirEscopo(
          modal.scope,
          modal.modo,
          config,
          modal.fundoPlacaEditavel ? { fundo, placa } : undefined,
        );
      }
    };

    const handlePresetEscopo = (
      escopo: EscopoPadrao,
      modo: YoutubeLayoutMode,
      preset: LayoutPreset,
    ) => {
      // F-060: preset carrega fundo/placa — aplicados nos escopos corte/projeto/
      // global. Presets legados (sem fundo/placa) preservam o que ja esta salvo.
      const extras = escopo === 'segmento_padrao' ? undefined : fundoPlacaDoPreset(preset);
      if (modo === 'full') {
        const full = fullConfigDoPreset(preset);
        if (!full) return;
        persistirEscopo(escopo, 'full', sharedConfigFromFull(full), extras);
        return;
      }
      const novoConfig = sharedConfigDoPreset(preset);
      if (!novoConfig) return;
      persistirEscopo(escopo, 'compartilhada', novoConfig, extras);
    };

    // I-029 v2 / F-060: remove explicitamente o padrao de segmento do modo
    // (volta a herdar do corte). Util para resetar sem abrir o modal.
    const removerPadraoSegmento = (modo: YoutubeLayoutMode) => {
      if (modo === 'full') {
        if (draft.full_segmento == null) return;
        const { full_segmento: _omit, ...rest } = draft;
        void _omit;
        patch(rest as YoutubeLayout);
        return;
      }
      if (draft.compartilhada_segmento == null) return;
      const { compartilhada_segmento: _omit, ...rest } = draft;
      void _omit;
      patch(rest as YoutubeLayout);
    };

    // F-048: cascade lazy — aplicacao do padrao acontece automaticamente no
    // momento do consumo (preview/render). O "Usar" foi removido daqui.
    // `padraoUsando` ainda informa o chip do header com qual escopo casa.
    const padraoUsando: 'projeto' | 'global' | 'custom' = draftMatchesPreset(
      draft,
      padraoProjetoJson,
    )
      ? 'projeto'
      : draftMatchesPreset(draft, padraoGlobalJson)
        ? 'global'
        : 'custom';

    // Setar tipo do projeto: faz PATCH parcial preservando fundo/placa/
    // compartilhada ja salvos (ou usa defaults DEFAULT_YOUTUBE_LAYOUT).
    const definirTipoProjeto = (novoModo: YoutubeLayoutMode) => {
      let presetExistente: { fundo?: unknown; placa?: unknown; compartilhada?: unknown } = {};
      if (padraoProjetoJson && padraoProjetoJson !== '{}') {
        try {
          presetExistente = JSON.parse(padraoProjetoJson) as typeof presetExistente;
        } catch {
          // ignorar — usa defaults abaixo
        }
      }
      const base = normalizeYoutubeLayout(presetExistente);
      const json = JSON.stringify({
        modo_padrao: novoModo,
        fundo: base.fundo,
        placa: base.placa,
        compartilhada: base.compartilhada,
      });
      definirPadraoProjetoMutation.mutate(json);
    };

    // Acoes do card de tipo do projeto preservam o modal de confirmacao.
    const requestConfirm = (
      title: string,
      description: ReactNode,
      confirmLabel: string,
      onConfirm: () => void,
    ) => setConfirm({ title, description, confirmLabel, onConfirm });

    const handleDefinirTipoProjeto = (novoModo: YoutubeLayoutMode) => {
      if (novoModo === tipoProjeto) return;
      requestConfirm(
        `Mudar tipo do projeto para ${MODE_LABEL[novoModo]}?`,
        novoModo === 'full'
          ? 'Novos cortes vão começar em Full (vídeo inteiro). Cortes existentes mantêm o modo atual — ainda podem ser sobrescritos pontualmente.'
          : 'Novos cortes vão começar em Compartilhada (facecam + tela). Cortes existentes mantêm o modo atual — ainda podem ser sobrescritos pontualmente.',
        'Mudar tipo',
        () => {
          setConfirm(null);
          definirTipoProjeto(novoModo);
        },
      );
    };

    const padraoLabel: string =
      padraoUsando === 'projeto'
        ? 'Usando padrão Projeto'
        : padraoUsando === 'global'
          ? 'Usando padrão Global'
          : 'Customizado (não usa padrão)';

    return (
      <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Cabecalho */}
          <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] p-3">
            <div className="mb-2.5 flex items-center gap-2">
              <Layers size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
              <strong className="font-editorial text-[17px] font-medium text-[var(--wb-ink)]">
                Layout YouTube
              </strong>
              <span className="rounded-full bg-[var(--wb-info-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-info)]">
                agora: {MODE_LABEL[activeMode]}
              </span>
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
                  {detectandoSegmentos ? <Loader2 className="animate-spin" /> : <ScanLine />}
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
                    {atualizar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                    Salvar
                  </Button>
                </Tooltip>
              )}
            </div>

            {/* Stats grid 3 — subiu pra cima (decisao Paulo) */}
            <div className="mb-2 grid grid-cols-3 gap-1.5">
              <SceneStat label="Regioes" value={String(draft.regioes.length)} />
              <SceneStat label="Shared" value={String(shared.length)} />
              <SceneStat label="Duracao" value={segParaMmSs(duration, true)} />
            </div>

            {/* Tipo do projeto + Modo do corte — linhas compactas
              (decisao Paulo). Cada uma: caption + segmented pequeno. */}
            <InlineModeToggle
              label="Tipo do projeto"
              hint="novos cortes herdam"
              value={tipoProjeto}
              pending={definirPadraoProjetoMutation.isPending}
              onChange={handleDefinirTipoProjeto}
            />
            <InlineModeToggle
              label="Modo deste corte"
              value={draft.modo_padrao}
              onChange={handleDefault}
              herdando={modoHerdando}
              herdandoDe={tipoProjeto}
            />

            {/* F-048/F-060: padrao atual do corte — mostra qual preset/nivel
              esta alimentando o modo padrao do corte (Full ou Compartilhada). */}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.08em] text-[var(--wb-text-dim)]">
                Padrão atual
              </span>
              <PadraoAtualChip escopo={escopoAtivoCorte} presetNome={presetNomeAtivo} />
            </div>
          </header>

          {/* F-048/F-060: Definir padroes (Corte / Projeto / Global) — sempre
            visivel; o toggle escolhe se esta definindo o posicionamento Full
            ou Compartilhada. Cada linha tem split button "Definir ▾" que abre
            o modal (com fundo/placa) ou aplica preset direto. */}
          <div className="border-b border-[var(--wb-border-soft)] p-3">
            <DefinirPadroesCard
              open={padraoOpen}
              onToggle={() => setPadraoOpen((v) => !v)}
              label={padraoLabel}
              usando={padraoUsando}
              modo={modoDefinir}
              onChangeModo={setModoDefinir}
              corteDefinido={escopoDefinido('corte', modoDefinir)}
              projetoDefinido={escopoDefinido('projeto', modoDefinir)}
              globalDefinido={escopoDefinido('global', modoDefinir)}
              segmentoPadraoDefinido={escopoDefinido('segmento_padrao', modoDefinir)}
              presetCorteNome={presetNomeDoEscopo('corte', modoDefinir)}
              presetProjetoNome={presetNomeDoEscopo('projeto', modoDefinir)}
              presetGlobalNome={presetNomeDoEscopo('global', modoDefinir)}
              presetSegmentoPadraoNome={presetNomeDoEscopo('segmento_padrao', modoDefinir)}
              onDefinirCorte={() => abrirModalPosicionamento('corte', modoDefinir)}
              onDefinirProjeto={() => abrirModalPosicionamento('projeto', modoDefinir)}
              onDefinirGlobal={() => abrirModalPosicionamento('global', modoDefinir)}
              onDefinirSegmentoPadrao={() =>
                abrirModalPosicionamento('segmento_padrao', modoDefinir)
              }
              onPresetCorte={(preset) => handlePresetEscopo('corte', modoDefinir, preset)}
              onPresetProjeto={(preset) => handlePresetEscopo('projeto', modoDefinir, preset)}
              onPresetGlobal={(preset) => handlePresetEscopo('global', modoDefinir, preset)}
              onPresetSegmentoPadrao={(preset) =>
                handlePresetEscopo('segmento_padrao', modoDefinir, preset)
              }
              onResetSegmentoPadrao={() => removerPadraoSegmento(modoDefinir)}
              pendingProjeto={definirPadraoProjetoMutation.isPending}
              pendingGlobal={definirPadraoGlobalMutation.isPending}
            />
          </div>

          {/* REGIOES — v3_pos.jsx:1102-1117 */}
          <div className="px-3 pb-3 pt-1">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="font-code text-[9.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-dim)]">
                Regioes customizadas
              </span>
              <span className="rounded-full bg-[var(--wb-bg-inset)] px-1.5 py-0.5 font-code text-[9.5px] font-bold text-[var(--wb-text-mute)]">
                {draft.regioes.length}
              </span>
              <div className="flex-1" />
              <span className="font-code text-[9px] uppercase tracking-[0.08em] text-[var(--wb-text-faint)]">
                + na timeline ↙
              </span>
            </div>

            {draft.regioes.length === 0 ? (
              <div className="flex min-h-[60px] items-center justify-center rounded-[var(--radius-sm)] border border-dashed border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 text-center text-[11px] text-[var(--wb-text-mute)]">
                Sem intervalos manuais
              </div>
            ) : (
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
