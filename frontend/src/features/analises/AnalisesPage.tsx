// E-022: Área de Análises — uma tela, duas abas. Reúne a telemetria interna
// proposta×final (D-310) e o desempenho no YouTube (D-313). Cada aba nasce vazia
// de forma elegante e nunca quebra na ausência de dados.
import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PropostaFinalTab } from './PropostaFinalTab';
import { YoutubeDesempenhoTab } from './YoutubeDesempenhoTab';
import { LlmCallsTab } from './LlmCallsTab';

type AbaId = 'proposta-final' | 'youtube' | 'llm-calls';

const ABAS: { id: AbaId; rotulo: string }[] = [
  { id: 'proposta-final', rotulo: 'Proposta × Final' },
  { id: 'youtube', rotulo: 'Desempenho YouTube' },
  { id: 'llm-calls', rotulo: 'Chamadas de IA' },
];

export function AnalisesPage() {
  const [aba, setAba] = useState<AbaId>('proposta-final');

  return (
    <div className="flex h-screen min-h-0 flex-col overflow-hidden bg-[var(--wb-bg)] text-[var(--wb-text)]">
      <header className="border-b border-[var(--wb-border-soft)] bg-[var(--wb-bg)] px-7 pt-5">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius)] bg-[var(--wb-accent-soft)] text-[var(--wb-accent)]">
            <BarChart3 size={22} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="font-editorial text-[48px] font-medium leading-[0.96] tracking-[-0.01em] text-[var(--wb-text)]">
              Análises
            </h1>
            <p className="mt-2 max-w-2xl text-[15px] text-[var(--wb-text-mute)]">
              Régua do que a IA propôs contra o que foi ao ar, e o desempenho dos vídeos publicados
              no canal.
            </p>
          </div>
        </div>

        <nav className="mt-4 flex gap-1" aria-label="Abas de análise">
          {ABAS.map(({ id, rotulo }) => (
            <button
              key={id}
              type="button"
              onClick={() => setAba(id)}
              aria-current={aba === id ? 'page' : undefined}
              className={cn(
                'relative -mb-px border-b-2 px-4 py-2.5 text-[14px] font-medium transition-colors',
                aba === id
                  ? 'border-[var(--wb-accent)] text-[var(--wb-text)]'
                  : 'border-transparent text-[var(--wb-text-mute)] hover:text-[var(--wb-text)]',
              )}
            >
              {rotulo}
            </button>
          ))}
        </nav>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {aba === 'proposta-final' && <PropostaFinalTab />}
        {aba === 'youtube' && <YoutubeDesempenhoTab />}
        {aba === 'llm-calls' && <LlmCallsTab />}
      </main>
    </div>
  );
}
