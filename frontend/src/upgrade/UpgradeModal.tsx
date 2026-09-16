import { useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O modal padrão do handoff.
//
// O protótipo tem UM modal e cinco blocos opcionais de corpo (texto,
// campos, itens com caixa de seleção, etapas com barra, escala de
// nota). Trazer isso como uma moldura + blocos — em vez de sete
// modais diferentes — é o que faz "Nova live" e "Confirmação"
// parecerem a mesma peça: mesmo cabeçalho, mesmo rodapé, mesma
// hierarquia de botões. A variação mora no miolo, nunca na casca.
// ─────────────────────────────────────────────────────────────────

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  icon: IconName;
  /** Selo do cabeçalho: acento por padrão, err quando a ação destrói algo. */
  iconBg?: string;
  iconColor?: string;
  title: string;
  subtitle?: string;
  width?: string;
  /** Texto miúdo à esquerda no rodapé: custo, estimativa, aviso. */
  footerNote?: string;
  secondaryLabel?: string;
  onSecondary?: () => void;
  primaryLabel: string;
  primaryIcon: IconName;
  /** `false` rebaixa o primário a secundário (ação sem compromisso). */
  primaryStrong?: boolean;
  onPrimary?: () => void;
  children?: ReactNode;
};

export function UpgradeModal({
  open,
  onClose,
  icon,
  iconBg = 'var(--accent-soft)',
  iconColor = 'var(--accent2)',
  title,
  subtitle,
  width = '520px',
  footerNote,
  secondaryLabel = 'Cancelar',
  onSecondary,
  primaryLabel,
  primaryIcon,
  primaryStrong = true,
  onPrimary,
  children,
}: UpgradeModalProps) {
  // Esc fecha. O protótipo não mostra isso (é estático), mas um modal que
  // só sai no clique é uma armadilha para quem trabalha no teclado — e a
  // bancada inteira deste app é pensada para o teclado.
  useEffect(() => {
    if (!open) return;
    const sair = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', sair);
    return () => window.removeEventListener('keydown', sair);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: 'rgb(10 12 18/.5)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          maxWidth: width,
          maxHeight: 'calc(100dvh - 48px)',
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgb(0 0 0/.35)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
            padding: '14px 15px',
            borderBottom: '1px solid var(--line2)',
          }}
        >
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 28,
              height: 28,
              flex: 'none',
              borderRadius: 'var(--r2)',
              background: iconBg,
              color: iconColor,
            }}
          >
            <Icon name={icon} size={14} />
          </span>
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
              {title}
            </span>
            {subtitle ? (
              <span
                style={{
                  display: 'block',
                  marginTop: 2,
                  fontSize: 11.5,
                  lineHeight: 1.5,
                  color: 'var(--mute)',
                }}
              >
                {subtitle}
              </span>
            ) : null}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-icon"
            style={{ border: 0, background: 'none', boxShadow: 'none', color: 'var(--mute)' }}
            aria-label="Fechar"
          >
            <Icon name="x" size={14} />
          </button>
        </header>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'auto',
            padding: '14px 15px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {children}
        </div>

        <footer
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 7,
            padding: '12px 15px',
            borderTop: '1px solid var(--line2)',
          }}
        >
          {footerNote ? (
            <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{footerNote}</span>
          ) : null}
          <div style={{ flex: 1, minWidth: 8 }} />
          <button type="button" className="btn" onClick={onSecondary ?? onClose}>
            {secondaryLabel}
          </button>
          <button
            type="button"
            className={primaryStrong ? 'btn btn-pri' : 'btn'}
            onClick={onPrimary ?? onClose}
          >
            <Icon name={primaryIcon} size={13} />
            {primaryLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Parágrafo explicativo — o bloco que diz o que a ação faz. */
export function ModalText({ children }: { children: ReactNode }) {
  return (
    <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: 'var(--mute)' }}>{children}</p>
  );
}

export type ModalField = { label: string; value: string; hint?: string; height?: string };

