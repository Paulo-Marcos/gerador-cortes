import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Chip } from '../chip';

describe('Chip', () => {
  it('desligado: aria-pressed=false, sem visto, botão que não envia formulário', () => {
    const h = renderToStaticMarkup(<Chip>Prontos</Chip>);
    expect(h).toContain('aria-pressed="false"');
    expect(h).toContain('type="button"');
    expect(h).not.toContain('data-marca="visto"');
  });

  it('ligado: aria-pressed=true e visto (a forma, não só a cor)', () => {
    const h = renderToStaticMarkup(<Chip pressionado>Prontos</Chip>);
    expect(h).toContain('aria-pressed="true"');
    expect(h).toContain('data-marca="visto"');
    expect(h).toContain('aria-pressed:bg-iris-suave');
  });

  it('mostra a contagem em mono, inclusive o zero', () => {
    expect(renderToStaticMarkup(<Chip contagem={6}>Prontos</Chip>)).toContain('font-mono');
    expect(renderToStaticMarkup(<Chip contagem={0}>Prontos</Chip>)).toContain('>0<');
  });

  it('tem anel de foco visível e variante de desabilitado tracejado', () => {
    const h = renderToStaticMarkup(<Chip disabled>Prontos</Chip>);
    expect(h).toContain('disabled=""');
    expect(h).toContain('focus-visible:outline-foco');
    expect(h).toContain('disabled:border-dashed');
  });

  it('é pílula e não usa backdrop-filter', () => {
    const h = renderToStaticMarkup(<Chip>x</Chip>);
    expect(h).toContain('rounded-pilula');
    expect(h).not.toContain('backdrop');
  });
});
