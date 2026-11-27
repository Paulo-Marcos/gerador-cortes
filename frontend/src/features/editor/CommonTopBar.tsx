import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { buildReadingPatch, type ReadingPatch } from '@/lib/readingMetadata';
import type { Corte, Projeto } from '@/types/models';
import { Icon, type IconName } from '@/upgrade/Icon';

export interface MoreMenuItem {
  icon: IconName;
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
      className="flex h-14 flex-shrink-0 items-center gap-3 border-b border-fio bg-painel-solido px-5"
    >
      {/* Esquerda */}
      <div className="flex min-w-0 flex-1 items-baseline gap-2.5">
        <Link
          to={`/projetos/${corte.projeto_id}`}
          className="font-mono text-pequeno text-fg-3 hover:text-fg"
          aria-label="Voltar ao Studio"
        >
          #{corte.numero}
        </Link>
        <h1
          className="truncate text-titulo text-fg"
          title={titulo}
        >
          {titulo}
        </h1>
        {statusToggles && <div className="flex items-center gap-1.5">{statusToggles}</div>}
        {statusPills && <div className="flex items-center gap-1.5">{statusPills}</div>}
        {dirty && (
          <span className="font-mono text-micro font-bold tracking-[0.08em] text-aviso">
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
        <div className="h-[22px] w-px bg-fio-2" aria-hidden />
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
            'flex h-8 w-8 items-center justify-center rounded-campo transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco',
            open
              ? 'bg-poco text-fg'
              : 'text-fg-2 hover:bg-vidro-2 hover:text-fg',
          )}
        >
          <Icon name="more-horizontal" size={16} />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-10 z-30 flex w-[220px] flex-col gap-0.5 rounded-campo border border-fio-2 bg-painel-solido p-2 shadow-pop-luz">
          {items.map((it, idx) => {
            return (
              <button
                key={`${it.label}-${idx}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  if (!it.disabled) it.onClick();
                }}
                disabled={it.disabled}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-pequeno text-fg transition-colors hover:bg-vidro-2 disabled:opacity-50"
              >
                <Icon name={it.icon} className="text-fg-2" />
                <span className="flex-1">{it.label}</span>
                {it.kbd && (
                  <span className="font-mono text-micro text-fg-3">{it.kbd}</span>
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
// ReadingModal — captura autor + parte que compoem o prefixo
// "Leitura - {autor} - PT.{parte} | " no titulo do YouTube. Restaurado
// em D-069 (perdido na migracao F-024 RealEditorHeader → CommonTopBar).
// ─────────────────────────────────────────────────────────────

export function ReadingModal({
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
          <Button type="button" variant="fantasma" size="pq" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="secundario" type="submit" form="reading-form" size="pq" disabled={disabled}>
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
        <label className="grid gap-1.5 text-xs font-semibold text-fg-3">
          Autor
          <input name="autor_leitura" type="text"
            value={draftAuthor}
            onChange={(event) => setDraftAuthor(event.target.value)}
            disabled={disabled}
            placeholder="Autor"
            autoFocus
            className="h-9 rounded-etiqueta border border-fio-2 bg-painel-solido px-3 text-sm font-medium text-fg outline-none focus:border-info focus-visible:ring-2 focus-visible:ring-foco"
          />
        </label>
        <label className="grid gap-1.5 text-xs font-semibold text-fg-3">
          Parte
          <input name="parte_leitura" inputMode="numeric"
            type="number"
            min={1}
            value={draftPart}
            onChange={(event) => setDraftPart(event.target.value)}
            disabled={disabled}
            className="h-9 rounded-etiqueta border border-fio-2 bg-painel-solido px-3 text-sm font-medium text-fg outline-none focus:border-info focus-visible:ring-2 focus-visible:ring-foco"
          />
        </label>
      </form>
    </Modal>
  );
}
