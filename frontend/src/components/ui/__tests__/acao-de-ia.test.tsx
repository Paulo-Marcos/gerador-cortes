import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AcaoDeIa, MenuDeIa } from '../acao-de-ia';

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

  // D-861: desde a D-857 os ícones da ação passam pelo Icon, na escala.
  it.each([
    ['sm', '14'],
    ['md', '16'],
  ] as const)('tamanho %s: o ícone da ação sai a %s px, com traço 1,75', (tamanho, px) => {
    // O "IA gera" da prancha é a estrela simples (sparkle), não os brilhinhos (D-858).
    const faisca = render({ tamanho }).match(/<svg[^>]*lucide-sparkle"[^>]*>/)?.[0] ?? '';
    expect(faisca).toContain(`width="${px}"`);
    expect(faisca).toContain('stroke-width="1.75"');
  });

  // D-858: a ação pode dizer o seu desenho — analisar com a IA é o cérebro.
  it('com icone, desenha esse ícone no lugar do "IA gera"', () => {
    const html = render({ icone: 'brain' });
    const rotulo = html.slice(0, html.indexOf('<button'));
    expect(rotulo).toMatch(/<svg[^>]*lucide-brain/);
    expect(rotulo).not.toContain('lucide-sparkle');
  });

  it('em voo, o ícone da ação vira o spinner', () => {
    const html = render({ emVoo: 'claude' });
    // Só o rótulo: o botão do provedor em voo também gira e casaria sozinho.
    const rotulo = html.slice(0, html.indexOf('<button'));
    expect(rotulo).toMatch(/<svg[^>]*lucide-loader-circle[^>]*animate-spin/);
    expect(rotulo).not.toContain('lucide-sparkle"');
  });
});

describe('MenuDeIa', () => {
  it('fechado, mostra só o ícone da ação com o nome acessível', () => {
    const html = renderToStaticMarkup(
      <MenuDeIa rotulo="Gerar trechos de todos os cortes" icone="scissors" onGerar={vi.fn()} />,
    );
    expect(html).toContain('aria-label="Gerar trechos de todos os cortes"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('role="menu"');
  });

  // D-861: o gatilho recebe o NOME do ícone (D-857) e o desenha a 16 px.
  it('desenha no gatilho o ícone do nome recebido, a 16 px', () => {
    const html = renderToStaticMarkup(
      <MenuDeIa rotulo="Gerar trechos de todos os cortes" icone="scissors" onGerar={vi.fn()} />,
    );
    const tesoura = html.match(/<svg[^>]*lucide-scissors[^>]*>/)?.[0] ?? '';
    expect(tesoura).toContain('width="16"');
    expect(tesoura).toContain('stroke-width="1.75"');
  });

  it('ocupado, o gatilho gira e trava', () => {
    const html = renderToStaticMarkup(
      <MenuDeIa rotulo="Gerar trechos" icone="scissors" onGerar={vi.fn()} ocupado />,
    );
    expect(html).toMatch(/<svg[^>]*lucide-loader-circle[^>]*animate-spin/);
    expect(html).not.toContain('lucide-scissors');
    expect(botoes(html)[0]).toContain('disabled=""');
  });
});
