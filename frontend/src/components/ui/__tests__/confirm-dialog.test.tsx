import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ConfirmDialog, type PedidoConfirmacao } from '@/components/ui/confirm-dialog';

const noop = () => {};

const PEDIDO: PedidoConfirmacao = {
  titulo: 'Gerar cenas de novo?',
  descricao: 'Gerar de novo SUBSTITUI todas as cenas deste corte.',
  detalhe: '12 cenas atuais',
  confirmLabel: 'Substituir cenas',
  tone: 'danger',
};

function markup(pedido: PedidoConfirmacao | null) {
  return renderToStaticMarkup(<ConfirmDialog pedido={pedido} onCancel={noop} onConfirm={noop} />);
}

describe('ConfirmDialog', () => {
  it('nao renderiza nada sem pedido pendente', () => {
    expect(markup(null)).toBe('');
  });

  it('mostra titulo, detalhe, descricao e os dois botoes', () => {
    const html = markup(PEDIDO);
    expect(html).toContain('Gerar cenas de novo?');
    expect(html).toContain('12 cenas atuais');
    expect(html).toContain('SUBSTITUI');
    expect(html).toContain('Cancelar');
    expect(html).toContain('Substituir cenas');
  });

  it('usa o rotulo de confirmacao do proprio pedido', () => {
    const html = markup({ ...PEDIDO, confirmLabel: 'Analisar de novo' });
    expect(html).toContain('Analisar de novo');
    expect(html).not.toContain('Substituir cenas');
  });
});
