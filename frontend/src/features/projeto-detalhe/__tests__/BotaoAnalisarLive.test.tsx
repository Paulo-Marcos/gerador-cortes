import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { analiseClaudeKey } from '@/features/diarizacao/useDiarizacao';
import { BotaoAnalisarLive } from '../BotaoAnalisarLive';

// D-977: a análise da live oferece o Claude, o Gemini e as duas.

function renderBotao(client: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <BotaoAnalisarLive
          projetoId="live-a"
          usarDiarizacao
          desabilitado={false}
          aoConcluir={() => {}}
        />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const botoes = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe('BotaoAnalisarLive', () => {
  it('oferece analisar com o Claude, com o Gemini e com as duas', () => {
    const html = renderBotao(new QueryClient());
    expect(html).toContain('aria-label="Analisar a live com o Claude"');
    expect(html).toContain('aria-label="Analisar a live com o Gemini"');
    expect(html).toContain('aria-label="Analisar a live com o Claude e o Gemini"');
  });

  it('com uma análise desta live em voo, os três travam', () => {
    const client = new QueryClient();
    const mutation = client.getMutationCache().build<unknown, Error, void, unknown>(client, {
      mutationKey: analiseClaudeKey('live-a'),
      mutationFn: () => new Promise<never>(() => {}),
    });
    void mutation.execute(undefined);

    const html = renderBotao(client);
    expect(html).toContain('analisando…');
    expect(botoes(html)).toHaveLength(3);
    for (const botao of botoes(html)) expect(botao).toContain('disabled=""');
  });
});
