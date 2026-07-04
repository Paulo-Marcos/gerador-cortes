import type { LucideIcon } from 'lucide-react';
import {
  Award,
  Film,
  Image as ImageIcon,
  Hourglass,
  Palette,
  Sparkles,
  Type,
  Youtube,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Corte, StatusExportCorte } from '@/types/models';

/** Cada estágio do pipeline (sequencial: bruto → grade → overlays → final → publicado). */
interface VideoStage {
  key: 'aguardando' | 'bruto' | 'grade' | 'overlays' | 'final' | 'publicado';
  Icon: LucideIcon;
  label: string;
  /** Cor de superfície (medalha cheia). */
  color: string;
  /** Cor de texto/contraste sobre a medalha (quase sempre branco). */
  inkOn: string;
  /** Cor para texto/legenda fora da medalha. */
  ink: string;
  /** Posição na cadeia 0..4 (publicado conta como 4 + bônus). */
  position: number;
}

const VIDEO_STAGES: Record<VideoStage['key'], VideoStage> = {
  aguardando: {
    key: 'aguardando',
    Icon: Hourglass,
    label: 'Aguarda',
    color: 'oklch(0.82 0.01 60)',
    inkOn: 'oklch(0.3 0.012 60)',
    ink: 'var(--wb-text-mute)',
    position: 0,
  },
  bruto: {
    key: 'bruto',
    Icon: Film,
    label: 'Bruto',
    color: 'oklch(0.74 0.16 75)',
    inkOn: '#ffffff',
    ink: 'oklch(0.55 0.16 75)',
    position: 1,
  },
  grade: {
    key: 'grade',
    Icon: Palette,
    label: 'Grade',
    color: 'oklch(0.6 0.22 305)',
    inkOn: '#ffffff',
    ink: 'oklch(0.5 0.22 305)',
    position: 2,
  },
  overlays: {
    key: 'overlays',
    Icon: Sparkles,
    label: 'Overlays',
    color: 'oklch(0.66 0.14 200)',
    inkOn: '#ffffff',
    ink: 'oklch(0.52 0.14 200)',
    position: 3,
  },
  final: {
    key: 'final',
    Icon: Award,
    label: 'Final',
    color: 'oklch(0.62 0.18 155)',
    inkOn: '#ffffff',
    ink: 'oklch(0.45 0.18 155)',
    position: 4,
  },
  publicado: {
    key: 'publicado',
    Icon: Youtube,
    label: 'Publicado',
    color: 'oklch(0.6 0.2 25)',
    inkOn: '#ffffff',
    ink: 'oklch(0.5 0.2 25)',
    position: 5,
  },
};

const VIDEO_DOT_TOTAL = 4;

interface MetaState {
  texto: boolean;
  imagem: boolean;
}

function deriveVideoStage(status: StatusExportCorte | undefined, publicado: boolean): VideoStage {
  if (publicado) return VIDEO_STAGES.publicado;
  if (status?.video_pronto) return VIDEO_STAGES.final;
  if (status?.overlays_prontos) return VIDEO_STAGES.overlays;
  if (status?.grade_pronta) return VIDEO_STAGES.grade;
  if (status?.raw_pronto) return VIDEO_STAGES.bruto;
  return VIDEO_STAGES.aguardando;
}

function deriveMeta(status: StatusExportCorte | undefined): MetaState {
  return {
    texto: Boolean(status?.metadados_completos),
    imagem: Boolean(status?.thumbnail_pronta),
  };
}

interface Props {
  numero: number;
  titulo?: string;
  corteStatus?: Corte['status'];
  status: StatusExportCorte | undefined;
  ativo: boolean;
  publicado?: boolean;
  isFire?: boolean;
  isLeitura?: boolean;
  /** Quando informado, o medalhão vira um botão que seleciona o corte.
   *  Sem ele, o card é apenas visual e o pai cuida do clique (ex.: EditorCutList). */
  onSelect?: () => void;
  /** Quando informado, os ícones de metadados (T / Imagem) viram botões que
   *  abrem os metadados do corte direto pela sidebar. */
  onOpenMetadata?: () => void;
}

const APROVADO_STATUS = new Set<Corte['status']>(['aprovado', 'editado', 'processado']);

