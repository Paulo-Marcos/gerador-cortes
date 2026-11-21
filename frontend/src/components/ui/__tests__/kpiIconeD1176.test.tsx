import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Kpi } from '../kpi';

// D-1176 (DIRECAO §7.8): o rótulo do KPI pode levar um ícone; sem `icone` o rótulo sai como antes.
describe('Kpi · ícone no rótulo', () => {
  it('com `icone`, o glifo vem antes do rótulo', () => {
    const html = renderToStaticMarkup(<Kpi rotulo="Retenção" icone="trending-up" valor={42} />);
    expect(html).toMatch(/<svg[\s\S]*<\/svg>Retenção/);
  });

  it('sem `icone`, não há glifo no rótulo', () => {
    expect(renderToStaticMarkup(<Kpi rotulo="Retenção" valor={42} />)).not.toContain('<svg');
  });

  it('o ícone não mexe na regra do "Sem dados": o motivo continua aparecendo', () => {
    const html = renderToStaticMarkup(<Kpi rotulo="Retenção" icone="trending-up" motivo="Nada sincronizado" />);
    expect(html).toContain('Sem dados');
    expect(html).toContain('Nada sincronizado');
  });
});
