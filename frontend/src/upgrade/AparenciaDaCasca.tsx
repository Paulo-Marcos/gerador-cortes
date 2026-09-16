import { PALETTES, usePalette } from '@/hooks/usePalette';
import { Icon, type IconName } from './Icon';
import { useUpgradeTheme } from './useUpgradeTheme';

// ─────────────────────────────────────────────────────────────────
// D-599 · O cartão "Aparência" das Configurações.
//
// O design reúne aqui os dois eixos da casca: TEMA (claro/escuro) e
// SUPERFÍCIE (vidro translúcido ou sólido). O tema também está no
// botão da barra superior, porque se troca muito; a superfície só
// aqui, porque se escolhe uma vez — e era justamente ela que não
// tinha onde ser trocada fora da página de Componentes.
// ─────────────────────────────────────────────────────────────────

function Segmentado<T extends string>({
  opcoes,
  valor,
  onEscolher,
}: {
  opcoes: Array<{ id: T; texto: string; icone: IconName }>;
  valor: T;
  onEscolher: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 'var(--r2)', background: 'var(--inset)' }}>
      {opcoes.map((o) => {
        const ativa = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onEscolher(o.id)}
            aria-pressed={ativa}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              height: 26,
              padding: '0 10px',
              border: 0,
              borderRadius: 'var(--r1)',
              background: ativa ? 'var(--panel)' : 'transparent',
              color: ativa ? 'var(--ink)' : 'var(--mute)',
              boxShadow: ativa ? 'var(--hi)' : 'none',
              fontSize: 11.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Icon name={o.icone} size={12} />
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

export function AparenciaDaCasca() {
  const { theme, setTheme, glass, setGlass } = useUpgradeTheme();
  const { palette, setPalette } = usePalette();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="lbl">Aparência</span>
      <div
        className="card"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 13 }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Tema</span>
        <Segmentado
          valor={theme}
          onEscolher={setTheme}
          opcoes={[
            { id: 'light', texto: 'Claro', icone: 'sun' },
            { id: 'dark', texto: 'Escuro', icone: 'moon' },
          ]}
        />

        <span style={{ width: 1, height: 22, background: 'var(--line)' }} aria-hidden />

        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Superfície</span>
        <Segmentado
          valor={glass ? 'vidro' : 'solido'}
          onEscolher={(v) => setGlass(v === 'vidro')}
          opcoes={[
            { id: 'vidro', texto: 'Vidro', icone: 'layout-template' },
            { id: 'solido', texto: 'Sólido', icone: 'rows' },
          ]}
        />
        <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
          {glass
            ? 'translúcido sobre o fundo — mais bonito, custa GPU a cada quadro'
            : 'superfície opaca — mais leve com o render aberto atrás'}
        </span>

        {/* D-610: a cor de acento volta a ser escolha — as cinco paletas da
            versão anterior, gravadas no mesmo lugar. */}
        <div
          style={{
            display: 'flex',
            flexBasis: '100%',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            paddingTop: 12,
            borderTop: '1px solid var(--line2)',
          }}
        >
          <span style={{ fontSize: 12.5, fontWeight: 600 }}>Cor</span>
          <div role="radiogroup" aria-label="Cor de acento" style={{ display: 'flex', gap: 8 }}>
            {PALETTES.map((p) => {
              const ativa = p.id === palette;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={ativa}
                  aria-label={p.nome}
                  title={`${p.nome} — ${p.descricao}`}
                  onClick={() => setPalette(p.id)}
                  style={{
                    width: 22,
                    height: 22,
                    padding: 0,
                    borderRadius: 99,
                    border: '2px solid var(--solid)',
                    background: p.swatch,
                    boxShadow: ativa ? `0 0 0 2px ${p.swatch}` : '0 0 0 1px var(--line)',
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          </div>
          <span style={{ fontSize: 11.5, color: 'var(--mute)' }}>
            {PALETTES.find((p) => p.id === palette)?.nome} ·{' '}
            {PALETTES.find((p) => p.id === palette)?.descricao}
          </span>
        </div>
      </div>
    </div>
  );
}
