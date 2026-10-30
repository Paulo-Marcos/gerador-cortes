import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { erroDaFaixa, FaixaDoShortForm } from '../FaixaDoShortForm';

/**
 * D-997. A faixa de duração dos shorts é do canal: a tela mostra a do canal com
 * o padrão ao lado, e o mínimo maior ou igual ao máximo vira aviso na tela.
 */
const FAIXA = {
  duracao_min_seg: 20,
  duracao_max_seg: 150,
  padrao_min_seg: 15,
  padrao_max_seg: 90,
};

describe('o aviso da faixa', () => {
  it('aceita mínimo menor que o máximo', () => {
    expect(erroDaFaixa('20', '150')).toBeNull();
  });

  it('recusa mínimo igual ou maior que o máximo, como o domínio', () => {
    expect(erroDaFaixa('90', '90')).toBe('A duração mínima (90 s) precisa ser menor que a máxima (90 s).');
    expect(erroDaFaixa('120', '60')).toContain('menor que a máxima');
  });

  it('recusa campo vazio e mínimo zero', () => {
    expect(erroDaFaixa('', '90')).toContain('Preencha');
    expect(erroDaFaixa('0', '90')).toContain('maior que zero');
  });
});

describe('o formulário da faixa', () => {
  it('mostra a faixa do canal e o padrão ao lado', () => {
    const html = renderToStaticMarkup(
      <FaixaDoShortForm faixa={FAIXA} pending={false} erroDoServidor={null} onSave={() => {}} />,
    );

    expect(html).toContain('value="20"');
    expect(html).toContain('value="150"');
    expect(html).toContain('padrão: 15 a 90 s');
    expect(html).not.toContain('role="alert"');
  });

  it('mostra na tela o erro que o servidor devolveu', () => {
    const html = renderToStaticMarkup(
      <FaixaDoShortForm
        faixa={FAIXA}
        pending={false}
        erroDoServidor="A duração mínima (120 s) precisa ser menor que a máxima (60 s)."
        onSave={() => {}}
      />,
    );

    expect(html).toContain('role="alert"');
    expect(html).toContain('precisa ser menor que a máxima (60 s)');
  });
});
