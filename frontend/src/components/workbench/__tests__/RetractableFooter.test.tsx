import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { Settings } from 'lucide-react';
import { RetractableFooter } from '../RetractableFooter';

const noop = vi.fn();

describe('RetractableFooter — rodapé retrátil dos painéis do Workbench (CP9/CP10)', () => {
  it('fechado: mostra o header (ícone + label) mas esconde o conteúdo', () => {
    const html = renderToStaticMarkup(
      <RetractableFooter icon={<Settings size={13} />} label="FERRAMENTAS DO CORTE" open={false} onToggle={noop}>
        <button type="button">Adicionar corte manual</button>
      </RetractableFooter>,
    );

    expect(html).toContain('FERRAMENTAS DO CORTE');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-label="Expandir FERRAMENTAS DO CORTE"');
    expect(html).not.toContain('Adicionar corte manual');
  });

  it('aberto: mostra o header e o conteúdo', () => {
    const html = renderToStaticMarkup(
      <RetractableFooter icon={<Settings size={13} />} label="MAIS AÇÕES" open onToggle={noop}>
        <button type="button">Regerar transcrição</button>
      </RetractableFooter>,
    );

    expect(html).toContain('MAIS AÇÕES');
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('aria-label="Recolher MAIS AÇÕES"');
    expect(html).toContain('Regerar transcrição');
  });
});
