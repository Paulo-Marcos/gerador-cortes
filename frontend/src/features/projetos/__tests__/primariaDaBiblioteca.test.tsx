import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { ConteudoDaBiblioteca } from '../BibliotecaPage';
import { NovoProjetoForm } from '../NovoProjetoForm';

// D-1148 (H-15; DIRECAO §5 e §7.12) · A primária da Biblioteca além da contagem.
//
// Contar `data-variant="primario"` não basta: o Button grava a variante mesmo
// desabilitado, e no navegador o "Baixar a live" do canal novo nascia apagado —
// a tela ficava sem primária acesa e a contagem aprovava. E o formulário do
// "Nova live", com a Biblioteca cheia, não pode virar uma segunda primária.

const nada = () => undefined;
const contarPrimarios = (html: string) => (html.match(/data-variant="primario"/g) ?? []).length;

function montar(no: ReactNode) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>{no}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('a primária do canal novo', () => {
  const html = montar(<ConteudoDaBiblioteca estado={{ tipo: 'vazio', onBuscarLives: nada, onLigarCanal: nada }} />);

  it('"Baixar a live" nasce aceso: a única primária não chega desabilitada', () => {
    const primaria = html.match(/<button[^>]*data-variant="primario"[^>]*>/)?.[0] ?? '';
    expect(primaria).not.toBe('');
    // O atributo, não as classes `disabled:` do Tailwind que todo botão carrega.
    expect(primaria).not.toMatch(/\sdisabled=""/);
  });

  it('quem segura o envio vazio é o campo obrigatório, não o botão', () => {
    const link = html.match(/<input[^>]*type="url"[^>]*>/)?.[0] ?? '';
    expect(link).toMatch(/\srequired=""/);
  });
});

describe('o formulário do "Nova live", com a Biblioteca cheia', () => {
  it('o envio é secundário: a primária da tela segue sendo a do "Continue" (§5)', () => {
    const html = montar(<NovoProjetoForm onClose={nada} />);
    expect(contarPrimarios(html)).toBe(0);
    expect(html).toMatch(/data-variant="secundario"[^>]*>(<[^>]*>)*Baixar a live/);
    expect(html).toMatch(/data-variant="fantasma"[^>]*>Cancelar/);
  });
});
