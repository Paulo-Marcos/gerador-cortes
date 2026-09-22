import { Icon } from './Icon';
import { KitScreen } from './KitScreen';
import { ScreenHeader } from './ScreenHeader';
import { useUpgradeTheme } from './useUpgradeTheme';

// ─────────────────────────────────────────────────────────────────
// D-599 · Etapa 0 — vitrine da fundação, fora da casca.
//
// Rota própria e de nível superior (`/upgrade/kit`), sem passar pelo
// `App`. Isso é deliberado: nesta etapa a casca nova ainda não
// existe, e montar o kit dentro da casca ANTIGA o vestiria com o
// material errado — vidro nenhum, cantos de 10 px, DM Sans. A tela
// só prova alguma coisa se for a única coisa na janela.
// ─────────────────────────────────────────────────────────────────

export default function UpgradeKitPage() {
  const { theme, toggleTheme, escuro, glass, toggleGlass } = useUpgradeTheme();

  return (
    <div
      className="ap"
      data-theme={theme}
      data-glass={glass ? '1' : '0'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100dvh',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <header
        className="gl"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flex: 'none',
          height: 44,
          padding: '0 12px',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            fontSize: 12.5,
            color: 'var(--mute)',
          }}
        >
          <span>CutCut</span>
          <Icon name="chevron-right" size={12} style={{ color: 'var(--dim)' }} />
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Componentes</span>
        </nav>
        <div style={{ flex: 1 }} />
        <button
          type="button"
          className="btn"
          onClick={toggleGlass}
          title="Vidro translúcido ou superfície sólida"
        >
          <Icon name="layout-template" size={13} />
          {glass ? 'Vidro' : 'Sólido'}
        </button>
        <button type="button" className="btn btn-icon" onClick={toggleTheme} title="Tema">
          <Icon name={escuro ? 'sun' : 'moon'} size={14} />
        </button>
      </header>

      <ScreenHeader
        icone="layout-template"
        titulo="Componentes"
        sub="as peças que montam todas as telas — vidro, cantos retos, Geist"
      />

      <div style={{ flex: 1, overflow: 'auto', padding: '4px 18px 18px', minHeight: 0 }}>
        <KitScreen />
      </div>
    </div>
  );
}
