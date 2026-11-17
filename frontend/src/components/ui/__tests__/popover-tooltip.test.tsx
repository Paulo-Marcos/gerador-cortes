import * as RT from '@radix-ui/react-tooltip';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { Tooltip, TooltipContent, TooltipProvider } from '../tooltip';

// D-1122 (E-069 H-11b): popover e tooltip. O portal fica de fora no servidor.

describe('Popover (D-1122)', () => {
  const h = renderToStaticMarkup(
    <Popover open>
      <PopoverTrigger>Etapas</PopoverTrigger>
      <PopoverContent portal={false}>7 de 8 etapas</PopoverContent>
    </Popover>,
  );

  it('o gatilho anuncia o diálogo que abre e se está aberto', () => {
    expect(h).toContain('aria-haspopup="dialog"');
    expect(h).toContain('aria-expanded="true"');
  });

  it('o conteúdo é um diálogo flutuante, em luz e sem backdrop-filter', () => {
    expect(h).toContain('role="dialog"');
    expect(h).toContain('7 de 8 etapas');
    expect(h).toContain('shadow-pop-luz');
    expect(h).not.toMatch(/backdrop/);
  });
});

describe('Tooltip (D-1122)', () => {
  it('a API antiga segue: Tooltip({ label, children, side }) com o provedor da raiz', () => {
    const h = renderToStaticMarkup(
      <TooltipProvider>
        <Tooltip label="Fechar a live" side="bottom">
          <button>x</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(h).toContain('<button');
    expect(h).toContain('data-state="closed"');
  });

  it('a dica aberta é o papel `tooltip`, em luz e com a fonte da escala', () => {
    const h = renderToStaticMarkup(
      <TooltipProvider>
        <RT.Root open>
          <RT.Trigger>x</RT.Trigger>
          <TooltipContent portal={false}>Fechar a live</TooltipContent>
        </RT.Root>
      </TooltipProvider>,
    );
    expect(h).toContain('role="tooltip"');
    expect(h).toContain('Fechar a live');
    expect(h).toContain('text-pequeno');
    expect(h).not.toMatch(/backdrop/);
  });
});