export function CorteStatusCard({
  numero,
  titulo,
  corteStatus,
  status,
  ativo,
  publicado = false,
  isFire,
  isLeitura,
  onSelect,
  onOpenMetadata,
}: Props) {
  const stage = deriveVideoStage(status, publicado);
  const meta = deriveMeta(status);
  const aprovado = corteStatus ? APROVADO_STATUS.has(corteStatus) : false;
  const rejeitado = corteStatus === 'rejeitado';
  const metaFeitas = (meta.texto ? 1 : 0) + (meta.imagem ? 1 : 0);
  const videoPos = Math.min(stage.position, VIDEO_DOT_TOTAL);

  const tooltipBody = (
    <span className="flex max-w-xs flex-col gap-1 text-[11px] leading-snug">
      <strong className="text-[12px] font-medium">
        #{numero}
        {titulo ? ` · ${titulo}` : ''}
      </strong>
      <span className="font-medium text-text-300">Pipeline de vídeo</span>
      <span className="ml-1">
        {publicado ? '📺' : stageEmoji(stage.key)} Etapa atual: <strong>{stage.label}</strong>{' '}
        {!publicado && `(${videoPos}/${VIDEO_DOT_TOTAL})`}
      </span>
      <span className="ml-1 text-text-300">Próxima: {nextStageLabel(stage.key)}</span>
      <span className="mt-1 font-medium text-text-300">Metadados ({metaFeitas}/2)</span>
      <span className="ml-1">{meta.texto ? '✅' : '⬜'} Título + descrição</span>
      <span className="ml-1">{meta.imagem ? '✅' : '⬜'} Thumbnail</span>
      {(aprovado || rejeitado || isFire || isLeitura || publicado) && (
        <>
          <span className="mt-1 font-medium text-text-300">Sinais</span>
          {aprovado && <span className="ml-1">✅ Aprovado</span>}
          {rejeitado && <span className="ml-1">❌ Rejeitado</span>}
          {isFire && <span className="ml-1">🔥 Marcado como TOP</span>}
          {isLeitura && <span className="ml-1">📖 Corte de leitura</span>}
          {publicado && <span className="ml-1">📺 Publicado no YouTube</span>}
        </>
      )}
    </span>
  );

  const numeroEl = (
    <span
      className={cn(
        'font-code text-[11px] font-semibold tabular-nums leading-none',
        ativo ? 'text-[var(--wb-text)]' : 'text-[var(--wb-text-mute)]',
      )}
    >
      #{numero}
    </span>
  );
  const medalha = <StageMedalha stage={stage} videoPos={videoPos} publicado={publicado} />;

  return (
    <Tooltip label={tooltipBody} side="right">
      <span className="flex w-full flex-col items-center gap-1.5" data-active={ativo || undefined}>
        {onSelect ? (
          <button
            type="button"
            onClick={onSelect}
            aria-current={ativo ? 'page' : undefined}
            aria-label={`Corte ${numero}${titulo ? `: ${titulo}` : ''}`}
            className={cn(
              'flex w-full flex-col items-center gap-1.5 rounded-[var(--radius-sm)] text-[var(--wb-text-mute)] transition-colors hover:text-[var(--wb-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
              ativo && 'text-[var(--wb-text)]',
            )}
          >
            {numeroEl}
            {medalha}
          </button>
        ) : (
          <>
            {numeroEl}
            {medalha}
          </>
        )}

        <MetaMiniStrip meta={meta} onOpenMetadata={onOpenMetadata} />
      </span>
    </Tooltip>
  );
}

function StageMedalha({
  stage,
  videoPos,
  publicado,
}: {
  stage: VideoStage;
  videoPos: number;
  publicado: boolean;
}) {
  const { Icon, color, inkOn, ink, label } = stage;
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span
        className="relative flex h-10 w-10 items-center justify-center rounded-full shadow-sm ring-1 ring-black/5"
        style={{ background: color }}
      >
        <Icon size={20} strokeWidth={2.2} color={inkOn} aria-hidden />
      </span>
      <span className="text-[10px] font-medium leading-tight tracking-tight" style={{ color: ink }}>
        {label}
      </span>
      <ProgressDots
        total={VIDEO_DOT_TOTAL}
        filled={publicado ? VIDEO_DOT_TOTAL : videoPos}
        accent={color}
        bonus={publicado}
      />
    </span>
  );
}

