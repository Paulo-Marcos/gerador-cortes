import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { CHAVE_NAVEGADOR_DO_ROBO, NavegadorDoRobo } from '../NavegadorDoRobo';

// D-832: a tela mostra o navegador gravado no canal; sem escolha, o Edge (D-873).

function renderizar(navegador?: 'chrome' | 'edge') {
  const qc = new QueryClient();
  if (navegador) qc.setQueryData(CHAVE_NAVEGADOR_DO_ROBO, { navegador });
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <NavegadorDoRobo />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('NavegadorDoRobo', () => {
  it('mostra o Chrome quando é o escolhido', () => {
    const html = renderizar('chrome');
    expect(html).toMatch(/<option value="chrome" selected="">Google Chrome<\/option>/);
  });

  it('sem escolha gravada, fica no Edge', () => {
    expect(renderizar()).toMatch(/<option value="edge" selected="">Microsoft Edge<\/option>/);
  });

  it('avisa que cada navegador tem a própria sessão', () => {
    expect(renderizar('chrome')).toContain('Cada navegador guarda a própria sessão');
  });
});
