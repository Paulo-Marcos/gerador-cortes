import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AvisoFalhaSync } from '../AvisoFalhaSync';

// D-994: a sync do YouTube ficou recusada de 10/07 a 27/10/2026 sem nada na tela.

const FALHA = {
  mensagem: 'O token do YouTube não tem o escopo de estatísticas.',
  precisa_reautorizar: true,
  em: '2026-10-28T12:00:00',
};

describe('AvisoFalhaSync', () => {
  it('não mostra nada quando a sincronização está bem', () => {
    expect(renderToStaticMarkup(<AvisoFalhaSync falha={null} sincronizadoEm={null} />)).toBe('');
  });

  it('mostra a mensagem do backend e a ação a tomar', () => {
    const html = renderToStaticMarkup(
      <AvisoFalhaSync falha={FALHA} sincronizadoEm="2026-07-10T09:30:00" />,
    );
    expect(html).toContain(FALHA.mensagem);
    expect(html).toContain('Reautorização necessária');
    expect(html).toContain('role="alert"');
  });

  it('mostra a última sincronização que deu certo', () => {
    const html = renderToStaticMarkup(
      <AvisoFalhaSync falha={FALHA} sincronizadoEm="2026-07-10T09:30:00" />,
    );
    expect(html).toContain('Última sincronização com sucesso');
    expect(html).toContain('10/07/2026');
  });

  it('diz que nunca deu certo quando não há sucesso anterior', () => {
    const html = renderToStaticMarkup(<AvisoFalhaSync falha={FALHA} sincronizadoEm={null} />);
    expect(html).toContain('Nunca sincronizou com sucesso');
  });

  it('falha que não é de token não pede reautorização', () => {
    const html = renderToStaticMarkup(
      <AvisoFalhaSync
        falha={{ ...FALHA, precisa_reautorizar: false, mensagem: 'passou do tempo limite' }}
        sincronizadoEm={null}
      />,
    );
    expect(html).toContain('passou do tempo limite');
    expect(html).not.toContain('Reautorização necessária');
    expect(html).toContain('A sincronização falhou');
  });
});
