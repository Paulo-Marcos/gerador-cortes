import { NOME_DA_PREFERENCIA, PREFERENCIAS, useUpgradeTheme, type Preferencia } from '@/lib/tema';
import { Icon, type IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O cartão "Aparência" das Configurações.
//
// O design reúne aqui os dois eixos da casca: TEMA (escuro, claro ou auto) e
// SUPERFÍCIE (vidro translúcido ou sólido). O tema também está no
// botão da barra superior, porque se troca muito; a superfície só
// aqui, porque se escolhe uma vez — e era justamente ela que não
// tinha onde ser trocada fora da página de Componentes.
// ─────────────────────────────────────────────────────────────────

const ICONE_DA_PREFERENCIA: Record<Preferencia, IconName> = {
  dark: 'moon',
  light: 'sun',
  auto: 'monitor',
};

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
            <Icon name={o.icone} />
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}

export function AparenciaDaCasca() {
  const { preferencia, setTheme, glass, setGlass } = useUpgradeTheme();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="lbl">Aparência</span>
      <div
        className="card"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: 13 }}
      >
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>Tema</span>
        <Segmentado
          valor={preferencia}
          onEscolher={setTheme}
          opcoes={PREFERENCIAS.map((p) => ({
            id: p,
            texto: NOME_DA_PREFERENCIA[p],
            icone: ICONE_DA_PREFERENCIA[p],
          }))}
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
      </div>
    </div>
  );
}
