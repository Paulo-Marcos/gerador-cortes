import { NOME_DA_PREFERENCIA, PREFERENCIAS, useUpgradeTheme, type Preferencia } from '@/lib/tema';
import { cn } from '@/lib/utils';
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
    <div className="flex gap-0.5 rounded-campo bg-poco p-0.5">
      {opcoes.map((o) => {
        const ativa = o.id === valor;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onEscolher(o.id)}
            aria-pressed={ativa}
            className={cn(
              'inline-flex h-[26px] cursor-pointer items-center gap-[5px] rounded-etiqueta border-0 px-2.5 text-micro font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foco',
              ativa ? 'bg-painel-solido text-fg shadow-topo' : 'bg-transparent text-fg-2',
            )}
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
    <div className="flex flex-col gap-2">
      <span className="font-mono text-micro font-bold tracking-[0.1em] text-fg-3">Aparência</span>
      <div className="flex flex-wrap items-center gap-3 rounded-cartao border border-fio bg-painel-solido p-[13px] shadow-topo">
        <span className="text-corpo font-semibold">Tema</span>
        <Segmentado
          valor={preferencia}
          onEscolher={setTheme}
          opcoes={PREFERENCIAS.map((p) => ({
            id: p,
            texto: NOME_DA_PREFERENCIA[p],
            icone: ICONE_DA_PREFERENCIA[p],
          }))}
        />

        <span className="h-[22px] w-px bg-fio-2" aria-hidden />

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
