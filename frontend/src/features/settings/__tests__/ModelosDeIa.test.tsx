import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { PapelModelo } from '../api';
import { CHAVE_MODELOS_IA, ModelosDeIa, opcoesDoPapel } from '../ModelosDeIa';

// D-924: que modelo atende cada faixa, por provedor, com a lista do que existe.

const papel = (over: Partial<PapelModelo> = {}): PapelModelo => ({
  key: 'gemini_pesado',
  provedor: 'gemini',
  rotulo: 'Pesado',
  descricao: 'As mesmas etapas, pelo botão Gemini.',
  valor: 'gemini-3.8-flash-high',
  padrao: 'gemini-3.8-flash-high',
  ...over,
});

describe('opcoesDoPapel', () => {
  it('lista o que o provedor oferece e marca o padrão', () => {
    const opcoes = opcoesDoPapel(papel(), [
      { id: 'gemini-3.8-flash-high', nome: 'Gemini 3.8 Flash (High)' },
      { id: 'gemini-3.8-flash-low', nome: 'Gemini 3.8 Flash (Low)' },
    ]);

    expect(opcoes).toEqual([
      { id: 'gemini-3.8-flash-high', nome: 'Gemini 3.8 Flash (High) · padrão' },
      { id: 'gemini-3.8-flash-low', nome: 'Gemini 3.8 Flash (Low)' },
    ]);
  });

  it('não perde o escolhido que saiu da lista (modelo aposentado ou CLI ausente)', () => {
    const opcoes = opcoesDoPapel(papel({ valor: 'gemini-3.1-pro-high' }), []);

    expect(opcoes.map((o) => o.id)).toEqual(['gemini-3.1-pro-high', 'gemini-3.8-flash-high']);
  });

  it('na API do Gemini, o papel de imagem só lista modelos de imagem', () => {
    const lista = [
      { id: 'gemini-2.5-flash', nome: 'Flash' },
      { id: 'gemini-2.5-flash-image', nome: 'Flash Image' },
    ];
    const imagem = papel({
      key: 'gemini_api_imagem',
      provedor: 'gemini_api',
      valor: 'gemini-2.5-flash-image',
      padrao: 'gemini-2.5-flash-image',
    });
    const texto = papel({
      key: 'gemini_api_texto',
      provedor: 'gemini_api',
      valor: 'gemini-2.5-flash',
      padrao: 'gemini-2.5-flash',
    });

    expect(opcoesDoPapel(imagem, lista).map((o) => o.id)).toEqual(['gemini-2.5-flash-image']);
    expect(opcoesDoPapel(texto, lista).map((o) => o.id)).toEqual(['gemini-2.5-flash']);
  });
});

describe('ModelosDeIa', () => {
  const qc = new QueryClient();
  qc.setQueryData(CHAVE_MODELOS_IA, {
    papeis: [
      papel({ key: 'claude_pesado', provedor: 'claude', valor: 'opus', padrao: 'opus' }),
      papel(),
      papel({ key: 'gemini_api_texto', provedor: 'gemini_api', rotulo: 'Texto', valor: 'x', padrao: 'x' }),
    ],
  });
  const html = renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <ModelosDeIa />
      </ToastProvider>
    </QueryClientProvider>,
  );

  it('agrupa os papéis por provedor', () => {
    expect(html).toContain('Claude (assinatura)');
    expect(html).toContain('Gemini (Antigravity)');
    expect(html).toContain('Gemini (API)');
    expect(html).toContain('aria-label="Gemini (Antigravity) · Pesado"');
  });

  it('mostra o modelo escolhido de cada papel', () => {
    expect(html).toContain('<option value="opus" selected="">opus · padrão</option>');
    expect(html).toContain('value="gemini-3.8-flash-high" selected=""');
  });
});
