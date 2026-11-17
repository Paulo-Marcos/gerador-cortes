import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { KitFlutua } from '../KitFlutua';

describe('KitFlutua (D-1122)', () => {
  const html = renderToStaticMarkup(
    <ToastProvider>
      <TooltipProvider>
        <KitFlutua />
      </TooltipProvider>
    </ToastProvider>,
  );

  it('traz os gatilhos do menu, do popover, do diálogo, da gaveta e dos quatro toasts', () => {
    expect(html).toContain('Mais ações');
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('Etapas do corte');
    expect(html).toContain('Diálogo destrutivo');
    expect(html).toContain('Gaveta (432 px)');
    for (const tom of ['success', 'info', 'warning', 'error']) expect(html).toContain(`>${tom}<`);
  });

  it('começa com tudo fechado e tem o seletor de tema', () => {
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain('role="menu"');
    expect(html).toContain('aria-label="Tema do kit"');
  });
});
