import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AudioSyncControl } from '../AudioSyncControl';

const noop = vi.fn();

function renderWorkbench(props: Partial<Parameters<typeof AudioSyncControl>[0]> = {}) {
  return renderToStaticMarkup(
    <TooltipProvider>
      <AudioSyncControl variant="workbench" offsetMs={0} onChange={noop} {...props} />
    </TooltipProvider>,
  );
}

// D-601: a faixa do Workbench nasceu sem o toggle de preview e, como o shell
// legado deixou de ser alcancavel, o operador ajustava ms sem nunca ouvir o
// resultado. Estes testes prendem o interruptor no lugar.
describe('AudioSyncControl no Workbench', () => {
  it('oferece o toggle de preview ao vivo', () => {
    const html = renderWorkbench({ onTogglePreview: noop, canPreview: true });
    expect(html).toContain('aria-label="Preview de sincronia de áudio"');
    expect(html).toContain('aria-pressed="false"');
  });

  it('marca o toggle como ligado quando o preview esta ativo', () => {
    const html = renderWorkbench({
      onTogglePreview: noop,
      canPreview: true,
      previewEnabled: true,
    });
    expect(html).toContain('aria-pressed="true"');
  });

  it('desabilita o toggle quando nao ha proxy de audio para ouvir', () => {
    const html = renderWorkbench({ onTogglePreview: noop, canPreview: false });
    expect(html).toContain('disabled=""');
  });

  // Decodificar o audio do corte leva ~7s: botao aceso que ainda nao toca nada
  // e indistinguivel de botao quebrado, que foi a queixa original.
  it('avisa que esta preparando o audio enquanto o preview carrega', () => {
    const html = renderWorkbench({
      onTogglePreview: noop,
      previewEnabled: true,
      previewEstado: 'carregando',
    });
    expect(html).toContain('Preparando o áudio');
    expect(html).toContain('animate-spin');
  });

  it('avisa quando o audio do corte nao carregou', () => {
    const html = renderWorkbench({
      onTogglePreview: noop,
      previewEnabled: true,
      previewEstado: 'erro',
    });
    expect(html).toContain('Áudio indisponível');
    expect(html).not.toContain('animate-spin');
  });

  it('nao pisca carregando quando o preview ja esta pronto', () => {
    const html = renderWorkbench({
      onTogglePreview: noop,
      previewEnabled: true,
      previewEstado: 'pronto',
    });
    expect(html).toContain('Sincronia do áudio');
    expect(html).not.toContain('Preparando');
  });
});
