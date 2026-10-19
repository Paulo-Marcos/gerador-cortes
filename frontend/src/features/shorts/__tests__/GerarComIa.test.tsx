import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { GerarComIa } from '../ShortsPage';
import type { FireComBruto } from '../shortsApi';

// D-975: sem bruto, o botão refaz o bruto antes. O tooltip não pode prometer
// que a transcrição fica intocada: a salvaguarda de silêncios ressincroniza a
// do corte em toda geração.

function desenhar(fire: Partial<FireComBruto>) {
  const qc = new QueryClient();
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <GerarComIa fire={{ corte_id: 'c1', ...fire } as FireComBruto} liveRodando={false} />
    </QueryClientProvider>,
  );
}

describe('GerarComIa', () => {
  it('sem bruto, o tooltip diz que a transcrição do corte se ajusta aos silêncios', () => {
    const html = desenhar({ tem_bruto: false, live_em_disco: true });

    expect(html).toContain('Gerar bruto e shorts com IA');
    expect(html).toContain(
      'title="Refaz o bruto a partir da live (sem refazer as cenas nem a transcrição da live; a do corte se ajusta aos silêncios) e a IA propõe os trechos."',
    );
    expect(html).not.toContain('sem mexer na transcrição');
  });

  it('com bruto, o tooltip só fala dos trechos novos', () => {
    const html = desenhar({ tem_bruto: true, live_em_disco: false });

    expect(html).toContain(
      'title="A IA propõe trechos novos. Nada da fila é apagado; trecho repetido fica de fora."',
    );
  });
});
