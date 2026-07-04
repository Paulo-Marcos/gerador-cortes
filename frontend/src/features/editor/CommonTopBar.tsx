import { useEffect, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Check, Flame, MoreHorizontal, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { buildReadingPatch, getReadingClickIntent, type ReadingPatch } from '@/lib/readingMetadata';
import type { Corte, Projeto } from '@/types/models';

export interface MoreMenuItem {
  icon: LucideIcon;
  label: string;
  kbd?: string;
  disabled?: boolean;
  onClick: () => void;
}

// ─────────────────────────────────────────────────────────────
// CommonTopBar — replica `design_reference/src/v2_shell.jsx:432-500`.
// Altura 56px, padding 0 20px, bg-panel, borderBottom soft.
//
// Esquerda: #N mono 12 faint + titulo serif 19/500 ink + statusToggles
// (compact icones interativos, decisao Paulo — design original tem so
// statusPills read-only) + dirty mono 10 warn.
//
// Centro: slot `extra` opcional (Pos usa marker + stepper). Default vazio
// — navegacao entre fases vive na UnifiedSidebar (B-012/I-013).
// Direita: divisor 1x22 + secondaryAction + primaryAction + moreH ghost.
// ─────────────────────────────────────────────────────────────

interface CommonTopBarProps {
  projeto?: Projeto;
  corte: Corte;
  dirty?: boolean;
  /** Slot opcional do centro. Pos usa marcador + stepper; demais fases
   *  deixam vazio. */
  extra?: ReactNode;
  /** Slot a esquerda inline (entre titulo e dirty). Default = 4 toggles
   *  Aprovar/Excluir/TOP/Leitura. Passe `null` para esconder. */
  statusToggles?: ReactNode;
  /** Pills READ-ONLY de status (Aprovado, TOP) inline com titulo. Usado
   *  no Final review onde nao queremos botoes interativos. */
  statusPills?: ReactNode;
  /** Acao secundaria a direita (ex.: "Gerar bruto" no Bruto). */
  secondaryAction?: ReactNode;
  /** Acao primaria a direita (ex.: "Salvar" no Bruto, "Renderizar" no Pos). */
  primaryAction?: ReactNode;
  /** Itens do dropdown moreH. Quando vazio, esconde o botao. */
  moreMenuItems?: MoreMenuItem[];
}

export function CommonTopBar({
  projeto,
  corte,
  dirty,
  extra,
  statusToggles,
  statusPills,
  secondaryAction,
  primaryAction,
  moreMenuItems,
}: CommonTopBarProps) {
  const titulo = corte.titulo_proposto || projeto?.titulo_live || 'Corte';

  return (
    <header
      className="flex flex-shrink-0 items-center gap-3 border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg-panel)] px-5"
      style={{ height: 56 }}
    >
      {/* Esquerda */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <Link
          to={`/projetos/${corte.projeto_id}`}
          className="font-code text-[12px] text-[var(--wb-text-dim)] hover:text-[var(--wb-text)]"
          aria-label="Voltar ao Studio"
        >
          #{corte.numero}
        </Link>
        <h1
          className="truncate font-editorial text-[19px] font-medium leading-tight tracking-[-0.01em] text-[var(--wb-ink)]"
          title={titulo}
        >
          {titulo}
        </h1>
        {statusToggles && <div className="flex items-center gap-1.5">{statusToggles}</div>}
        {statusPills && <div className="flex items-center gap-1.5">{statusPills}</div>}
        {dirty && (
          <span className="font-code text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--wb-warn)]">
            · nao salvo
          </span>
        )}
      </div>

      {/* Centro — sem PhaseTabs por default (decisao Paulo, B-012):
          navegacao entre fases vive na UnifiedSidebar. Slot `extra` ainda
          e usado em Pos pelo PosTopbarExtra (marker + stepper). */}
      <div className="flex shrink-0 items-center">{extra}</div>

      {/* Direita */}
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="h-[22px] w-px bg-[var(--wb-border)]" aria-hidden />
        {secondaryAction}
        {primaryAction}
        {moreMenuItems && moreMenuItems.length > 0 && <MoreMenu items={moreMenuItems} />}
      </div>
    </header>
  );
}

function MoreMenu({ items }: { items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <Tooltip label="Mais acoes" side="bottom">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Mais acoes"
          aria-expanded={open}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
            open
              ? 'bg-[var(--wb-bg-inset)] text-[var(--wb-text)]'
              : 'text-[var(--wb-text-mute)] hover:bg-[var(--wb-bg-inset)] hover:text-[var(--wb-text)]',
          )}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-10 z-30 flex w-[220px] flex-col gap-0.5 rounded-[var(--radius-sm)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] p-2 shadow-[var(--wb-shadow)]">
          {items.map((it, idx) => {
            const Icon = it.icon;
            return (
              <button
                key={`${it.label}-${idx}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!it.disabled) it.onClick();
                }}
                disabled={it.disabled}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] text-[var(--wb-text)] transition-colors hover:bg-[var(--wb-bg-inset)] disabled:opacity-50"
              >
                <Icon size={13} className="text-[var(--wb-text-mute)]" />
                <span className="flex-1">{it.label}</span>
                {it.kbd && (
                  <span className="font-code text-[10px] text-[var(--wb-text-dim)]">{it.kbd}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// StatusToggleCompact — icone-only, interativo (toggle).
// Decisao Paulo: o design (v2_shell.jsx:465-474) tem statusPills com
// label READ-ONLY; mas a app precisa manter a interatividade dos toggles
// (Aprovar/Excluir/TOP/Leitura). Solucao: icone-only inline com titulo,
// 24px de altura, estado ativo=bg cor + ring soft. Pill bem compacta.
// ─────────────────────────────────────────────────────────────

interface StatusToggleCompactProps {
  icon: LucideIcon;
  label: string;
  active: boolean;
  color: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}

export function StatusToggleCompact({
  icon: Icon,
  label,
  active,
  color,
  onClick,
  disabled,
  title,
}: StatusToggleCompactProps) {
  return (
    <Tooltip label={title ?? label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={active}
        style={{ '--status-color': color } as CSSProperties}
        className={cn(
          'flex h-6 w-6 items-center justify-center rounded-full border transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--wb-focus)]',
          'disabled:pointer-events-none disabled:opacity-50',
          active
            ? 'border-[var(--status-color)] bg-[var(--status-color)] text-white'
            : 'border-[var(--wb-border)] bg-[var(--wb-pill-bg)] text-[var(--wb-text-mute)] hover:border-[var(--status-color)] hover:text-[var(--status-color)]',
        )}
      >
        <Icon size={12} strokeWidth={active ? 2.6 : 1.9} aria-hidden />
      </button>
    </Tooltip>
  );
}

interface StatusToggleRowProps {
  corte: Corte;
  onAprovar: () => void;
  onRejeitar: () => void;
  onToggleFire: () => void;
  onToggleLeitura: () => void;
  /** Salva autor/parte da leitura. Quando ausente, o toggle Leitura degrada
   *  para liga/desliga simples (sem editor de autor). */
  onUpdateLeitura?: (patch: ReadingPatch) => void;
  pendingFlags: {
    aprovando?: boolean;
    rejeitando?: boolean;
    fire?: boolean;
    leitura?: boolean;
  };
}

export function StatusToggleRow({
  corte,
  onAprovar,
  onRejeitar,
  onToggleFire,
  onToggleLeitura,
  onUpdateLeitura,
  pendingFlags,
}: StatusToggleRowProps) {
  const aprovado = ['aprovado', 'editado', 'processado'].includes(corte.status);
  const rejeitado = corte.status === 'rejeitado';

  const [readingOpen, setReadingOpen] = useState(false);
  const readingClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (readingClickTimerRef.current) clearTimeout(readingClickTimerRef.current);
    },
    [],
  );

  // 1o clique liga a leitura e abre o editor de autor/parte (que entra no
  // prefixo do titulo do YouTube). Com a leitura ja ligada, um 2o clique
  // rapido reabre o editor; clique unico desliga. (restaurado em D-069)
  function handleReadingClick() {
    if (pendingFlags.leitura) return;
    if (!onUpdateLeitura) {
      onToggleLeitura();
      return;
    }

    const intent = getReadingClickIntent(
      Boolean(corte.is_leitura),
      Boolean(readingClickTimerRef.current),
    );

    if (intent === 'toggle-on-and-open') {
      onToggleLeitura();
      setReadingOpen(true);
      return;
    }

    if (intent === 'open-editor' && readingClickTimerRef.current) {
      clearTimeout(readingClickTimerRef.current);
      readingClickTimerRef.current = null;
      setReadingOpen(true);
      return;
    }

    readingClickTimerRef.current = setTimeout(() => {
      readingClickTimerRef.current = null;
      onToggleLeitura();
    }, 240);
  }

  return (
    <>
      <StatusToggleCompact
        icon={Check}
        label="Aprovar"
        active={aprovado}
        color="var(--wb-ok)"
        onClick={onAprovar}
        disabled={pendingFlags.aprovando}
        title="Aprovar (A)"
      />
      <StatusToggleCompact
        icon={X}
        label="Excluir"
        active={rejeitado}
        color="var(--wb-err)"
        onClick={onRejeitar}
        disabled={pendingFlags.rejeitando}
        title="Excluir (R)"
      />
      <StatusToggleCompact
        icon={Flame}
        label="TOP"
        active={Boolean(corte.is_fire)}
        color="var(--wb-fire)"
        onClick={onToggleFire}
        disabled={pendingFlags.fire}
        title="TOP (F)"
      />
      <StatusToggleCompact
        icon={BookOpen}
        label="Leitura"
        active={Boolean(corte.is_leitura)}
        color="var(--wb-leitura)"
        onClick={handleReadingClick}
        disabled={pendingFlags.leitura}
        title={onUpdateLeitura ? 'Leitura (L) · clique 2x p/ editar autor' : 'Leitura (L)'}
      />
      {onUpdateLeitura && (
        <ReadingModal
          open={readingOpen}
          author={corte.autor_leitura ?? ''}
          part={corte.parte_leitura ?? 1}
          disabled={pendingFlags.leitura}
          onClose={() => setReadingOpen(false)}
          onSave={(patch) => {
            onUpdateLeitura(patch);
            setReadingOpen(false);
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// ReadingModal — captura autor + parte que compoem o prefixo
// "Leitura - {autor} - PT.{parte} | " no titulo do YouTube. Restaurado
// em D-069 (perdido na migracao F-024 RealEditorHeader → CommonTopBar).
// ─────────────────────────────────────────────────────────────

function ReadingModal({
  open,
  author,
  part,
  disabled,
  onClose,
  onSave,
}: {
  open: boolean;
  author: string;
  part: number;
  disabled?: boolean;
  onClose: () => void;
  onSave: (patch: ReadingPatch) => void;
}) {
  const [draftAuthor, setDraftAuthor] = useState(author);
  const [draftPart, setDraftPart] = useState(String(part || 1));

  useEffect(() => {
    setDraftAuthor(author);
    setDraftPart(String(part || 1));
  }, [author, part]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Leitura"
      description="Preencha os dados que entram no prefixo do titulo."
      size="sm"
      footer={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="reading-form" size="sm" disabled={disabled}>
            OK
          </Button>
        </>
      }
    >
      <form
        id="reading-form"
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(buildReadingPatch(draftAuthor, draftPart));
        }}
      >
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--wb-text-dim)]">
          Autor
          <input
            value={draftAuthor}
            onChange={(event) => setDraftAuthor(event.target.value)}
            disabled={disabled}
            placeholder="Autor"
            autoFocus
            className="h-9 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-sm font-medium text-[var(--wb-text)] outline-none focus:border-info"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-[var(--wb-text-dim)]">
          Parte
          <input
            type="number"
            min={1}
            value={draftPart}
            onChange={(event) => setDraftPart(event.target.value)}
            disabled={disabled}
            className="h-9 rounded-[var(--radius-xs)] border border-[var(--wb-border)] bg-[var(--wb-bg-card)] px-3 text-sm font-medium text-[var(--wb-text)] outline-none focus:border-info"
          />
        </label>
      </form>
    </Modal>
  );
}
