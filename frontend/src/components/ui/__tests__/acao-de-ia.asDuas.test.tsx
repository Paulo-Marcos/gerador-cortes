import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AcaoDeIa } from '../acao-de-ia';

// D-977: a análise da live oferece também a dupla, o Claude e depois o Gemini.

const render = (props: Partial<Parameters<typeof AcaoDeIa>[0]> = {}) =>
  renderToStaticMarkup(
    <AcaoDeIa rotulo="Analisar a live" emVoo={null} onGerar={vi.fn()} {...props} />,
  );

const botoes = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe('AcaoDeIa com as duas', () => {
  it('sem a dupla, não há terceiro botão', () => {
    expect(botoes(render())).toHaveLength(2);
    expect(render()).not.toContain('As duas');
  });

  it('com a dupla, oferece "As duas" ao lado dos provedores', () => {
    const html = render({ asDuas: { onGerar: vi.fn(), emVoo: false } });
    expect(botoes(html)).toHaveLength(3);
    expect(html).toContain('aria-label="Analisar a live com o Claude e o Gemini"');
    expect(html).toContain('>As duas<');
    for (const botao of botoes(html)) expect(botao).not.toContain('disabled=""');
  });

  it('a dupla em voo: "As duas" fica ocupado e tudo trava', () => {
    const html = render({ asDuas: { onGerar: vi.fn(), emVoo: true }, emVoo: 'gemini' });
    const [claude, gemini, asDuas] = botoes(html);
    expect(asDuas).toContain('aria-busy="true"');
    expect(gemini).toContain('aria-busy="true"');
    expect(claude).toContain('aria-busy="false"');
    for (const botao of [claude, gemini, asDuas]) expect(botao).toContain('disabled=""');
  });
});
