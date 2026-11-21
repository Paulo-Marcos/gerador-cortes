// D-458: a contagem de candidatos do Fire, por estágio.
// D-1168: texto de metadado em mono (DIRECAO §7.6), sem chip: o selo da linha é um só.
import { cn } from '@/lib/utils';
import type { ContagemShorts } from './shortsApi';

const ESTAGIOS: { chave: keyof ContagemShorts; um: string; varios: string; classe: string }[] = [
  { chave: 'sugerido', um: 'sugerido', varios: 'sugeridos', classe: 'text-fg-3' },
  { chave: 'aprovado', um: 'aprovado', varios: 'aprovados', classe: 'text-fg-2' },
  { chave: 'renderizado', um: 'pronto', varios: 'prontos', classe: 'text-fg' },
];

export function ContagemChips({ shorts }: { shorts: ContagemShorts }) {
  if (shorts.total === 0) return <span className="text-pequeno text-fg-3">nenhum candidato ainda</span>;

  return (
    <div className="flex flex-col">
      {ESTAGIOS.filter(({ chave }) => shorts[chave] > 0).map(({ chave, um, varios, classe }) => (
        <span key={chave} className={cn('num', classe)}>
          {shorts[chave]} {shorts[chave] === 1 ? um : varios}
        </span>
      ))}
    </div>
  );
}
