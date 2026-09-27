import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Download, Edit3, FileText, Folder, Loader2, Palette, RefreshCw, Sparkles, VolumeX, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/toaster';
import { useAbrirPasta, useExportStatus, useProjeto } from '@/features/projeto-detalhe/useProjetoDetalhe';
import { useRenderFinal } from '@/features/editor/useRender';
import { useAtualizarCorte, useToggleFire, useCorte, useCortesProjeto } from '@/features/editor/useCortes';
import { useQuery } from '@tanstack/react-query';
import { finalVideoUrl, resolveThumbUrl } from '@/lib/api';
import { BancadaChrome } from '@/features/editor/BancadaChrome';
import { useShortcuts, type ShortcutBinding } from '@/shared/atalhos/shortcuts';
import { SceneTimeline } from '@/features/editor/fase2/SceneTimeline';
import { calcularDuracaoLiquida } from '@/features/editor/timeUtils';
import { MetadataModal } from '@/features/metadata/MetadataModal';
import { useVelocidadeNoVideo } from '@/hooks/useVelocidadeNoVideo';
import { useVelocidadePlayerPadrao } from '@/features/settings';
import { filtrosApi } from '@/features/post-production/api/filtros';
import {
  isCorteVideoPronto,
  parseCenasPayload,
  resolveCorteStagePath,
} from '@/features/post-production/postProductionNavigation';
import { settingsApi } from '@/features/settings/api';

// Atalhos Ctrl+J/K (F-041): mesmos limites usados na tela Bruta.
const SPEED_MIN = 0.25;
const SPEED_MAX = 4;
const SPEED_STEP = 0.25;

// ─────────────────────────────────────────────────────────────
// FinalReviewPage — replica `design_reference/src/v3_final.jsx`.
//
// READ-ONLY: nada e editavel aqui exceto Metadados (via secondaryAction)
// e Aprovar (primaryAction). Sem botoes de salvar/editar/zoom/+regiao
// nos componentes compartilhados (passa `readOnly={true}`).
//
// Layout: grid 1.5fr 320px / rows 1fr minmax(200px, auto).
//   Player (col 1, row 1) + SceneTimelineReadOnly (col 1, row 2) +
//   ChecklistCard + CapaCard empilhados a direita (col 2, row 1/span 2).
// ─────────────────────────────────────────────────────────────

// D-599: com a casca nova quem desenha a lista de cortes, a trilha e a barra
// de decisao e a CASCA — a tela apenas a alimenta (BancadaChrome).