export function ModalFields({ fields }: { fields: ModalField[] }) {
  return (
    <>
      {fields.map((f) => (
        <label key={f.label} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--mute)',
            }}
          >
            {f.label}
            <span style={{ flex: 1 }} />
            {f.hint ? (
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--dim)' }}>
                {f.hint}
              </span>
            ) : null}
          </span>
          <span
            className="fld"
            style={{
              minHeight: f.height ?? '30px',
              height: 'auto',
              alignItems: 'flex-start',
              padding: '7px 9px',
              lineHeight: 1.45,
            }}
          >
            {f.value}
          </span>
        </label>
      ))}
    </>
  );
}

export type ModalItem = {
  num: string;
  titulo: string;
  estado: string;
  marcado: boolean;
  chipBg: string;
  chipCor: string;
};

export function ModalItems({ items }: { items: ModalItem[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {items.map((i) => (
        <span
          key={i.num}
          className="row"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '7px 8px',
            border: `1px solid ${i.marcado ? 'var(--accent)' : 'var(--line2)'}`,
            borderRadius: 'var(--r2)',
          }}
        >
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 16,
              height: 16,
              flex: 'none',
              borderRadius: 'var(--r1)',
              border: `1.5px solid ${i.marcado ? 'var(--accent)' : 'var(--line)'}`,
              background: i.marcado ? 'var(--accent)' : 'transparent',
              color: 'var(--on-accent)',
            }}
          >
            {i.marcado ? <Icon name="check" size={10} stroke={3} /> : null}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--dim)' }}>
            {i.num}
          </span>
          <span
            style={{
              minWidth: 0,
              flex: 1,
              fontSize: 12,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {i.titulo}
          </span>
          <span className="chip" style={{ background: i.chipBg, color: i.chipCor }}>
            {i.estado}
          </span>
        </span>
      ))}
    </div>
  );
}

export type ModalStep = {
  icone: IconName;
  titulo: string;
  pct: string;
  hint: string;
  bg: string;
  cor: string;
  barra: string;
};

export function ModalSteps({ steps }: { steps: ModalStep[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
      {steps.map((e) => (
        <span key={e.titulo} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 22,
              height: 22,
              flex: 'none',
              borderRadius: 99,
              background: e.bg,
              color: e.cor,
            }}
          >
            <Icon name={e.icone} size={11} />
          </span>
          <span style={{ minWidth: 0, flex: 1, fontSize: 12.5, fontWeight: 600 }}>{e.titulo}</span>
          <span
            style={{ flex: 1, height: 4, borderRadius: 2, background: 'var(--inset)' }}
            aria-hidden
          >
            <span
              style={{
                display: 'block',
                height: '100%',
                width: e.pct,
                borderRadius: 2,
                background: e.barra,
              }}
            />
          </span>
          <span
            style={{
              fontFamily: 'var(--mono)',
              fontSize: 10.5,
              color: 'var(--mute)',
              width: 46,
              textAlign: 'right',
            }}
          >
            {e.hint}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Escala de nota 1–5 do corte: cinco caixas grandes, uma selecionada. */
export function ModalScore({
  value,
  max = 5,
  help,
  onPick,
}: {
  value: number;
  max?: number;
  help?: string;
  onPick?: (v: number) => void;
}) {
  const boxes = Array.from({ length: max }, (_, i) => i + 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <span style={{ display: 'flex', gap: 5 }}>
        {boxes.map((v) => {
          const on = v === value;
          const style: CSSProperties = {
            display: 'grid',
            placeItems: 'center',
            flex: 1,
            height: 44,
            border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
            borderRadius: 'var(--r2)',
            background: on ? 'var(--accent-soft)' : 'var(--inset)',
            color: on ? 'var(--accent2)' : 'var(--mute)',
            fontFamily: 'var(--mono)',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          };
          return (
            <button key={v} type="button" style={style} onClick={() => onPick?.(v)}>
              {v}
            </button>
          );
        })}
      </span>
      {help ? <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>{help}</span> : null}
    </div>
  );
}
