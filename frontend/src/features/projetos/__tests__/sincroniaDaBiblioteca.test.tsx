import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { ConteudoDaBiblioteca, type EstadoDaBiblioteca } from '../BibliotecaPage';
import type { Sincronia } from '../SincroniaDaBiblioteca';

// D-1148 · O status de sincronização da lista volta à Biblioteca (decisão do Paulo em
// 20/11, "Manter o chip por ora"): a TopBar que o mostrava saiu com a D-1137 e o
// `ScreenHeader` não desenha `chrome.estado`. Até o aviso do pé do trilho (§7.0)
// existir, ele é um `Selo` dentro da tela.

const nada = () => undefined;
const VAZIO: EstadoDaBiblioteca = { tipo: 'vazio', onBuscarLives: nada, onLigarCanal: nada };

function montar(estado: EstadoDaBiblioteca, sincronia?: Sincronia) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <ConteudoDaBiblioteca estado={estado} sincronia={sincronia} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('o status de sincronização da Biblioteca', () => {
  it('em dia: "Sincronizado", no tom ok (visto)', () => {
    const html = montar(VAZIO, 'sincronizado');
    expect(html).toMatch(/data-tom="ok"[^>]*>(<[^>]*>)*(<\/[^>]*>)*Sincronizado/);
    expect(html).not.toContain('Atualizando');
  });

  it('buscando de novo: "Atualizando", no tom curso (giro)', () => {
    const html = montar(VAZIO, 'atualizando');
    expect(html).toMatch(/data-tom="curso"[^>]*>(<[^>]*>)*(<\/[^>]*>)*Atualizando/);
    expect(html).not.toContain('Sincronizado');
  });

  it('é anunciado sem roubar o foco', () => {
    expect(montar(VAZIO, 'sincronizado')).toMatch(/<p[^>]*aria-live="polite"/);
  });

  it('carregando e erro não levam o chip: eles já dizem o estado da lista', () => {
    expect(montar({ tipo: 'carregando' }, 'atualizando')).not.toContain('Atualizando');
    expect(montar({ tipo: 'erro', motivo: 'x', tentar: nada }, 'sincronizado')).not.toContain('Sincronizado');
  });
});
