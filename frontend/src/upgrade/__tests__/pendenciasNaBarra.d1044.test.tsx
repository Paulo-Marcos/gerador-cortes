import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ActionBar } from '../ActionBar';

// D-1044: a barra é o único ponto que desenha as pendências nas três telas de um corte.

const PENDENCIA = <span>cenas por validar</span>;
const PRIMARIO = { texto: 'Renderizar final', icone: 'play' as const, onClick: vi.fn() };

describe('D-1044 · as pendências na barra de ações', () => {
  it('desenha o que ficou em aberto', () => {
    expect(renderToStaticMarkup(<ActionBar barra={{ pendencias: PENDENCIA, primario: PRIMARIO }} />)).toContain('cenas por validar');
  });

  it('a pendência vem depois do veredito e antes dos botões', () => {
    const html = renderToStaticMarkup(
      <ActionBar
        barra={{
          veredito: { aprovado: true, onAlternar: vi.fn() },
          pendencias: PENDENCIA,
          primario: PRIMARIO,
        }}
      />,
    );
    expect(html.indexOf('Aprovado')).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('Aprovado')).toBeLessThan(html.indexOf('cenas por validar'));
    expect(html.indexOf('cenas por validar')).toBeLessThan(html.indexOf('Renderizar final'));
  });

  it('o primário segue liberado com pendência: ela só avisa (RN-42)', () => {
    const html = renderToStaticMarkup(<ActionBar barra={{ pendencias: PENDENCIA, primario: PRIMARIO }} />);
    const botao = /<button[^>]*>(?:(?!<\/button>).)*Renderizar final/s.exec(html)?.[0] ?? '';
    expect(botao).toContain('Renderizar final');
    expect(botao).not.toContain('disabled');
  });
});
