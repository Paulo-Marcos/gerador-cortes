import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { GlobalRail } from '../GlobalRail';
import { menuDoTrilho } from '../upgradeRoutes';

// D-1195 (E-069 H-25; DIRECAO §8.2 Semântica): recolhido, o item do trilho é só o ícone.
// A auditoria achou os links das telas de live (onde o trilho recolhe) com o nome
// vindo só do `title`, que leitor de tela e ponteiro tratam como dica, não como nome.

const recolhido = () =>
  renderToStaticMarkup(
    <MemoryRouter initialEntries={['/projetos']}>
      <GlobalRail expandido={false} onAlternar={vi.fn()} telaAtual="biblioteca" menu={menuDoTrilho()} />
    </MemoryRouter>,
  );

describe('trilho recolhido', () => {
  it('cada link só de ícone tem aria-label com o nome da tela', () => {
    const links = recolhido().match(/<a [^>]*>/g) ?? [];
    expect(links.length).toBeGreaterThan(5);
    for (const link of links) expect(link).toMatch(/aria-label="[^"]+"/);
    expect(recolhido()).toMatch(/<a [^>]*aria-label="Biblioteca"/);
  });

  it('o aviso do item entra no nome, já que o aria-label cobre o ponto', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/projetos']}>
        <GlobalRail expandido={false} onAlternar={vi.fn()} telaAtual="biblioteca" menu={menuDoTrilho()} avisos={{ novidades: '2 novidades' }} />
      </MemoryRouter>,
    );
    expect(html).toMatch(/<a [^>]*aria-label="Novidades, 2 novidades"/);
  });

  it('aberto, o texto visível continua sendo o nome (sem aria-label repetido)', () => {
    const aberto = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/projetos']}>
        <GlobalRail expandido onAlternar={vi.fn()} telaAtual="biblioteca" menu={menuDoTrilho()} />
      </MemoryRouter>,
    );
    expect(aberto).not.toMatch(/<a [^>]*aria-label="Biblioteca"/);
  });
});
