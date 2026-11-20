import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '@/components/ui/toaster';
import type { Canal } from '@/features/channels/api/canais';
import { ListaDeCanais, rotuloDeLives } from '../TrocaDeCanal';

// D-1141 (E-069 §7.9): o popover de troca de canal mostra quantas lives cada canal tem.
// A contagem vem pronta no payload de /api/channels: o popover não faz requisição para isso.

const canal = (c: Partial<Canal>): Canal =>
  ({ id: 'sapo', nome: 'Sapo Analítico', handle: '@sapo', ativo: false, credito: '', youtube_channel_id: '', paleta: { primaria: '', secundaria: '', acento: '' }, luz: [], lives: 0, ...c }) as Canal;

const lista = (canais: Canal[]) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <ToastProvider>
        <MemoryRouter>
          <ListaDeCanais canais={canais} tema="dark" fechar={vi.fn()} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );

describe('o rótulo de lives', () => {
  it('conta 0, 1 e N, no singular só para 1', () => {
    expect(rotuloDeLives(0)).toBe('0 lives');
    expect(rotuloDeLives(1)).toBe('1 live');
    expect(rotuloDeLives(219)).toBe('219 lives');
  });
});

describe('a contagem no popover de troca de canal', () => {
  it('mostra o número de lives de cada canal', () => {
    const html = lista([canal({ ativo: true, lives: 219 }), canal({ id: 'novo', nome: 'Novo', handle: '@novo', lives: 0 }), canal({ id: 'um', nome: 'Um', handle: '@um', lives: 1 })]);
    expect(html).toContain('>219 lives<');
    expect(html).toContain('>0 lives<');
    expect(html).toContain('>1 live<');
  });

  it('payload sem a contagem não escreve "undefined"', () => {
    const sem = { ...canal({ ativo: true }), lives: undefined } as unknown as Canal;
    const html = lista([sem]);
    expect(html).not.toContain('undefined');
    expect(html).not.toMatch(/\blives?</);
  });

  it('não consulta a API para contar: o número é o que já veio no canal', () => {
    // renderToStaticMarkup não roda efeitos, então um fetch num useEffect passaria despercebido.
    // O que garante "nenhuma requisição extra" é a fonte: a lista só lê `c.lives`, sem query,
    // fetch nem efeito próprios (a única chamada de rede dali é a mutação de selecionar, no clique).
    const fonte = readFileSync(resolve(__dirname, '../TrocaDeCanal.tsx'), 'utf8');
    expect(fonte).not.toMatch(/fetch\(|useQuery\(|useEffect\(|api\.(GET|POST)/);
    expect(fonte).toContain('c.lives');
    const cliente = new QueryClient();
    renderToStaticMarkup(
      <QueryClientProvider client={cliente}>
        <ToastProvider>
          <MemoryRouter>
            <ListaDeCanais canais={[canal({ ativo: true, lives: 3 })]} tema="dark" fechar={vi.fn()} />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
    expect(cliente.getQueryCache().getAll()).toHaveLength(0);
  });
});
