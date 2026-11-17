import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EstadoDeErro } from '../estado-de-erro';
import { EstadoCarregando, EstadoVazio } from '../estado-vazio';
import { Skeleton } from '../skeleton';

// Os quatro estados de tela: com dados (a própria lista/tabela), vazio, carregando e erro.
describe('estados de tela', () => {
  it('vazio diz o que não há e o que fazer, com a ação no Button', () => {
    const h = renderToStaticMarkup(
      <EstadoVazio titulo="Nenhuma live" descricao="Cole um link." acao="Colar" aoAgir={() => {}} />,
    );
    expect(h).toContain('data-estado="vazio"');
    expect(h).toContain('Nenhuma live');
    expect(h).toContain('Cole um link.');
    expect(h).toContain('<button');
    expect(h).toContain('>Colar<');
  });

  it('vazio sem ação não desenha botão', () => {
    expect(renderToStaticMarkup(<EstadoVazio titulo="Nada" />)).not.toContain('<button');
  });

  it('a ação do vazio é secundária; primária só quando a tela decide', () => {
    const sec = renderToStaticMarkup(<EstadoVazio titulo="a" acao="Ir" aoAgir={() => {}} />);
    const pri = renderToStaticMarkup(<EstadoVazio titulo="a" acao="Ir" aoAgir={() => {}} acaoPrimaria />);
    expect(sec).not.toContain('bg-feixe');
    expect(pri).toContain('bg-feixe');
  });

  it('carregando anuncia o que busca e os esqueletos são decoração', () => {
    const h = renderToStaticMarkup(<EstadoCarregando frase="Buscando as lives…" linhas={2} />);
    expect(h).toContain('role="status"');
    expect(h).toContain('data-estado="carregando"');
    expect(h).toContain('Buscando as lives…');
    expect(h.match(/data-skeleton/g)).toHaveLength(2);
    expect(h.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('o esqueleto para quando o usuário reduz movimento', () => {
    expect(renderToStaticMarkup(<Skeleton />)).toContain('motion-safe:animate-pulse');
  });

  it('erro usa role=alert, diz o motivo e oferece tentar de novo', () => {
    const h = renderToStaticMarkup(
      <EstadoDeErro titulo="Falhou" motivo="O backend não respondeu." aoTentar={() => {}} />,
    );
    expect(h).toContain('role="alert"');
    expect(h).toContain('data-estado="erro"');
    expect(h).toContain('O backend não respondeu.');
    expect(h).toContain('>Tentar de novo<');
  });

  it('erro sem aoTentar não oferece botão e nunca usa feixe nem íris', () => {
    const h = renderToStaticMarkup(<EstadoDeErro titulo="Falhou" />);
    expect(h).not.toContain('<button');
    expect(h).not.toMatch(/feixe|iris/);
  });
});
