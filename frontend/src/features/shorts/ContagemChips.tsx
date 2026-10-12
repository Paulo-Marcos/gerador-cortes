// D-458: os chips de contagem do cartão do Fire — quantos candidatos em cada
// estágio. Saíram do `ShortsPage.tsx` na D-905, quando o cartão ganhou as
// redes e o arquivo bateu no teto da catraca de tamanho.
import { cn } from '@/lib/utils';
import type { ContagemShorts } from './shortsApi';

const CHIPS: { chave: keyof ContagemShorts; um: string; varios: string; classe: string }[] = [
  { chave: 'sugerido', um: 'sugerido', varios: 'sugeridos', classe: 'text-[var(--wb-text-mute)]' },
  { chave: 'aprovado', um: 'aprovado', varios: 'aprovados', classe: 'text-[var(--wb-ok-ink)]' },
  { chave: 'renderizado', um: 'pronto', varios: 'prontos', classe: 'text-[var(--wb-accent)]' },
];

export function ContagemChips({ shorts }: { shorts: ContagemShorts }) {
  if (shorts.total === 0) {
    return <span className="text-[12px] text-[var(--wb-text-mute)]">nenhum candidato ainda</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {CHIPS.filter(({ chave }) => shorts[chave] > 0).map(({ chave, um, varios, classe }) => (
        <span
          key={chave}
          className={cn('font-code text-[12px] font-semibold tabular-nums', classe)}
        >
          {shorts[chave]} {shorts[chave] === 1 ? um : varios}
        </span>
      ))}
    </div>
  );
}