export function FinalReviewPage() {
  const { id: projetoId = '' } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const corteId = searchParams.get('corte') ?? '';
  const { notify } = useToast();

  const projeto = useProjeto(projetoId);
  const cortesQuery = useCortesProjeto(projetoId);
  const corteQuery = useCorte(corteId);
  const exportStatusQ = useExportStatus(projetoId);
  const abrirPasta = useAbrirPasta();
  // A Revisão não dispara render; acompanha o que a Pós disparou, para reler o
  // status de exportação quando ele terminar (D-727).
  useRenderFinal(corteId, { aoMudarStatus: () => void exportStatusQ.refetch() });
  const atualizarCorte = useAtualizarCorte(corteId, projetoId);
  // D-746: o Fire da Revisão era um botão que não fazia nada.
  const alternarFire = useToggleFire(corteId, projetoId);
  const [metadataOpen, setMetadataOpen] = useState(false);
  // D-367: filtro/grade exibido no header do player. No fluxo normal de
  // "Renderizar" o filtro vai `null` e o backend resolve para o global
  // (AppSettings.filtro_global_padrao), entao o global reflete o que foi
  // aplicado. Ressalva: se o global mudar depois do render, mostra o novo.
  const settingsQ = useQuery({ queryKey: ['app-settings'], queryFn: settingsApi.obterSettings });
  const filtrosQ = useQuery({
    queryKey: ['export-filtros'],
    queryFn: () => filtrosApi.listarFiltros(),
  });

  const cortes = useMemo(() => cortesQuery.data ?? [], [cortesQuery.data]);
  const corte = corteQuery.data;
  const exportStatusAtual = exportStatusQ.data?.cortes.find(
    (status) => status.corte_id === corte?.id,
  );
  const videoPronto = corte ? isCorteVideoPronto(corte, exportStatusAtual) : false;
  const cenas = useMemo(
    () => parseCenasPayload(corte?.cenas_remotion).cenas,
    [corte?.cenas_remotion],
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  // D-365: playhead da timeline segue o <video> final (igual ao Pos, que
  // alimenta `currentTime` via onTimeUpdate). Sem isso a timeline ficava
  // congelada em 0 e parecia "nao funcionar".
  const [currentTime, setCurrentTime] = useState(0);

  // Selecao automatica do corte ao entrar em Final sem corteId: prioriza
  // quem ja tem video pronto, mas mantem o usuario em Final (sem cair em
  // Bruto). Navegacao livre entre fases — B-012/I-013.
  useEffect(() => {
    if (corteId || cortes.length === 0) return;
    const escolhido =
      cortes.find((item) =>
        isCorteVideoPronto(
          item,
          exportStatusQ.data?.cortes.find((s) => s.corte_id === item.id),
        ),
      ) ?? cortes[0];
    navigate(`/projetos/${projetoId}/final-review?corte=${escolhido.id}`, { replace: true });
  }, [corteId, cortes, exportStatusQ.data?.cortes, navigate, projetoId]);

  const shortcutBindings = useMemo<ShortcutBinding[]>(
    () => [
      {
        key: ' ',
        group: 'player',
        description: 'Play/pause',
        action: () => {
          const v = videoRef.current;
          if (!v) return;
          if (v.paused) void v.play();
          else v.pause();
        },
      },
      {
        key: 'j',
        mod: 'ctrl',
        group: 'player',
        description: 'Velocidade -0.25',
        action: () => {
          const v = videoRef.current;
          if (!v) return;
          v.playbackRate = Math.max(SPEED_MIN, v.playbackRate - SPEED_STEP);
        },
      },
      {
        key: 'k',
        mod: 'ctrl',
        group: 'player',
        description: 'Velocidade +0.25',
        action: () => {
          const v = videoRef.current;
          if (!v) return;
          v.playbackRate = Math.min(SPEED_MAX, v.playbackRate + SPEED_STEP);
        },
      },
    ],
    [],
  );
  useShortcuts(shortcutBindings, Boolean(corteId));

  if (!projetoId) return <Navigate to="/projetos" replace />;

  if (!corteId && !cortesQuery.isLoading && cortes.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center text-[var(--wb-text-mute)]">
        <h1 className="font-editorial text-3xl font-medium text-[var(--wb-text)]">
          Este projeto ainda não tem cortes
        </h1>
        <p className="max-w-md text-sm">Gere ou importe cortes antes de abrir a revisão final.</p>
      </div>
    );
  }

  if (corteQuery.isError || cortesQuery.isError || exportStatusQ.isError) {
    const failed = corteQuery.error ?? cortesQuery.error ?? exportStatusQ.error;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center text-[var(--wb-text-mute)]">
        <h1 className="font-editorial text-3xl font-medium text-error">
          Erro ao carregar revisão final
        </h1>
        <p className="max-w-md text-sm">
          {failed instanceof Error ? failed.message : 'Tente novamente em instantes.'}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            void corteQuery.refetch();
            void cortesQuery.refetch();
            void exportStatusQ.refetch();
          }}
        >
          <RefreshCw />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (corteQuery.isLoading || cortesQuery.isLoading || exportStatusQ.isLoading || !corte) {
    return (
      <div className="flex min-h-screen items-center justify-center text-[var(--wb-text-dim)]">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Carregando revisão final...
      </div>
    );
  }

  // Navegacao livre entre fases (B-012): permanece em Final mesmo sem
  // video renderizado. Player ganha placeholder mais abaixo.

  const aprovado = ['aprovado', 'processado'].includes(corte.status);

  // Status checklist (conectado aos campos reais do exportStatus + corte).
  const checklistItems: ChecklistItem[] = [
    {
      ok: Boolean(exportStatusAtual?.video_pronto || corte.is_pos_producao === 1),
      label: 'Render final concluído',
      icon: Check,
    },
    {
      ok: Boolean(exportStatusAtual?.overlays_prontos),
      label: 'Overlays aplicados',
      icon: Sparkles,
    },
    {
      ok: Boolean(exportStatusAtual?.grade_pronta),
      label: 'Color grade aplicado',
      icon: Palette,
    },
    {
      ok: Boolean(exportStatusAtual?.metadados_completos),
      label: 'Metadados preenchidos',
      icon: FileText,
    },
    {
      ok: Boolean(exportStatusAtual?.thumbnail_pronta),
      label: 'Capa renderizada',
      icon: Edit3,
    },
    {
      // Audio normalizado: nao temos campo dedicado — assumimos OK quando
      // o video final esta pronto (encoder normaliza para -14 LUFS).
      ok: Boolean(exportStatusAtual?.video_pronto),
      label: 'Áudio normalizado (-14 LUFS)',
      icon: VolumeX,
    },
  ];

  // Duracao para timeline: usa duracao real do clip se houver.
  const timelineDuration = Math.max(
    typeof corte.duracao_clip_seg === 'number' && corte.duracao_clip_seg > 0
      ? corte.duracao_clip_seg
      : calcularDuracaoLiquida(corte.inicio_seg, corte.fim_seg, corte.desvios),
    ...cenas.map((c) => c.fim),
    1,
  );

  function aprovarCorte() {
    if (!corte) return;
    if (aprovado) {
      notify('Corte já está aprovado.', { tone: 'info' });
      return;
    }
    atualizarCorte.mutate(
      { status: 'aprovado' },
      {
        onSuccess: () => notify('Corte aprovado.', { tone: 'success' }),
        onError: (e) =>
          notify(e instanceof Error ? e.message : 'Erro ao aprovar.', { tone: 'error' }),
      },
    );
  }

  const exportStatuses = exportStatusQ.data?.cortes ?? [];

  // D-367: resolve o id do filtro global para o nome amigavel (FiltroExport.nome).
  const filtroGlobalId = settingsQ.data?.filtro_global_padrao;
  const filtroNome =
    filtrosQ.data?.filtros.find((f) => f.id === filtroGlobalId)?.nome ?? filtroGlobalId ?? null;

  // Grid do conteúdo (player + checklist/capa + timeline read-only) —
  // compartilhado entre o shell legado e o Workbench.
  const conteudoFinal = (
    <div
      className="grid min-h-0 flex-1"
      style={{
        gridTemplateColumns: '1.5fr 320px',
        // DE-PARA-v3 §4: 220px fixos cortavam a trilha LAYOUT YT e o eixo na
        // borda inferior. `minmax(200px, auto)` dá à timeline pelo menos a
        // altura natural dela e deixa o player ceder o espaço.
        gridTemplateRows: '1fr minmax(200px, auto)',
        gap: 12,
        padding: 12,
      }}
    >
      <div style={{ gridColumn: '1', gridRow: '1', minHeight: 0 }}>
        {videoPronto ? (
          <FinalPlayerPanel
            src={finalVideoUrl(projetoId, corte.id)}
            projetoId={projetoId}
            corteId={corte.id}
            onAbrirPasta={() => abrirPasta.mutate(corte.id)}
            abrindoPasta={abrirPasta.isPending}
            videoRef={videoRef}
            onTimeUpdate={setCurrentTime}
            filtroLabel={filtroNome}
          />
        ) : (
          <div className="flex h-full items-center justify-center rounded-[var(--radius-md)] border border-dashed border-[var(--wb-border)] bg-[var(--wb-bg-inset)] p-8 text-center text-[var(--wb-text-mute)]">
            <div className="flex flex-col items-center gap-2">
              <p className="font-editorial text-lg text-[var(--wb-text)]">
                Render final ainda nao disponivel
              </p>
              <p className="text-sm">Gere o video na fase Pos para visualizar aqui.</p>
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          gridColumn: '2',
          gridRow: '1 / span 2',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          minHeight: 0,
          overflow: 'auto',
        }}
      >
        <ChecklistCard items={checklistItems} />
        <CapaCard
          titulo={corte.titulo_proposto ?? projeto.data?.titulo_live ?? 'Corte'}
          pronta={Boolean(exportStatusAtual?.thumbnail_pronta)}
          thumbUrl={resolveThumbUrl(projetoId, exportStatusAtual?.thumbnail_path)}
          onEditar={() => setMetadataOpen(true)}
        />
      </div>

      <div style={{ gridColumn: '1', gridRow: '2', minHeight: 0 }}>
        <SceneTimeline
          cenas={cenas}
          currentTime={currentTime}
          duration={timelineDuration}
          layoutYoutube={(corte as unknown as { layout_youtube?: never }).layout_youtube}
          onSeek={(seg) => {
            const v = videoRef.current;
            if (!v) return;
            v.currentTime = Math.max(0, seg);
          }}
          readOnly
          seekable
        />
      </div>
    </div>
  );

  const finalModals = (
    <>
      <MetadataModal
        open={metadataOpen}
        projetoId={projetoId}
        corte={corte}
        onClose={() => setMetadataOpen(false)}
      />
    </>
  );

  // ── Shell Workbench (Etapa 5 / DE-PARA §5): painel CORTES retrátil +
  // linha de ações no topo do conteúdo da aba; grid final compartilhado.

  const caminhoDoCorte = (item: (typeof cortes)[number]) =>
    resolveCorteStagePath({
      projetoId,
      corte: item,
      status: exportStatuses.find((status) => status.corte_id === item.id),
    });

  return (
    <>
      <BancadaChrome
        projetoId={projetoId}
        tituloLive={projeto.data?.titulo_live ?? 'Live'}
        cortes={cortes}
        corte={corte}
        exportStatus={exportStatusQ.data?.cortes ?? []}
        caminhoDoCorte={caminhoDoCorte}
        sub="confira o render, a capa e o título antes de liberar o lote"
        fire={corte.is_fire}
        sujo={false}
        salvando={atualizarCorte.isPending}
        brutoPronto
        brutoOcupado={false}
        // D-746: um verbo por botão. Salvar, Rejeitar e "Regerar bruto"
        // abriam os metadados; o Fire não fazia nada; o veredito agora é
        // reversível e o primário diz para onde leva.
        onToggleFire={() => alternarFire.mutate()}
        fireOcupado={alternarFire.isPending}
        onAprovar={aprovarCorte}
        barra={{
          veredito: {
            aprovado,
            ocupado: atualizarCorte.isPending,
            onAlternar: () =>
              aprovado ? atualizarCorte.mutate({ status: 'proposto' }) : aprovarCorte(),
          },
          terciario: {
            titulo: 'Metadados do corte — editar aqui',
            icone: 'tags',
            onClick: () => setMetadataOpen(true),
          },
          primario: {
            texto: 'Ir para publicar',
            icone: 'send',
            // Publicar é na live, com a conferência de canal, título e capa.
            onClick: () => navigate(`/projetos/${projetoId}`),
          },
        }}
      />

      <div
        className="flex h-full min-h-0 flex-col overflow-hidden"
      >

        {conteudoFinal}
      </div>

      {finalModals}
    </>
  );
}

