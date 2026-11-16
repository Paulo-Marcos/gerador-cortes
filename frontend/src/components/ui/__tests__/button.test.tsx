import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../button';

const html = (props: Parameters<typeof Button>[0] = {}) =>
  renderToStaticMarkup(<Button {...props}>Publicar</Button>);

describe('Button — pílula de luz (D-1114)', () => {
  it('o primário é o feixe, em luz e sem relevo', () => {
    const h = html({ variant: 'primario' });
    expect(h).toContain('data-variant="primario"');
    expect(h).toContain('bg-feixe');
    expect(h).toContain('text-sobre-feixe');
    expect(h).toContain('rounded-pilula');
    // Luz, não relevo: nenhuma aresta dura embaixo (a "tecla" que o Paulo recusou).
    expect(h).not.toMatch(/border-b-\d|shadow-\[0_\d+px_0/);
  });

  it.each(['primario', 'secundario', 'fantasma', 'destrutivo', 'destrutivo-cheio', 'icone'] as const)(
    '%s nunca usa backdrop-filter (§3.6: o desfoque é da casca)',
    (variant) => {
      expect(html({ variant })).not.toContain('backdrop');
    },
  );

  it('só o primário usa o feixe', () => {
    for (const variant of ['secundario', 'fantasma', 'destrutivo', 'icone'] as const) {
      expect(html({ variant })).not.toContain('bg-feixe');
    }
  });

  it('as variantes novas dizem o que são no data-variant', () => {
    for (const variant of ['secundario', 'fantasma', 'destrutivo', 'destrutivo-cheio', 'icone'] as const) {
      expect(html({ variant })).toContain(`data-variant="${variant}"`);
    }
  });

  it('apertar é só transform: encolhe 3% e o layout não depende disso', () => {
    const h = html({ variant: 'primario' });
    expect(h).toContain('active:scale-[.97]');
    expect(h).toContain('active:brightness-[.94]');
    expect(h).toContain('motion-reduce:active:scale-100');
    expect(h).not.toMatch(/active:(p|m|w|h|top|left|translate)[-x y]/);
  });

  it('hover acende e foco aparece por :focus-visible', () => {
    const h = html({ variant: 'primario' });
    expect(h).toContain('hover:brightness-[1.07]');
    expect(h).toContain('focus-visible:outline-foco');
    expect(html({ variant: 'secundario' })).toContain('hover:bg-vidro-3');
  });

  it('desabilitado perde o fundo e o feixe', () => {
    const h = html({ variant: 'primario', disabled: true });
    expect(h).toContain('disabled=""');
    expect(h).toContain('disabled:bg-none');
    expect(h).toContain('disabled:text-fg-off');
  });

  it('carregando: aria-busy, giro e sem disabled (o foco do teclado fica)', () => {
    const h = html({ variant: 'primario', carregando: true });
    expect(h).toContain('aria-busy="true"');
    expect(h).toContain('animate-spin');
    expect(h).not.toContain('disabled=""');
    expect(html({ variant: 'primario' })).not.toContain('aria-busy="');
  });

  it('tamanhos 30 / 38 / 46 px', () => {
    expect(html({ variant: 'secundario', size: 'pq' })).toContain('h-botao-pq');
    expect(html({ variant: 'secundario', size: 'md' })).toContain('h-botao-md');
    expect(html({ variant: 'secundario', size: 'gd' })).toContain('h-botao-gd');
  });

  it('o tamanho antigo é lido na escala nova quando a variante é nova', () => {
    expect(html({ variant: 'fantasma', size: 'sm' })).toContain('h-botao-pq');
    expect(html({ variant: 'fantasma' })).toContain('h-botao-md');
    expect(html({ variant: 'fantasma', size: 'icon' })).toContain('aspect-square');
  });

  it('a variante icone é círculo de vidro', () => {
    const h = html({ variant: 'icone', 'aria-label': 'Fechar' } as never);
    expect(h).toContain('aspect-square');
    expect(h).toContain('bg-vidro-2');
  });

  it('o tema é por token: nenhuma cor fixa nas variantes novas', () => {
    for (const variant of ['primario', 'secundario', 'fantasma', 'destrutivo', 'destrutivo-cheio'] as const) {
      expect(html({ variant })).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });
});

describe('Button — a API antiga segue atendida (nenhuma tela muda)', () => {
  const ANTIGAS = {
    default: 'btn btn-pri',
    outline: 'btn',
    ghost: 'btn btn-ghost',
    danger: 'btn btn-danger',
    secondary: 'btn btn-soft',
  } as const;

  it.each(Object.entries(ANTIGAS))('%s continua desenhado por "%s"', (variant, classes) => {
    const h = html({ variant: variant as keyof typeof ANTIGAS });
    expect(h).toContain(`class="${classes} `);
    expect(h).toContain(`data-variant="${variant}"`);
    expect(h).not.toContain('rounded-pilula');
  });

  it('sem props é o `default` de sempre, no tamanho de sempre', () => {
    const h = html();
    expect(h).toContain('class="btn btn-pri [&amp;_svg]:size-4');
    expect(html({ size: 'sm' })).toContain('btn btn-pri btn-sm');
    expect(html({ size: 'icon-sm' })).toContain('btn-icon btn-sm');
  });

  it('asChild mantém o filho, sem giro dentro', () => {
    const h = renderToStaticMarkup(
      <Button asChild carregando>
        <a href="/x">Abrir</a>
      </Button>,
    );
    expect(h).toContain('<a ');
    expect(h).not.toContain('animate-spin');
  });
});
