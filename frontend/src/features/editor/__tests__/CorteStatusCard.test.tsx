import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CorteStatusCard } from '../CorteStatusCard';

const noop = vi.fn();

function render(node: React.ReactElement) {
  return renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);
}

describe('CorteStatusCard — metadados pela sidebar', () => {
  it('renderiza os ícones T/Imagem como botões que abrem os metadados quando há onOpenMetadata', () => {
    const html = render(
      <CorteStatusCard
        numero={3}
        titulo="Corte teste"
        status={undefined}
        ativo={false}
        onSelect={noop}
        onOpenMetadata={noop}
      />,
    );

    // Dois botões de metadados (T = texto, Imagem = thumbnail).
    expect(html).toContain('aria-label="Abrir metadados — título e descrição"');
    expect(html).toContain('aria-label="Abrir metadados — thumbnail"');
    // O medalhão vira o botão de navegação do corte.
    expect(html).toContain('aria-label="Corte 3: Corte teste"');
    // Não deve sobrar o rótulo de status passivo.
    expect(html).not.toContain('aria-label="Status dos metadados"');
  });

  it('permanece apenas como indicador de status quando não há onOpenMetadata', () => {
    const html = render(
      <CorteStatusCard numero={1} titulo="Outro" status={undefined} ativo={false} />,
    );

    expect(html).toContain('aria-label="Status dos metadados"');
    expect(html).not.toContain('Abrir metadados');
  });
});
