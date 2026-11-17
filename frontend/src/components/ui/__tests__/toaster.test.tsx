import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ToastViewport, type Toast } from '../toaster';

// D-1122 (E-069 H-11b): o aviso. A conta do conteúdo clicável (D-1088) é do teste
// `riscarCorte.d1088`, que segue valendo; aqui vão a região viva e os tons.

const aviso = (tone: Toast['tone']): Toast => ({ id: tone, tone, title: 'Pronto.', message: 'Feito.' });
const html = (toasts: Toast[]) => renderToStaticMarkup(<ToastViewport toasts={toasts} onDismiss={vi.fn()} />);

describe('ToastViewport (D-1122)', () => {
  it('é uma região viva: o leitor de tela anuncia o aviso que entra', () => {
    const h = html([]);
    expect(h).toContain('aria-live="polite"');
    expect(h).toContain('aria-relevant="additions removals"');
  });

  it('o erro é anunciado já (alert); os outros tons, com calma (status)', () => {
    expect(html([aviso('error')])).toContain('role="alert"');
    for (const tom of ['success', 'info', 'warning'] as const) {
      const h = html([aviso(tom)]);
      expect(h).toContain('role="status"');
      expect(h).not.toContain('role="alert"');
    }
  });

  it('cada tom pinta o sinal com o seu token', () => {
    expect(html([aviso('success')])).toContain('--cc-ok');
    expect(html([aviso('info')])).toContain('--cc-info');
    expect(html([aviso('warning')])).toContain('--cc-aviso');
    expect(html([aviso('error')])).toContain('--cc-erro');
  });

  it('o aviso tem título, mensagem e um fechar com nome', () => {
    const h = html([aviso('success')]);
    expect(h).toContain('Pronto.');
    expect(h).toContain('Feito.');
    expect(h).toContain('aria-label="Fechar aviso"');
  });

  it('sobe 74 px do rodapé para não tapar a barra de ações', () => {
    expect(html([])).toContain('bottom-[74px]');
  });

  it('sem backdrop-filter (§3.6)', () => {
    expect(html([aviso('info')])).not.toMatch(/backdrop/);
  });
});
