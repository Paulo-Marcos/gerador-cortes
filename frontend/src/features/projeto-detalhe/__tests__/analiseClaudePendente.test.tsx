import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { analiseClaudeKey, useAnaliseClaudeEmAndamento } from '@/hooks/useDiarizacao';

// D-418 — o estado "analisando" tem de ser POR LIVE. A rota /projetos/:id não
// remonta ao trocar de projeto pelo rail, então o pending não pode viver no
// componente: viveria uma vez só e valeria para todas as lives.

function Sonda({ projetoId }: { projetoId: string }) {
  return <span>{useAnaliseClaudeEmAndamento(projetoId) ? 'gerando' : 'livre'}</span>;
}

function renderSonda(client: QueryClient, projetoId: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <Sonda projetoId={projetoId} />
    </QueryClientProvider>,
  );
}

/** Deixa uma análise em voo para `projetoId` (a promise nunca resolve). */
function dispararAnalise(client: QueryClient, projetoId: string) {
  const mutation = client.getMutationCache().build<unknown, Error, void, unknown>(client, {
    mutationKey: analiseClaudeKey(projetoId),
    mutationFn: () => new Promise<never>(() => {}),
  });
  void mutation.execute(undefined);
  return mutation;
}

describe('useAnaliseClaudeEmAndamento', () => {
  it('marca como em andamento só a live que está analisando', () => {
    const client = new QueryClient();
    dispararAnalise(client, 'live-a');

    expect(renderSonda(client, 'live-a')).toContain('gerando');
    expect(renderSonda(client, 'live-b')).toContain('livre');
  });

  it('libera a live quando a análise dela termina', async () => {
    const client = new QueryClient();
    const mutation = client.getMutationCache().build<unknown, Error, void, unknown>(client, {
      mutationKey: analiseClaudeKey('live-a'),
      mutationFn: async () => ({ total_cortes: 3 }),
    });
    await mutation.execute(undefined);

    expect(renderSonda(client, 'live-a')).toContain('livre');
  });

  it('usa chaves distintas por projeto', () => {
    expect(analiseClaudeKey('live-a')).not.toEqual(analiseClaudeKey('live-b'));
  });
});