// ─── FinalPlayerPanel — replica v3_final.jsx:12-39 ──
function FinalPlayerPanel({
  src,
  projetoId,
  corteId,
  onAbrirPasta,
  abrindoPasta,
  videoRef,
  onTimeUpdate,
  filtroLabel,
}: {
  src: string;
  projetoId: string;
  corteId: string;
  onAbrirPasta: () => void;
  abrindoPasta: boolean;
  videoRef: React.RefObject<HTMLVideoElement>;
  onTimeUpdate: (segundos: number) => void;
  filtroLabel: string | null;
}) {
  // D-450: abre na velocidade configurada em Ajustes. Aplicado aqui, junto ao
  // <video>, para reagir tambem a troca de `src` (outro corte) — Ctrl+J/K
  // continuam ajustando pontualmente por cima.
  const velocidadePadrao = useVelocidadePlayerPadrao();
  useVelocidadeNoVideo(videoRef, velocidadePadrao, src);

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Vídeo final
        </span>
        <span className="flex-none rounded-full bg-[var(--wb-info-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-info)]">
          1920×1080 · 29.97fps · h264
        </span>
        {/* D-367 + DE-PARA-v3 §4: o filtro de render é fonte única global
            (I-023 removeu o filtro por projeto/corte, e o render não persiste
            qual usou). O chip portanto identifica o AJUSTE GLOBAL ATUAL — não
            o perfil gravado neste corte, que pode divergir se o ajuste mudou
            depois do render. Rotular assim evita afirmar um dado que o
            back-end não guarda. */}
        {filtroLabel && (
          <Tooltip
            label="Filtro/grade global dos Ajustes — é o perfil usado nos renders enquanto estiver selecionado. O filtro não é gravado por corte."
            side="bottom"
          >
            <span className="inline-flex flex-none items-center gap-1 rounded-full bg-[var(--wb-accent-soft)] px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] text-[var(--wb-accent)]">
              <Palette size={11} aria-hidden />
              Global · {filtroLabel}
            </span>
          </Tooltip>
        )}
        <div className="flex-1" />
        <Tooltip label="Baixar MP4" side="bottom">
          <a
            href={src}
            download={`corte-${corteId}.mp4`}
            data-projeto={projetoId}
            className="inline-flex h-7 items-center gap-1 rounded-[var(--radius-xs)] px-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--wb-text-mute)] transition-colors hover:bg-[var(--wb-bg-card)] hover:text-[var(--wb-text)]"
          >
            <Download size={12} />
            MP4
          </a>
        </Tooltip>
        <Tooltip label="Abrir pasta do render" side="bottom">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAbrirPasta}
            disabled={abrindoPasta}
          >
            {abrindoPasta ? <Loader2 className="animate-spin" /> : <Folder />}
            Pasta
          </Button>
        </Tooltip>
      </header>
      {/* O vídeo ocupa o que sobra DA SEÇÃO. Qualquer teto de altura tem de
          vir do container externo e nunca envolver esta seção inteira: o
          cabeçalho (specs + filtro + MP4/Pasta) vive aqui dentro e, espremido
          junto, quebra em várias linhas. */}
      <div className="relative min-h-0 flex-1 bg-black">
        <video
          ref={videoRef}
          src={src}
          controls
          preload="metadata"
          onTimeUpdate={(e) => onTimeUpdate(e.currentTarget.currentTime)}
          className="h-full w-full bg-black object-contain"
        />
      </div>
    </section>
  );
}

