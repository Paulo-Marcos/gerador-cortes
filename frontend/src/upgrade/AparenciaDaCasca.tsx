import { NOME_DA_PREFERENCIA, PREFERENCIAS, useUpgradeTheme, type Preferencia } from '@/lib/tema';
import { Switch } from '@/components/ui/switch';
import { Icon, type IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O cartão "Aparência" das Configurações.
//
// O design reúne aqui os dois eixos da casca: TEMA (escuro, claro ou auto) e
// EFEITOS (aurora e vidro, ou superfícies sólidas). D-1137: com a barra superior
// fora (DIRECAO §7.0), este é o único lugar do tema; "Reduzir efeitos" tomou o
// lugar do antigo Vidro/Sólido e passou a tirar também a aurora.
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

        {/* D-1137 (DIRECAO §3.6): a saída de emergência da luz. Ligado, tira a aurora
            e troca o vidro da casca por sólido. É o vidro desligado (`upgrade-glass`). */}
        <label className="flex items-center gap-2.5 text-corpo font-semibold text-fg">
          <Switch checked={!glass} onCheckedChange={(reduzir) => setGlass(!reduzir)} aria-describedby="reduzir-efeitos-ajuda" />
          Reduzir efeitos
        </label>
        <span id="reduzir-efeitos-ajuda" className="text-pequeno text-fg-3">
          {glass
            ? 'aurora e vidro ligados: mais bonito, custa GPU a cada quadro'
            : 'sem aurora e sem vidro: superfícies sólidas, mais leve com vídeo e render'}
        </span>
      </div>
    </div>
  );
}
