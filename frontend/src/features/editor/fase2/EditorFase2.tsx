import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { RefObject } from 'react';
import { useShortcuts, type ShortcutBinding } from '../shortcuts';
import { shortcutFromRegistry } from '../shortcutsRegistry';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Film,
  Monitor,
  Quote,
  SlidersHorizontal,
  Sparkles,
  Type,
} from 'lucide-react';
import type { CenaRemotion, Corte, FontePreset, Projeto } from '@/types/models';
import type { PlayerHandle } from '../fase1/PlayerPanel';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { calcularDuracaoLiquida } from '../timeUtils';
import { useAtualizarCorte, corteKey } from '@/hooks/useEditor';
import { useToast } from '@/components/ui/toaster';
import { CenaPlayerPanel } from './CenaPlayerPanel';
import { ComTempoDoPlayer, useTempoDoPlayer, type RelogioDoPlayer } from './relogioDoPlayer';
import { CenasPanel, type CenasPanelHandle } from './CenasPanel';
import { SceneTimeline } from './SceneTimeline';
import { AlertaCenasForaDoCorte } from './AlertaCenasForaDoCorte';
import { cenasForaDoCorte } from './sceneValidation';
import { FiltroTestePanel } from '@/features/post-production/FiltroTestePanel';
import { YoutubeLayoutPanel, type YoutubeLayoutPanelHandle } from './YoutubeLayoutPanel';
import { SegmentoDetectadoPopover } from './SegmentoDetectadoPopover';
import { PanelShell } from '@/components/workbench/PanelShell';
import { useSegmentosDetectados } from './useSegmentosDetectados';
import {
  mesclarNoLayoutDoCorte,
  normalizeYoutubeLayout,
  patchParaRestaurar,
  resolveLayoutChain,
  type YoutubeLayoutMode,
  type YoutubeLayoutRegion,
} from './youtubeLayout';

type AbaDireita = 'cenas' | 'layout' | 'filtros';

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

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

