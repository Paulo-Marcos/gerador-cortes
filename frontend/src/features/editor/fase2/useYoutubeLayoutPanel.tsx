import {
  
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { corteKey, useAtualizarCorte } from '@/features/editor/useCortes';
import { useToast } from '@/components/ui/toaster';
import type { AppSettings, Corte, Projeto } from '@/types/models';
import { projetosApi } from '@/features/projetos/api';
import {  type PosicionamentoModalResult } from './PosicionamentoModal';
import {
  DEFAULT_FULL_CONFIG,
  DEFAULT_YOUTUBE_LAYOUT,
  chavesMudadas,
  findMatchingFullPreset,
  findMatchingPreset,
  fullConfigDoPreset,
  fundoPlacaDoPreset,
  
  
  mesclarNoLayoutDoCorte,
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
} from '@/shared/palco/youtubeLayout';
import { modoPadraoDoEscopo, montarPadraoJson } from './youtubeLayoutPadrao';
import { useLayoutPresets } from '@/shared/palco/useLayoutPresets';
import type { LayoutPreset } from '@/types/presets';
import { useSegmentosDetectados } from './useSegmentosDetectados';
import { MODE_LABEL, round } from './youtubeLayoutPanel/shared';
import { settingsApi } from '@/features/settings/api';
import { limitar } from '@/lib/limitar';
import type { Props, YoutubeLayoutPanelHandle } from './YoutubeLayoutPanel';
import type { ForwardedRef } from 'react';


export const LABEL_ESCOPO: Record<
  'corte' | 'projeto' | 'global' | 'segmento' | 'segmento_padrao',
  string
> = {
  corte: 'Corte',
  projeto: 'Projeto',
  global: 'Global',
  segmento: 'Segmento',
  segmento_padrao: 'Segmento (padrão)',
};

/** Identifica uma regiao por conteudo (sem IDs estaveis no schema). */
export function regionFingerprint(r: { modo: string; inicio: number; fim: number }): string {
  return `${r.modo}:${r.inicio.toFixed(3)}-${r.fim.toFixed(3)}`;
}

// D-729: o container de YoutubeLayoutPanel — estado, efeitos e ações. A view, em
// YoutubeLayoutPanel.tsx, só desenha o que este hook devolve.
export function useYoutubeLayoutPanel({ corteId, projetoId, layout, currentTime, duration }: Props, ref: ForwardedRef<YoutubeLayoutPanelHandle>) {
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
    // D-741: as chaves que ESTE painel mudou desde o último save. O save manda
    // só elas; mandar o layout resolvido inteiro gravava os padrões no corte,
    // e ele parava de herdar do projeto e do global (RN-10).
    const mudadasRef = useRef<Set<string>>(new Set());
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
      queryFn: () => projetosApi.obterProjeto(projetoId),
      staleTime: 30_000,
    });
    const { data: appSettings } = useQuery<AppSettings>({
      queryKey: ['app-settings'],
      queryFn: settingsApi.obterSettings,
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

    // AUDITORIA-v4 §3: painel nasce enxuto — a lista de regiões abre sob demanda.
    // D-421: `padraoOpen` e `ajusteFinoOpen` sumiram. Eram dois disclosures
    // escondendo um controle cada; a escada de escopos e o tipo do projeto são
    // a informação central do painel e agora ficam sempre visíveis.
    const [regioesOpen, setRegioesOpen] = useState(false);
    // F-060: qual modo a escada de escopos está configurando. Inicia no modo do
    // corte e re-sincroniza quando ele muda; o link no cabeçalho da escada
    // permite definir os padrões do outro modo sem trocar o modo do corte.
    const [modoEscada, setModoEscada] = useState<YoutubeLayoutMode>(draft.modo_padrao);
    useEffect(() => {
      setModoEscada(draft.modo_padrao);
    }, [draft.modo_padrao]);

    const definirPadraoGlobalMutation = useMutation({
      mutationFn: (layoutJson: string) =>
        projetosApi.atualizarRenderConfig(projetoId, {
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
        projetosApi.atualizarRenderConfig(projetoId, {
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
    const tipoProjeto: YoutubeLayoutMode = modoPadraoDoEscopo(padraoProjetoJson);
    // D-423: mesmo par leitura/escrita do projeto, para o escopo Global. Sem ele
    // `persistirEscopo` nao tinha o que preservar e reescrevia `modo_padrao`.
    const tipoGlobal: YoutubeLayoutMode = modoPadraoDoEscopo(padraoGlobalJson);

    // I-025: o corte herda o "Modo" do projeto até o usuário escolher
    // explicitamente Full ou Compartilhada aqui. Considera "herdando" quando o
    // JSON salvo do corte é o sentinela inicial (sem compartilhada/fundo/placa/
    // regioes e sem modo='compartilhada' explícito) — espelha o `corte_configurado`
    // do backend. Como `patch` atualiza o cache do React Query, a flag flipa
    // imediatamente ao primeiro clique nas pílulas. Lido a cada render, e não
    // memorizado: é o cache que muda, e o memo só enxergava isso pelo `draft`.
    const modoHerdando = (() => {
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
    })();

    // syncQuery=false mantem a edicao apenas no draft local enquanto o
    // usuario digita num input controlado. Sincronizar o cache do React
    // Query no meio da digitacao re-renderiza a arvore pai (ScenesPostProduction
    // -> EditorFase2 -> YoutubeLayoutPanel) e o input perde o foco. O
    // commit no cache acontece no onBlur via commitDraft.
    const patch = (next: YoutubeLayout, syncQuery: boolean = true) => {
      const normalized = normalizeYoutubeLayout(next);
      const mudou = chavesMudadas(draft, normalized);
      for (const chave of Object.keys(mudou)) mudadasRef.current.add(chave);
      setDraft(normalized);
      setDirty(true);
      if (syncQuery) {
        // D-741: no cache fica o layout GRAVADO (mesclado), não o resolvido.
        queryClient.setQueryData<Corte>(corteKey(corteId), (current) =>
          current
            ? ({
                ...current,
                layout_youtube: mesclarNoLayoutDoCorte(current.layout_youtube, mudou),
              } as Corte)
            : current,
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
      const inicio = limitar(round(seg), 0, duration);
      const fim = limitar(
        Math.max(region.fim, inicio + 1),
        inicio + 0.1,
        Math.max(inicio + 0.1, duration),
      );
      handleRegion(index, { ...region, inicio, fim });
    };

    const commitRegionFim = (index: number, region: YoutubeLayoutRegion, seg: number) => {
      const fim = limitar(round(seg), region.inicio + 0.1, Math.max(region.inicio + 0.1, duration));
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
      const valores = normalizeYoutubeLayout(draft) as unknown as Record<string, unknown>;
      const mudancas = Object.fromEntries(
        [...mudadasRef.current].map((chave) => [chave, valores[chave] ?? null]),
      );
      const body = { layout_youtube: mudancas } as Partial<Corte>;
      atualizar.mutate(body, {
        onSuccess: () => {
          mudadasRef.current = new Set();
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
      // D-423: o `modo_padrao` do escopo e PRESERVADO — definir posicionamento
      // nao decide com que modo novos cortes nascem. Antes, num escopo ainda
      // vazio o JSON era remontado a partir de DEFAULT_YOUTUBE_LAYOUT e o
      // `modo_padrao: 'full'` dele entrava junto, mesmo salvando um preset
      // Compartilhada.
      const novoJson = montarPadraoJson(json, {
        modo_padrao: escopo === 'projeto' ? tipoProjeto : tipoGlobal,
        fundo: extras?.fundo,
        placa: extras?.placa,
        ...(modo === 'full'
          ? { full: fullFromSynthetic(config) }
          : { compartilhada: config }),
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
    // D-421: `padraoUsando`/`padraoLabel` sairam junto com o PadraoAtualChip —
    // a EscopoLadder ja marca "em uso" na linha do escopo que alimenta o corte,
    // sem precisar de um segundo selo no cabecalho dizendo a mesma coisa.

    // Setar tipo do projeto: PATCH parcial que mexe SO no modo. D-423: a versao
    // anterior remontava o JSON sem a chave `full`, apagando o posicionamento
    // Full que o escopo Projeto ja tinha salvo a cada troca de modo.
    const definirTipoProjeto = (novoModo: YoutubeLayoutMode) => {
      definirPadraoProjetoMutation.mutate(
        montarPadraoJson(padraoProjetoJson, { modo_padrao: novoModo }),
      );
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

  return { abrirModalPosicionamento, activeMode, aplicarOverrideSegmento, aplicarOverrideSegmentoFull, atualizar, commitRegionFim, commitRegionInicio, confirm, definirPadraoGlobalMutation, definirPadraoProjetoMutation, detectandoSegmentos, detectarSegmentos, dirty, draft, escopoAtivoCorte, escopoDefinido, handleDefault, handleDefinirTipoProjeto, handleModalSave, handlePresetEscopo, handleRegion, modal, modoEscada, modoHerdando, presetNomeDoEscopo, presetsDisponiveis, presetsFullDisponiveis, regioesOpen, removeRegion, removerPadraoSegmento, save, segmentosDetectados, setConfirm, setModal, setModoEscada, setRegioesOpen, shared, tipoProjeto };
}
