import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { CHAVE_ROBO_DO_STUDIO, RoboDoStudio } from '../RoboDoStudio';

// D-895: os dois interruptores do robô do Studio, gravados por canal.

function renderizar(config?: { monetizar: boolean; relacionar_short: boolean }) {
  const qc = new QueryClient();
  if (config) qc.setQueryData(CHAVE_ROBO_DO_STUDIO, config);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <RoboDoStudio />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const marcados = (html: string) => (html.match(/checked=""/g) ?? []).length;

describe('RoboDoStudio', () => {
  it('sem nada gravado, os dois ficam desligados', () => {
    expect(marcados(renderizar())).toBe(0);
  });

  it('mostra cada interruptor como o canal gravou', () => {
    const html = renderizar({ monetizar: true, relacionar_short: false });
    expect(marcados(html)).toBe(1);
    expect(html).toContain('Ligar a monetização de cada vídeo enviado');
    expect(html).toContain('Ligar cada short ao corte de onde ele saiu');
  });

  it('avisa do login e do Programa de Parcerias', () => {
    const html = renderizar();
    expect(html).toContain('faça login na conta do canal');
    expect(html).toContain('Programa de Parcerias');
  });
});
