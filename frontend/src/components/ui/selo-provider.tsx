import { CLAUDE_BRAND, ClaudeIcon } from '@/components/ui/claude-button';
import { GEMINI_BRAND, GeminiIcon } from '@/components/ui/gemini-button';
import { cn } from '@/lib/utils';
import type { ProviderIA } from '@/lib/providerIa';

// Quem gerou o texto que está na tela. Nasce da D-608: com os dois providers
// ligados nos mesmos botões, "a IA escreveu" deixou de ser uma informação —
// ao comparar qualidade entre Claude e Gemini, o que importa é QUAL deles.
//
// Sem provider (geração antiga, ou telemetria que não registrou) o selo some
// em vez de chutar: um selo errado é pior que selo nenhum.

interface Props {
  provider: ProviderIA | null | undefined;
  /** O modelo exato, quando conhecido — vai para o title, não para o rótulo. */
  modelo?: string | null;
  className?: string;
}

const NOME: Record<ProviderIA, string> = { claude: 'Claude', gemini: 'Gemini' };
const COR: Record<ProviderIA, string> = { claude: CLAUDE_BRAND, gemini: GEMINI_BRAND };

export function SeloDeProvider({ provider, modelo, className }: Props) {
  if (!provider) return null;
  const Icone = provider === 'gemini' ? GeminiIcon : ClaudeIcon;
  return (
    <span
      title={modelo ? `Gerado por ${NOME[provider]} (${modelo})` : `Gerado por ${NOME[provider]}`}
      className={cn(
        'inline-flex flex-none items-center gap-1 rounded-full border px-1.5 py-0.5',
        'font-code text-[9.5px] font-bold uppercase tracking-[0.04em]',
        className,
      )}
      style={{ borderColor: COR[provider], color: COR[provider] }}
    >
      <Icone size={10} />
      {NOME[provider]}
    </span>
  );
}