// ─── ChecklistCard — replica v3_final.jsx:176-231 ──
interface ChecklistItem {
  ok: boolean;
  label: string;
  icon: LucideIcon;
}

function ChecklistCard({ items }: { items: ChecklistItem[] }) {
  const okCount = items.filter((i) => i.ok).length;
  const total = items.length;
  const tudoOk = okCount === total;
  return (
    <section className="flex-shrink-0 overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Checklist
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] ${
            tudoOk
              ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]'
              : 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn)]'
          }`}
        >
          {okCount}/{total}
        </span>
      </header>
      <div className="flex flex-col gap-1 p-3">
        {items.map((item, idx) => (
          <ChecklistRow key={idx} item={item} />
        ))}
      </div>
    </section>
  );
}

function ChecklistRow({ item }: { item: ChecklistItem }) {
  const Icon = item.icon;
  return (
    <div
      className={`flex items-center gap-2.5 rounded-[var(--radius-sm)] border p-2 ${
        item.ok
          ? 'border-transparent bg-transparent'
          : 'border-[var(--wb-warn)]/30 bg-[var(--wb-warn-soft)]'
      }`}
    >
      <span
        className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] ${
          item.ok
            ? 'border-[var(--wb-ok)] bg-[var(--wb-ok)] text-white'
            : 'border-[var(--wb-warn)] bg-[var(--wb-bg-card)] text-transparent'
        }`}
        aria-hidden
      >
        {item.ok && <Check size={12} strokeWidth={3} />}
      </span>
      <Icon
        size={13}
        className={item.ok ? 'text-[var(--wb-text-mute)]' : 'text-[var(--wb-warn)]'}
        aria-hidden
      />
      <span
        className={`text-[12.5px] ${
          item.ok ? 'font-medium text-[var(--wb-text)]' : 'font-semibold text-[var(--wb-ink)]'
        }`}
      >
        {item.label}
      </span>
    </div>
  );
}

