import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BotaoAnalisarLive } from '../BotaoAnalisarLive';

// D-977: a análise da live oferece o Claude, o Gemini e as duas.

const render = (props: Partial<Parameters<typeof BotaoAnalisarLive>[0]> = {}) =>
  renderToStaticMarkup(
    <BotaoAnalisarLive
      emVoo={null}
      asDuasEmVoo={false}
      desabilitado={false}
      onGerar={vi.fn()}
      onGerarAsDuas={vi.fn()}
      {...props}
    />,
  );

const botoes = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe('BotaoAnalisarLive', () => {
  it('oferece analisar com o Claude, com o Gemini e com as duas', () => {
    const html = render();
    expect(html).toContain('aria-label="Analisar a live com o Claude"');
    expect(html).toContain('aria-label="Analisar a live com o Gemini"');
    expect(html).toContain('aria-label="Analisar a live com o Claude e o Gemini"');
  });

  it('com a dupla em voo e o Gemini na vez, gira o Gemini e "As duas", e os três travam', () => {
    const html = render({ emVoo: 'gemini', asDuasEmVoo: true });
    const [claude, gemini, asDuas] = botoes(html);
    expect(html).toContain('analisando…');
    expect(gemini).toContain('aria-busy="true"');
    expect(asDuas).toContain('aria-busy="true"');
    expect(claude).toContain('aria-busy="false"');
    for (const botao of [claude, gemini, asDuas]) expect(botao).toContain('disabled=""');
  });
});
