import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AcaoDeIa, MenuDeIa } from '../acao-de-ia';
import { Scissors } from 'lucide-react';

const render = (props: Partial<Parameters<typeof AcaoDeIa>[0]> = {}) =>
  renderToStaticMarkup(
    <AcaoDeIa rotulo="Gerar trechos" emVoo={null} onGerar={vi.fn()} {...props} />,
  );

const botoes = (html: string) => html.match(/<button[^>]*>/g) ?? [];

describe('AcaoDeIa', () => {
  it('diz a ação uma vez e oferece os dois provedores por ícone', () => {
    const html = render();
    expect(html.match(/Gerar trechos</g)).toHaveLength(1);
    expect(html).toContain('aria-label="Gerar trechos com o Claude"');
    expect(html).toContain('aria-label="Gerar trechos com o Gemini"');
  });

  it('usa a descrição completa para leitor de tela quando o rótulo é curto', () => {
    const html = render({ rotulo: 'Refazer', descricao: 'Refazer o prompt da capa' });
    expect(html).toContain('aria-label="Refazer o prompt da capa com o Gemini"');
    expect(html).toContain('>Refazer<');
  });

  it('em voo: troca o texto, marca quem está gerando e trava os dois', () => {
    const html = render({ emVoo: 'gemini', rotuloEmVoo: 'escrevendo…' });
    expect(html).toContain('escrevendo…');
    const [claude, gemini] = botoes(html);
    expect(gemini).toContain('aria-busy="true"');
    expect(claude).toContain('aria-busy="false"');
    expect(claude).toContain('disabled=""');
    expect(gemini).toContain('disabled=""');
  });

  it('parado, os dois ficam clicáveis', () => {
    for (const botao of botoes(render())) expect(botao).not.toContain('disabled=""');
  });

  it('desabilitado por fora trava mesmo sem geração em voo', () => {
    for (const botao of botoes(render({ desabilitado: true }))) expect(botao).toContain('disabled=""');
  });
});

describe('MenuDeIa', () => {
  it('fechado, mostra só o ícone da ação com o nome acessível', () => {
    const html = renderToStaticMarkup(
      <MenuDeIa rotulo="Gerar trechos de todos os cortes" icone={Scissors} onGerar={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Gerar trechos de todos os cortes"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });
});