// ─── CapaCard — replica v3_final.jsx:233-257 ──
function CapaCard({
  titulo,
  pronta,
  thumbUrl,
  onEditar,
}: {
  titulo: string;
  pronta: boolean;
  thumbUrl: string | null;
  onEditar: () => void;
}) {
  return (
    <section className="flex-shrink-0 overflow-hidden rounded-[var(--radius)] border border-[var(--wb-border-soft)] bg-[var(--wb-bg-card)]">
      <header className="flex items-center gap-2 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-inset)] px-3 py-2">
        <span className="font-code text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--wb-text-mute)]">
          Capa
        </span>
        <span
          className={`rounded-full px-2 py-0.5 font-code text-[10px] font-bold uppercase tracking-[0.04em] ${
            pronta
              ? 'bg-[var(--wb-ok-soft)] text-[var(--wb-ok)]'
              : 'bg-[var(--wb-warn-soft)] text-[var(--wb-warn)]'
          }`}
        >
          {pronta ? 'pronta' : 'pendente'}
        </span>
        <div className="flex-1" />
        <Tooltip label="Editar capa (abre Metadados)" side="bottom">
          <Button type="button" variant="ghost" size="sm" onClick={onEditar}>
            <Edit3 />
            Editar
          </Button>
        </Tooltip>
      </header>
      <div className="p-3">
        <div
          className="relative overflow-hidden rounded-[var(--radius-sm)] bg-gradient-to-br from-[oklch(0.45_0.05_60)] via-[oklch(0.3_0.04_60)] to-[oklch(0.15_0.03_60)]"
          style={{ aspectRatio: '16 / 9' }}
        >
          {/* D-366: mostra a capa renderizada quando existe; senao mantem o
              gradiente + titulo como placeholder. */}
          {thumbUrl ? (
            <img
              src={thumbUrl}
              alt={`Capa de ${titulo}`}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute bottom-3 left-3 max-w-[80%] text-white">
              <div className="font-editorial text-[16px] font-medium leading-tight">{titulo}</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// Type wrapper para evitar warning "ReactNode imported but unused".
export type _FinalChecklistItem = ReactNode;
