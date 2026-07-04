import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ControlsPanel } from '../ControlsPanel';

const noop = vi.fn();

function renderControls(collapsed: boolean) {
  return renderToStaticMarkup(
    <ControlsPanel
      inicioHms="00:01:00"
      fimHms="00:02:00"
      inicioSeg={60}
      fimSeg={120}
      currentTime={75}
      desvios={[]}
      collapsed={collapsed}
      onToggleCollapsed={noop}
      onChangeInicio={noop}
      onChangeFim={noop}
    />,
  );
}

describe('ControlsPanel tempos recolhiveis', () => {
  it('mostra os tempos e o botao de ocultar quando expandido', () => {
    const html = renderControls(false);

    expect(html).toContain('No corte');
    expect(html).toContain('No original');
    expect(html).toContain('Intervalo');
    expect(html).toContain('aria-label="Ocultar tempos"');
  });

  it('mantem apenas o gatilho de mostrar quando recolhido', () => {
    const html = renderControls(true);

    expect(html).toContain('Tempos ocultos');
    expect(html).toContain('aria-label="Mostrar tempos"');
    expect(html).not.toContain('No corte');
    expect(html).not.toContain('Intervalo');
  });
});
