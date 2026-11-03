import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FalhaDosCortes, ListaVazia } from '../FalhaDosCortes';
import { falhaDaConsulta } from '../cortesDoWorkspace';

// D-1032 · a falha da API de cortes aparece como falha, com "Tentar de novo",
// e não como live vazia com o convite a "Analisar com a IA".
describe('FalhaDosCortes', () => {
  const html = renderToStaticMarkup(<FalhaDosCortes mensagem="Erro interno do servidor" tentarDeNovo={vi.fn()} />);

  it('mostra a falha e o tentar de novo', () => {
    expect(html).toContain('Não consegui carregar os cortes desta live');
    expect(html).toContain('Erro interno do servidor');
    expect(html).toContain('Tentar de novo');
  });

  it('não oferece a análise nem diz que a live está vazia', () => {
    expect(html).not.toContain('Analisar com a IA');
    expect(html).not.toContain('ainda não tem cortes');
  });
});

describe('ListaVazia e falhaDaConsulta', () => {
  it('live realmente vazia continua oferecendo a análise', () => {
    const h = renderToStaticMarkup(<ListaVazia texto="Esta live ainda não tem cortes" ofereceAnalise analisar={vi.fn()} />);
    expect(h).toContain('Analisar com a IA');
  });

  it('só há falha sem lista em cache', () => {
    const base = { isError: true, error: new Error('x'), refetch: vi.fn() };
    expect(falhaDaConsulta({ ...base, data: undefined })?.mensagem).toBe('x');
    expect(falhaDaConsulta({ ...base, data: [] })).toBeNull();
    expect(falhaDaConsulta({ ...base, isError: false })).toBeNull();
  });
});
