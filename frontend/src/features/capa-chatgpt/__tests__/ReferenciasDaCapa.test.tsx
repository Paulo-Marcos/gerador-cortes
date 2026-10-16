import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { ConfiguracaoCapaChatgpt, EstiloDaCapa, Protagonista } from '../api';
import { CapaChatgptSection } from '../CapaChatgptSection';
import { EstiloDaCapaSection } from '../EstiloDaCapaSection';

// D-939: as referências da capa na tela de Canais. Só a do protagonista
// escolhido aparece (fichas do mascote OU fotos do apresentador), e o nome
// comprido de um arquivo não alarga o cartão por cima dos vizinhos.

const NOME_LONGO = 'chatgpt-image-23-de-jun-de-2026-21-47-46.png';
const FOTO_LONGA = 'colagem-de-expressoes-masculinas-em-12-quadros.png';

const CONFIG: ConfiguracaoCapaChatgpt = {
  projeto_url: '',
  fichas: [NOME_LONGO, 'sapo-lado.png'],
  maximo_de_fichas: 10,
};

const estilo = (protagonista: Protagonista): EstiloDaCapa => ({
  protagonista,
  luminancia_minima: 95,
  escuros_maximo: 40,
  fotos_do_apresentador: [FOTO_LONGA, 'pensativo.jpg'],
  expressoes: ['colagem-de-expressoes-masculinas-em-12-quadros', 'pensativo'],
  maximo_de_fotos: 40,
});

function renderizar(protagonista: Protagonista) {
  const qc = new QueryClient();
  qc.setQueryData(['capa-chatgpt', 'configuracao'], CONFIG);
  qc.setQueryData(['capa-chatgpt', 'estilo'], estilo(protagonista));
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <CapaChatgptSection />
        <EstiloDaCapaSection />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

/** As classes de cada cartão (`li`) das grades de referência. */
const classesDosCartoes = (html: string) =>
  [...html.matchAll(/<li class="([^"]*)"/g)].map((m) => m[1].split(' '));

describe('referências da capa conforme o protagonista', () => {
  it('mascote: mostra as fichas do personagem e guarda as fotos do apresentador', () => {
    const html = renderizar('mascote');

    expect(html).toContain('Fichas do personagem (2)');
    expect(html).toContain('/api/capa-chatgpt/fichas/sapo-lado.png?v=0');
    expect(html).not.toContain('Fotos do apresentador (2)');
    expect(html).not.toContain('/api/capa-chatgpt/apresentador/');
    expect(html).toContain('2 fotos do apresentador guardadas');
  });

  it('apresentador: mostra as fotos e guarda as fichas do mascote', () => {
    const html = renderizar('apresentador');

    expect(html).toContain('Fotos do apresentador (2)');
    expect(html).toContain('/api/capa-chatgpt/apresentador/pensativo.jpg?v=0');
    expect(html).not.toContain('Fichas do personagem (2)');
    expect(html).not.toContain('/api/capa-chatgpt/fichas/');
    expect(html).toContain('2 fichas do mascote guardadas');
  });
});

describe('cartões das referências sem se tampar', () => {
  // O cartão é um grid de uma coluna: com a coluna `auto`, o nome em nowrap
  // (truncate) impõe a largura mínima dela e a imagem `w-full` vaza sobre o
  // vizinho. `grid-cols-1` = minmax(0, 1fr): a coluna cabe no cartão.
  it.each(['mascote', 'apresentador'] as const)('%s: a coluna do cartão cabe nele', (protagonista) => {
    const cartoes = classesDosCartoes(renderizar(protagonista));

    expect(cartoes).toHaveLength(2);
    for (const classes of cartoes) expect(classes).toContain('grid-cols-1');
  });
});