function MetaMiniStrip({ meta, onOpenMetadata }: { meta: MetaState; onOpenMetadata?: () => void }) {
  // Sem callback: apenas indicadores de status (uso em listas read-only).
  if (!onOpenMetadata) {
    return (
      <span className="flex items-center gap-1.5" role="group" aria-label="Status dos metadados">
        <MetaSlot done={meta.texto} Icon={Type} doneColor="oklch(0.6 0.13 240)" />
        <MetaSlot done={meta.imagem} Icon={ImageIcon} doneColor="oklch(0.62 0.18 340)" />
      </span>
    );
  }

  // Com callback: cada ícone abre os metadados do corte direto pela sidebar.
  return (
    <span className="flex items-center gap-1.5" role="group" aria-label="Abrir metadados do corte">
      <MetaSlotButton
        done={meta.texto}
        Icon={Type}
        doneColor="oklch(0.6 0.13 240)"
        title="Abrir metadados — título e descrição"
        onClick={onOpenMetadata}
      />
      <MetaSlotButton
        done={meta.imagem}
        Icon={ImageIcon}
        doneColor="oklch(0.62 0.18 340)"
        title="Abrir metadados — thumbnail"
        onClick={onOpenMetadata}
      />
    </span>
  );
}

function MetaSlotButton({
  done,
  Icon,
  doneColor,
  title,
  onClick,
}: {
  done: boolean;
  Icon: LucideIcon;
  doneColor: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex h-[18px] w-[18px] items-center justify-center rounded-md transition-all hover:scale-110',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
        done ? 'shadow-sm ring-1 ring-black/5' : 'opacity-50 hover:opacity-100',
      )}
      style={done ? { background: doneColor } : { background: 'var(--wb-border)' }}
    >
      <Icon
        size={11}
        strokeWidth={2.4}
        color={done ? '#ffffff' : 'var(--wb-text-mute)'}
        aria-hidden
      />
    </button>
  );
}

function MetaSlot({
  done,
  Icon,
  doneColor,
}: {
  done: boolean;
  Icon: LucideIcon;
  doneColor: string;
}) {
  return (
    <span
      className={cn(
        'flex h-[18px] w-[18px] items-center justify-center rounded-md transition-colors',
        done ? 'shadow-sm ring-1 ring-black/5' : 'opacity-40',
      )}
      style={done ? { background: doneColor } : { background: 'var(--wb-border)' }}
    >
      <Icon
        size={11}
        strokeWidth={2.4}
        color={done ? '#ffffff' : 'var(--wb-text-mute)'}
        aria-hidden
      />
    </span>
  );
}

function ProgressDots({
  total,
  filled,
  accent,
  bonus,
}: {
  total: number;
  filled: number;
  accent: string;
  bonus?: boolean;
}) {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {Array.from({ length: total }).map((_, i) => {
        const isFilled = i < filled;
        return (
          <span
            key={i}
            className="h-[5px] w-[5px] rounded-full"
            style={{
              background: isFilled ? accent : 'var(--wb-border)',
              opacity: isFilled ? 1 : 0.55,
            }}
          />
        );
      })}
      {bonus && (
        <span className="ml-[1px] text-[9px] leading-none" style={{ color: accent }}>
          ★
        </span>
      )}
    </span>
  );
}

function stageEmoji(key: VideoStage['key']): string {
  switch (key) {
    case 'bruto':
      return '🎞️';
    case 'grade':
      return '🎨';
    case 'overlays':
      return '✨';
    case 'final':
      return '🏁';
    case 'publicado':
      return '📺';
    case 'aguardando':
    default:
      return '⏳';
  }
}

function nextStageLabel(key: VideoStage['key']): string {
  switch (key) {
    case 'aguardando':
      return 'Gerar bruto';
    case 'bruto':
      return 'Color grade';
    case 'grade':
      return 'Overlays Remotion';
    case 'overlays':
      return 'Encode final';
    case 'final':
      return 'Publicar no YouTube';
    case 'publicado':
    default:
      return '— pipeline completo';
  }
}
