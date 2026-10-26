import { CLAUDE_BRAND, ClaudeIcon } from '@/components/ui/claude-button';
import { GEMINI_BRAND, GeminiIcon } from '@/components/ui/gemini-button';
import { Icon } from '@/upgrade/Icon';
import type { ReactNode } from 'react';

// D-988: quem propôs o corte, num ícone ao lado do título. É o que deixa o
// operador comparar a qualidade de cada IA olhando a lista: os cortes do Claude
// e os do Gemini lado a lado, e os que vieram de um JSON colado à mão.
//
// Sem origem (corte criado na mão, ou anterior à telemetria D-303) o selo some
// em vez de chutar — mesma regra do SeloDeProvider.

const ORIGENS: Record<string, { dica: string; cor: string; icone: ReactNode }> = {
  claude: { dica: 'Proposto pelo Claude', cor: CLAUDE_BRAND, icone: <ClaudeIcon size={14} /> },
  gemini: { dica: 'Proposto pelo Gemini', cor: GEMINI_BRAND, icone: <GeminiIcon size={14} /> },
  manual: {
    dica: 'Proposto à mão (JSON colado)',
    cor: 'var(--dim)',
    icone: <Icon name="hand" />,
  },
};

export function SeloDaOrigem({ origem }: { origem: string | null | undefined }) {
  const visual = origem ? ORIGENS[origem] : undefined;
  if (!visual) return null;
  return (
    <span
      role="img"
      title={visual.dica}
      aria-label={visual.dica}
      style={{ display: 'inline-flex', flex: 'none', color: visual.cor }}
    >
      {visual.icone}
    </span>
  );
}
