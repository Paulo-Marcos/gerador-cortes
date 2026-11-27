import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Dialog } from '../dialog';

// D-1195 (E-069 H-25; DIRECAO §8.2 Foco): "diálogo e gaveta prendem e devolvem o foco;
// `overscroll-behavior: contain`". A auditoria achou o foco certo, mas nenhum
// `overscroll-contain` no app: rolar até o fim do miolo de um diálogo longo (Novo canal,
// a gaveta da fila) continuava rolando a tela atrás do véu.

const miolo = (tamanho?: 'sm' | 'lateral') =>
  renderToStaticMarkup(
    <Dialog open onClose={() => {}} title="Novo canal" tamanho={tamanho}>
      <p>corpo longo</p>
    </Dialog>,
  ).match(/<div class="([^"]*overflow-y-auto[^"]*)">\s*<p>corpo longo/)?.[1];

describe('o miolo que rola no diálogo e na gaveta', () => {
  it('diálogo centrado: a rolagem não vaza para a tela atrás', () => {
    expect(miolo()).toContain('overscroll-contain');
  });

  it('gaveta lateral: idem', () => {
    expect(miolo('lateral')).toContain('overscroll-contain');
  });
});
