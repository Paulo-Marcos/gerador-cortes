import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ScreenHeader } from '../ScreenHeader';
import type { Chrome } from '../UpgradeChrome';
import { UpgradeShell } from '../UpgradeShell';

// D-1151: o Chrome da tela pode escolher a palavra do feixe (`destaque`) e o
// `sobretitulo`. Sem os campos, o cabeçalho é o de sempre.

const declarado = vi.hoisted(() => ({ chrome: {} as Chrome }));

vi.mock('../UpgradeChrome', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../UpgradeChrome')>()),
  useChrome: () => declarado.chrome,
}));

function casca(rota: string, chrome: Chrome) {
  declarado.chrome = chrome;
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[rota]}>
        <UpgradeShell>
          <div />
        </UpgradeShell>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const feixeNoH1 = (html: string) => /<h1[^>]*>.*?<\/h1>/.exec(html)![0].match(/text-feixe[^>]*>([^<]*)</)?.[1];

beforeEach(() => {
  declarado.chrome = {};
});

describe('o cabeçalho que a tela escolhe (D-1151)', () => {
  it('o destaque acende o trecho pedido, no meio do título', () => {
    const html = renderToStaticMarkup(<ScreenHeader titulo="Boa noite, Paulo." destaque="Paulo" />);
    expect(html).toMatch(/>Boa noite, <span class="[^"]*text-feixe[^"]*">Paulo<\/span>\.<\/h1>/);
  });

  it('destaque null: nenhuma palavra no feixe', () => {
    const html = renderToStaticMarkup(<ScreenHeader titulo="Boa noite." destaque={null} />);
    expect(html).not.toContain('text-feixe');
    expect(html).toMatch(/>Boa noite\.<\/h1>/);
  });

  it('a casca leva o destaque e o sobretítulo da tela ao cabeçalho', () => {
    const html = casca('/projetos', { titulo: 'Boa noite.', destaque: null, sobretitulo: 'sex, 20 de nov' });
    expect(feixeNoH1(html)).toBeUndefined();
    expect(html).toContain('>sex, 20 de nov</p>');
    expect(html).not.toContain('>Produção</p>');
  });

  it('outra tela, sem os campos: a última palavra no feixe e o grupo do trilho', () => {
    const html = casca('/analises', { titulo: 'Análises do canal' });
    expect(feixeNoH1(html)).toBe('canal');
    expect(html).toContain('>Inteligência</p>');
  });
});