interface Props {
  videoSrc: string;
  modoLabel: string;
  corte: Corte;
  cenas: CenaRemotion[];
  formato?: string;
  paleta?: Record<string, string>;
  playerRef: RefObject<PlayerHandle>;
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

export function EditorFase2({
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
}: Props) {
  const queryClient = useQueryClient();
  // Cenas usam tempo relativo ao bruto. Como o player toca o bruto direto
  // (não offsets), o offset é 0.
  const offsetSeg = 0;

  const [abaDireita, setAbaDireita] = useState<AbaDireita>('cenas');
  // Selecao manual (Ctrl+click ou Ctrl+L). Cena e regiao sao mutuamente
  // exclusivas: selecionar uma desfaz a outra. So as regioes funcionam
  // como "alvo" dos atalhos [ ] (ajuste de bordas), mas ambas funcionam
  // com Ctrl+, e Ctrl+. (seek para inicio/fim). I-029 v2.
  const [selectedRegionIdx, setSelectedRegionIdx] = useState<number | null>(null);
  const [selectedCenaIdx, setSelectedCenaIdx] = useState<number | null>(null);
  // F-054: estado do popover de decisao. anchorLeft/Top em coords do container.
  const [popoverSegmento, setPopoverSegmento] = useState<{
    indice: number;
    anchorLeft: number;
    anchorTop: number;
  } | null>(null);
  const timelineWrapperRef = useRef<HTMLDivElement | null>(null);
  const {
    segmentos: segmentosDetectados,
    decidir: decidirSegmento,
    decidindo: decidindoSegmento,
    detectar: reprocessarSegmentos,
    detectando: detectandoSegmentos,
  } = useSegmentosDetectados(corte.id, corte.projeto_id);
  // Toggle do preview Remotion (Ctrl+Alt+R). Quando false, o player mostra
  // o video bruto sem overlays de cenas/layout YT, util para identificar o
  // tempo exato do clipe ao ajustar regioes pela timeline (I-029).
  const [remotionEnabled, setRemotionEnabled] = useState(true);
  // Refs para Ctrl+S por aba ativa (B-017 / F-034). So a aba montada
  // tem ref atribuida; aba inativa fica nula e a tecla vira no-op.
  const cenasPanelRef = useRef<CenasPanelHandle>(null);
  const layoutPanelRef = useRef<YoutubeLayoutPanelHandle>(null);
  // Bruto pronto = clip raw existe em disco. Sem isso, ffmpeg não tem o que
  // filtrar e o backend rejeita a chamada de processar-multiversion.
  const brutoPronto = Boolean(corte.arquivo_clip_path);

  // Mesma queryKey usada pelo RendererConfigControls — alteração no dropdown
  // refresca esta query e o player re-renderiza com a versão/sombra atualizadas.
  const { data: projeto } = useQuery<Projeto>({
    queryKey: ['projeto', corte.projeto_id],
    queryFn: () => api.obterProjeto(corte.projeto_id),
    staleTime: 30_000,
  });
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: api.obterSettings,
    staleTime: 30_000,
  });
  // I-023: a aba "Filtros" da Pós-Produção é só para testes; cuida sozinha
  // de sugerir o filtro_global_padrao como seleção inicial.
  const fontePresetSelecionado = projeto?.fonte_preset ?? 'atual';
  // F-048: cascade lazy global -> projeto -> corte. O resultado e o layout
  // efetivo visto pelo preview e usado pelo backend ao renderizar.
  const layoutYoutube = useMemo(
    () =>
      resolveLayoutChain(
        (corte as unknown as { layout_youtube?: unknown }).layout_youtube,
        projeto?.layout_youtube_padrao,
        appSettings?.youtube_layout_padrao_global,
      ),
    [corte, projeto?.layout_youtube_padrao, appSettings?.youtube_layout_padrao_global],
  );

  const fontePresetMutation = useMutation({
    mutationFn: (fonte_preset: FontePreset) =>
      api.atualizarRenderConfig(corte.projeto_id, { fonte_preset }),
    onMutate: async (fonte_preset) => {
      await queryClient.cancelQueries({ queryKey: ['projeto', corte.projeto_id] });
      const previous = queryClient.getQueryData<Projeto>(['projeto', corte.projeto_id]);
      queryClient.setQueryData<Projeto>(['projeto', corte.projeto_id], (current) =>
        current ? { ...current, fonte_preset } : current,
      );
      return { previous };
    },
    onError: (_error, _fontePreset, context) => {
      if (context?.previous)
        queryClient.setQueryData(['projeto', corte.projeto_id], context.previous);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(['projeto', corte.projeto_id], updated);
      void queryClient.invalidateQueries({ queryKey: ['projeto', corte.projeto_id] });
    },
  });

  const cenasOrdenadas = useMemo(() => [...cenas].sort((a, b) => a.inicio - b.inicio), [cenas]);
  // D-657: o seletor devolve o ÍNDICE — o editor só re-renderiza quando a
  // cena sob o playhead troca, não a cada um dos 30 frames por segundo.
  const cenaAtivaIdx = useTempoDoPlayer(relogio, (t) =>
    cenasOrdenadas.findIndex((c) => t + offsetSeg >= c.inicio && t + offsetSeg <= c.fim),
  );
  // IMPORTANTE: prioriza a duração REAL do arquivo (medida via ffprobe pelo
  // backend após cada geração).  Sem isso, usamos a estimativa LÍQUIDA
  // (`fim - inicio` − soma dos desvios), que pode diferir do arquivo real
  // em centenas de ms (drift acumulado no ffmpeg).  O usuário via "11:48"
  // quando o arquivo tinha 11:49.343 — exatamente esse drift.
  //
  // A duracao do CORTE e a regua: e contra ela que as cenas sao julgadas. A
  // `timelineDuration` deriva dela com um `max` que ESTICA para caber cena
  // invalida — por isso ela nao serve de regua para si mesma.
  const duracaoDoCorte = useMemo(() => {
    const real =
      typeof corte.duracao_clip_seg === 'number' && corte.duracao_clip_seg > 0
        ? corte.duracao_clip_seg
        : null;
    return real ?? calcularDuracaoLiquida(corte.inicio_seg, corte.fim_seg, corte.desvios);
  }, [corte.inicio_seg, corte.fim_seg, corte.desvios, corte.duracao_clip_seg]);

  // A timeline e o VIDEO, nunca a maior cena. O `Math.max(..., maiorFimDeCena)`
  // que vivia aqui esticava a regua para caber cena com tempo fora do corte, e
  // a timeline passava a CONCORDAR com o erro: 38:14 exibidos sobre um video de
  // 9:55. Cena alem do fim simplesmente nao aparece — porque no video ela nao
  // existe mesmo; quem a denuncia e o AlertaCenasForaDoCorte.
  const timelineDuration = useMemo(() => Math.max(duracaoDoCorte, 1), [duracaoDoCorte]);

  const cenasFora = useMemo(() => cenasForaDoCorte(cenas, duracaoDoCorte), [cenas, duracaoDoCorte]);

  // I-029 v2: a selecao de cena pela timeline mudou de semantica — o click
  // normal so seek na posicao clicada (nao na inicio da cena); Ctrl+click
  // seleciona. Por isso o antigo handleSelectCena (que seekava para
  // cena.inicio) foi removido — o novo handleSelecionarCena cuida do
  // estado de selecao logo abaixo, depois de handleResizeRegion.

  // +Comp / +Full na timeline -> adiciona regiao no corte.
  // Replica a logica de YoutubeLayoutPanel.addRegion mas sem o draft
  // local (PATCH direto). Hand-off F-024 fase 6: botoes migraram para
  // a timeline.
  const atualizarCorte = useAtualizarCorte(corte.id, corte.projeto_id);
  const { notify } = useToast();

  const handleAddRegion = useCallback(
    (modo: YoutubeLayoutMode) => {
      const inicio = Math.max(0, Math.min(timelineDuration, relogio.agora() + offsetSeg));
      const fim = Math.max(inicio + 1, Math.min(timelineDuration, inicio + 30));
      const novoLayout = normalizeYoutubeLayout({
        ...layoutYoutube,
        regioes: [...layoutYoutube.regioes, { inicio: round1(inicio), fim: round1(fim), modo }],
      });
      // D-741: só as regiões — mandar o layout resolvido gravaria os padrões no
      // corte, e ele pararia de herdar do projeto e do global (RN-10).
      atualizarCorte.mutate({ layout_youtube: { regioes: novoLayout.regioes } } as Partial<Corte>, {
        onSuccess: (updated) => {
          // Garante que YoutubeLayoutPanel receba o novo layout
          // (ele e renderizado condicionalmente — pode estar montado).
          queryClient.setQueryData<Corte>(corteKey(corte.id), (current) =>
            current
              ? ({ ...current, layout_youtube: (updated as Corte).layout_youtube } as Corte)
              : current,
          );
          notify(`Região ${modo} adicionada à timeline.`, { tone: 'success' });
        },
        onError: (error) => {
          notify(error instanceof Error ? error.message : 'Erro ao adicionar região.', {
            tone: 'error',
          });
        },
      });
    },
    [
      atualizarCorte,
      corte.id,
      relogio,
      layoutYoutube,
      notify,
      offsetSeg,
      queryClient,
      timelineDuration,
    ],
  );

  const handleResizeRegion = useCallback(
    (index: number, region: YoutubeLayoutRegion) => {
      const novoLayout = normalizeYoutubeLayout({
        ...layoutYoutube,
        regioes: layoutYoutube.regioes.map((item, idx) => (idx === index ? region : item)),
      });
      const previous = queryClient.getQueryData<Corte>(corteKey(corte.id));

      // D-741: no cache fica o layout GRAVADO (mesclado), não o resolvido.
      queryClient.setQueryData<Corte>(corteKey(corte.id), (current) =>
        current
          ? ({
              ...current,
              layout_youtube: mesclarNoLayoutDoCorte(current.layout_youtube, {
                regioes: novoLayout.regioes,
              }),
            } as Corte)
          : current,
      );

      atualizarCorte.mutate({ layout_youtube: { regioes: novoLayout.regioes } } as Partial<Corte>, {
        onSuccess: (updated) => {
          queryClient.setQueryData<Corte>(corteKey(corte.id), (current) =>
            current
              ? ({ ...current, layout_youtube: (updated as Corte).layout_youtube } as Corte)
              : current,
          );
        },
        onError: (error) => {
          if (previous) queryClient.setQueryData(corteKey(corte.id), previous);
          void queryClient.invalidateQueries({ queryKey: corteKey(corte.id) });
          notify(error instanceof Error ? error.message : 'Erro ao ajustar regiao.', {
            tone: 'error',
          });
        },
      });
    },
    [atualizarCorte, corte.id, layoutYoutube, notify, queryClient],
  );

  // I-029 v2: invalidar selecoes quando o numero de elementos muda. Evita
  // um indice antigo apontar para outro elemento depois que regioes/cenas
  // sao adicionadas ou removidas por outra UI.
  useEffect(() => {
    if (selectedRegionIdx == null) return;
    if (selectedRegionIdx < 0 || selectedRegionIdx >= layoutYoutube.regioes.length) {
      setSelectedRegionIdx(null);
    }
  }, [layoutYoutube.regioes.length, selectedRegionIdx]);
  useEffect(() => {
    if (selectedCenaIdx == null) return;
    if (selectedCenaIdx < 0 || selectedCenaIdx >= cenas.length) {
      setSelectedCenaIdx(null);
    }
  }, [cenas.length, selectedCenaIdx]);

  // I-029 v2: undo da timeline. Cada vez que `corte.layout_youtube` muda,
  // empilha o snapshot anterior. Ctrl+Z desempilha e re-aplica.
  // Limite de 50 snapshots evita memoria estourar em sessoes longas.
  // Cobre todas as origens de mudanca de layout (timeline +Comp/+Full,
  // drag, atalhos [ ], remocao pelo painel, fundo/placa/posicionamento)
  // porque todas passam por queryClient.setQueryData no `corte.layout_youtube`.
  const UNDO_LIMIT = 50;
  const undoStackRef = useRef<string[]>([]);
  const isUndoingRef = useRef(false);
  const previousLayoutRef = useRef<string | null>(null);
  useEffect(() => {
    const serialized = JSON.stringify(
      (corte as unknown as { layout_youtube?: unknown }).layout_youtube ?? null,
    );
    if (isUndoingRef.current) {
      isUndoingRef.current = false;
      previousLayoutRef.current = serialized;
      return;
    }
    if (previousLayoutRef.current === null) {
      previousLayoutRef.current = serialized;
      return;
    }
    if (previousLayoutRef.current !== serialized) {
      undoStackRef.current.push(previousLayoutRef.current);
      if (undoStackRef.current.length > UNDO_LIMIT) {
        undoStackRef.current.shift();
      }
      previousLayoutRef.current = serialized;
    }
  }, [corte]);

  // Ctrl+click numa cena selecciona-a e abre a aba Cenas. Como cena e
  // regiao sao mutuamente exclusivas, deselecciona a regiao tambem.
  const handleSelecionarCena = useCallback((idx: number | null) => {
    setSelectedCenaIdx(idx);
    if (idx != null) {
      setSelectedRegionIdx(null);
      setAbaDireita('cenas');
    }
  }, []);

  const handleSelecionarRegiao = useCallback((idx: number | null) => {
    setSelectedRegionIdx(idx);
    if (idx != null) {
      setSelectedCenaIdx(null);
      setAbaDireita('layout');
    }
  }, []);

  // [ / ] ajustam inicio/fim da regiao selecionada para o tempo atual.
  // Replicam o clamp do drag-resize (MIN_REGION_SECONDS = 0.1s) para nao
  // gerar regioes invalidas com fim <= inicio. Sem selecao, no-op.
  const handleAjustarRegiaoSelecionada = useCallback(
    (edge: 'inicio' | 'fim') => {
      if (selectedRegionIdx == null) return;
      const region = layoutYoutube.regioes[selectedRegionIdx];
      if (!region) return;
      const safeDuration = Math.max(0.1, timelineDuration);
      const tempo = Math.max(0, Math.min(safeDuration, round1(relogio.agora() + offsetSeg)));
      let next: YoutubeLayoutRegion;
      if (edge === 'inicio') {
        const maxInicio = Math.max(0, region.fim - 0.1);
        next = { ...region, inicio: Math.min(tempo, maxInicio) };
      } else {
        const minFim = region.inicio + 0.1;
        next = { ...region, fim: Math.max(tempo, minFim) };
      }
      handleResizeRegion(selectedRegionIdx, next);
    },
    [
      relogio,
      handleResizeRegion,
      layoutYoutube.regioes,
      offsetSeg,
      selectedRegionIdx,
      timelineDuration,
    ],
  );

  // Ctrl+L: trava (= seleciona) ou destrava o segmento. Se ja ha selecao,
  // destrava. Se nao ha nada selecionado, trava o primeiro elemento sob o
  // playhead (prioridade: regiao > cena). Permite usar [ ] sem ter que
  // clicar no segmento.
  const handleToggleSelectionLock = useCallback(() => {
    if (selectedRegionIdx != null || selectedCenaIdx != null) {
      setSelectedRegionIdx(null);
      setSelectedCenaIdx(null);
      return;
    }
    const t = relogio.agora() + offsetSeg;
    const regionAtPlayhead = layoutYoutube.regioes.findIndex((r) => t >= r.inicio && t <= r.fim);
    if (regionAtPlayhead >= 0) {
      handleSelecionarRegiao(regionAtPlayhead);
      return;
    }
    const ordenadas = [...cenas].sort((a, b) => a.inicio - b.inicio);
    const cenaAtPlayhead = ordenadas.findIndex((c) => t >= c.inicio && t <= c.fim);
    if (cenaAtPlayhead >= 0) {
      handleSelecionarCena(cenaAtPlayhead);
    }
  }, [
    cenas,
    relogio,
    handleSelecionarCena,
    handleSelecionarRegiao,
    layoutYoutube.regioes,
    offsetSeg,
    selectedCenaIdx,
    selectedRegionIdx,
  ]);

  // Ctrl+, e Ctrl+. seek para inicio/fim do segmento ou cena selecionado.
  const handleSeekSelectionEdge = useCallback(
    (edge: 'inicio' | 'fim') => {
      if (selectedRegionIdx != null) {
        const region = layoutYoutube.regioes[selectedRegionIdx];
        if (!region) return;
        onSeek(edge === 'inicio' ? region.inicio : region.fim);
        return;
      }
      if (selectedCenaIdx != null) {
        const ordenadas = [...cenas].sort((a, b) => a.inicio - b.inicio);
        const cena = ordenadas[selectedCenaIdx];
        if (!cena) return;
        onSeek(edge === 'inicio' ? cena.inicio : cena.fim);
      }
    },
    [cenas, layoutYoutube.regioes, onSeek, selectedCenaIdx, selectedRegionIdx],
  );

  const handleToggleRemotion = useCallback(() => {
    setRemotionEnabled((prev) => !prev);
  }, []);

  // I-029 v2: Ctrl+Z aplica o ultimo snapshot. Mesmo fluxo do drag-resize:
  // setQueryData (otimistico) + mutate (persiste no backend). isUndoingRef
  // evita que o useEffect acima re-empilhe o estado atual.
  const handleUndoTimeline = useCallback(() => {
    const stack = undoStackRef.current;
    if (stack.length === 0) {
      notify('Nada para desfazer na timeline.', { tone: 'info' });
      return;
    }
    const prev = stack.pop();
    if (prev == null) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(prev);
    } catch {
      notify('Snapshot invalido — pulando.', { tone: 'error' });
      return;
    }
    // I-029 v2: o painel mantem um set de regioes que o usuario deletou
    // localmente para nao deixa-las voltarem via sync. Como o undo PRECISA
    // reintroduzir regioes do snapshot, limpamos esse set antes de aplicar.
    layoutPanelRef.current?.clearDeletedRegions();
    isUndoingRef.current = true;
    // D-741: o backend mescla; para voltar ao retrato, a chave que surgiu
    // depois dele vai como null (volta a herdar).
    const gravadoAgora = queryClient.getQueryData<Corte>(corteKey(corte.id))?.layout_youtube;
    queryClient.setQueryData<Corte>(corteKey(corte.id), (current) =>
      current ? ({ ...current, layout_youtube: parsed } as Corte) : current,
    );
    atualizarCorte.mutate({ layout_youtube: patchParaRestaurar(gravadoAgora, parsed) } as Partial<Corte>, {
      onSuccess: (updated) => {
        queryClient.setQueryData<Corte>(corteKey(corte.id), (cur) =>
          cur ? ({ ...cur, layout_youtube: (updated as Corte).layout_youtube } as Corte) : cur,
        );
        notify('Desfeito.', { tone: 'success' });
      },
      onError: (error) => {
        isUndoingRef.current = false;
        notify(error instanceof Error ? error.message : 'Erro ao desfazer.', { tone: 'error' });
      },
    });
  }, [atualizarCorte, corte.id, notify, queryClient]);

  // Atalhos puxados do registro central (./shortcutsRegistry.ts) — evita
  // colisao com a tela Bruta e documenta cada combinacao em um unico lugar.
  const editorBindings = useMemo<ShortcutBinding[]>(
    () => [
      shortcutFromRegistry('pos.save', () => {
        if (workbench) {
          cenasPanelRef.current?.saveIfDirty();
          layoutPanelRef.current?.saveIfDirty();
          return;
        }
        if (abaDireita === 'cenas') cenasPanelRef.current?.saveIfDirty();
        else if (abaDireita === 'layout') layoutPanelRef.current?.saveIfDirty();
      }),
      shortcutFromRegistry('pos.adjustSelectionStart', () =>
        handleAjustarRegiaoSelecionada('inicio'),
      ),
      shortcutFromRegistry('pos.adjustSelectionEnd', () => handleAjustarRegiaoSelecionada('fim')),
      shortcutFromRegistry('pos.toggleSelectionLock', handleToggleSelectionLock),
      shortcutFromRegistry('pos.seekToSelectionStart', () => handleSeekSelectionEdge('inicio')),
      shortcutFromRegistry('pos.seekToSelectionEnd', () => handleSeekSelectionEdge('fim')),
      shortcutFromRegistry('pos.undoTimeline', handleUndoTimeline),
      shortcutFromRegistry('pos.toggleRemotion', handleToggleRemotion),
    ],
    [
      abaDireita,
      workbench,
      handleAjustarRegiaoSelecionada,
      handleSeekSelectionEdge,
      handleToggleRemotion,
      handleToggleSelectionLock,
      handleUndoTimeline,
    ],
  );
  useShortcuts(editorBindings);

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
              icon={<Film size={12} aria-hidden />}
              label="Cenas Remotion"
            />
            <AbaButton
              ativo={abaDireita === 'layout'}
              onClick={() => setAbaDireita('layout')}
              icon={<Monitor size={12} aria-hidden />}
              label="Layout"
            />
            <AbaButton
              ativo={abaDireita === 'filtros'}
              onClick={() => setAbaDireita('filtros')}
              icon={<SlidersHorizontal size={12} aria-hidden />}
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

interface FontePresetPanelProps {
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
          <ChevronDown size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
        ) : (
          <ChevronRight size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
        )}
        <Type size={14} className="text-[var(--wb-text-mute)]" aria-hidden />
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
                    ? 'border-[var(--wb-accent)] bg-[var(--wb-accent-soft)] text-[var(--wb-text)]'
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
interface AberturaEditorialProps {
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
          <Sparkles size={13} className="mt-0.5 shrink-0 text-[var(--wb-accent)]" aria-hidden />
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
          <Quote size={13} className="mt-0.5 shrink-0 text-[var(--wb-text-mute)]" aria-hidden />
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

interface AbaButtonProps {
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
