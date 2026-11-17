import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Menu, MenuContent, MenuItem, MenuRotulo, MenuSeparador, MenuTrigger, aoEscolherItem } from '../menu';

// D-1122 (E-069 H-11b): o menu. Sem DOM no teste, o painel é desenhado no lugar
// (`portal={false}`) e aberto à força; a navegação por teclado é do Radix.

const html = (itens: React.ReactNode) =>
  renderToStaticMarkup(
    <Menu open>
      <MenuTrigger>Mais</MenuTrigger>
      <MenuContent portal={false}>{itens}</MenuContent>
    </Menu>,
  );

describe('Menu (D-1122)', () => {
  it('o painel é um menu, com itens, rótulo e separador', () => {
    const h = html(
      <>
        <MenuRotulo>Corte</MenuRotulo>
        <MenuItem atalho="E">Editar</MenuItem>
        <MenuSeparador />
        <MenuItem>Duplicar</MenuItem>
      </>,
    );
    expect(h).toContain('role="menu"');
    expect(h.match(/role="menuitem"/g)).toHaveLength(2);
    expect(h).toContain('Corte');
    expect(h).toContain('role="separator"');
    expect(h).toContain('>E<');
  });

  it('o item desligado é aria-disabled, não disabled, e mantém o motivo no title', () => {
    const h = html(
      <MenuItem desligado title="O corte ainda não foi renderizado">
        Baixar vídeo
      </MenuItem>,
    );
    expect(h).toContain('aria-disabled="true"');
    expect(h).toContain('title="O corte ainda não foi renderizado"');
    // `disabled` de verdade engole o foco e o motivo some (D-439).
    expect(h).not.toMatch(/\sdisabled=/);
    expect(h).not.toContain('data-disabled');
  });

  it('o item ligado não leva a marca de desligado', () => {
    expect(html(<MenuItem>Editar</MenuItem>)).not.toContain('aria-disabled=');
  });

  it('o item perigoso é em erro; o comum, não', () => {
    const [comum, perigoso] = html(
      <>
        <MenuItem>Editar</MenuItem>
        <MenuItem perigo>Riscar</MenuItem>
      </>,
    )
      .split('role="menuitem"')
      .slice(1);
    expect(perigoso).toContain('text-erro');
    expect(comum).not.toContain('text-erro');
  });

  it('a pele é a de quem flutua: fio, sombra de pop e fundo sem backdrop-filter', () => {
    const h = html(<MenuItem>Editar</MenuItem>);
    expect(h).toContain('shadow-pop-luz');
    expect(h).toContain('bg-pop');
    expect(h).not.toMatch(/backdrop/);
  });
});

describe('aoEscolherItem (D-1122)', () => {
  it('o item desligado não age e segura o menu aberto', () => {
    const acao = vi.fn();
    const evento = { preventDefault: vi.fn() };
    aoEscolherItem(true, evento, acao);
    expect(acao).not.toHaveBeenCalled();
    expect(evento.preventDefault).toHaveBeenCalledOnce();
  });

  it('o item ligado age e deixa o menu fechar', () => {
    const acao = vi.fn();
    const evento = { preventDefault: vi.fn() };
    aoEscolherItem(false, evento, acao);
    expect(acao).toHaveBeenCalledOnce();
    expect(evento.preventDefault).not.toHaveBeenCalled();
  });
});
