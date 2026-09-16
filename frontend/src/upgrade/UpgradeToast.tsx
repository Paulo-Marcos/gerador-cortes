import { Icon, type IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O aviso de canto.
//
// Detalhe do protótipo que vale preservar: o cartão inteiro é
// `pointer-events:none` e só o X volta a receber clique. Ele nasce
// sobre a barra de ações fixa (bottom:74px), e sem isso roubaria o
// clique do botão primário bem no instante em que a pessoa vai
// apertá-lo — o avisar atrapalharia o agir.
// ─────────────────────────────────────────────────────────────────

type UpgradeToastProps = {
  open: boolean;
  onClose: () => void;
  icon?: IconName;
  iconColor?: string;
  title: string;
  detail?: string;
};

export function UpgradeToast({
  open,
  onClose,
  icon = 'circle-check',
  iconColor = 'var(--ok)',
  title,
  detail,
}: UpgradeToastProps) {
  if (!open) return null;

  return (
    <div
      className="card"
      role="status"
      style={{
        position: 'fixed',
        right: 18,
        bottom: 74,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '10px 12px',
        maxWidth: 340,
        pointerEvents: 'none',
        boxShadow: '0 18px 44px rgb(0 0 0/.3)',
      }}
    >
      <Icon name={icon} size={14} style={{ color: iconColor }} />
      <span style={{ minWidth: 0, flex: 1, fontSize: 12, lineHeight: 1.45 }}>
        <b>{title}</b>
        {detail ? <span style={{ color: 'var(--mute)' }}> · {detail}</span> : null}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="btn btn-icon"
        style={{
          border: 0,
          background: 'none',
          boxShadow: 'none',
          color: 'var(--mute)',
          width: 22,
          height: 22,
          pointerEvents: 'auto',
        }}
        aria-label="Fechar aviso"
      >
        <Icon name="x" size={12} />
      </button>
    </div>
  );
}
