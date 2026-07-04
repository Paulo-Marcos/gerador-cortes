import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SegmentoDetectadoPopover } from '../SegmentoDetectadoPopover';
import type { SegmentoDetectado } from '@/types/models';

const segmento: SegmentoDetectado = {
  inicio: 12.5,
  fim: 27.3,
  score: 0.6,
  status: 'sugerido',
};

function renderPopover(overrides: Partial<{ disabled: boolean }> = {}) {
  return renderToStaticMarkup(
    <SegmentoDetectadoPopover
      segmento={segmento}
      indice={0}
      anchor={{ left: 100, top: 50 }}
      disabled={overrides.disabled ?? false}
      onDecidir={vi.fn()}
      onFechar={vi.fn()}
    />,
  );
}

describe('SegmentoDetectadoPopover', () => {
  it('renderiza as 3 opcoes neutras (Rejeitar / FULL / Compart.)', () => {
    const html = renderPopover();

    expect(html).toContain('Rejeitar');
    expect(html).toContain('FULL');
    expect(html).toContain('Compart.');
  });

  it('mostra os tempos do segmento no header', () => {
    const html = renderPopover();

    // segParaMmSs com true => "MM:SS" formato.
    expect(html).toContain('00:12');
    expect(html).toContain('00:27');
    expect(html).toContain('Segmento detectado');
  });

  it('inclui botao de fechar acessivel', () => {
    const html = renderPopover();

    expect(html).toContain('aria-label="Fechar"');
  });

  it('marca botoes como disabled quando uma decisao esta em andamento', () => {
    const html = renderPopover({ disabled: true });

    // Pelo menos um botao deve aparecer com `disabled` ativo.
    expect(html.match(/disabled=""/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('nao pre-seleciona nenhuma opcao (botoes neutros lado a lado)', () => {
    const html = renderPopover();

    // Nenhum dos botoes deve ter aria-pressed=true (decisao Paulo: sem magica).
    expect(html).not.toContain('aria-pressed="true"');
  });
});
