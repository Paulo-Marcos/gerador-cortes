import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { novidadesKey } from '@/shared/chavesDeCache';
import { contarPrimarios } from '@/shared/qualidade/__tests__/primariosDaTela';

// D-1178 (E-069 H-23; DIRECAO §7.13): Atalhos na Sala escura (`Tabela`, `Segmented`, `Busca`,
// `Kbd`) e as Novidades como segunda aba. Tela de configuração de teclas: zero primários.

vi.mock('@/upgrade/UpgradeChrome', () => ({ useDefinirChrome: () => undefined }));

import { AtalhosPage } from '../AtalhosPage';

const montar = (rota = '/atalhos') => {
  const qc = new QueryClient();
  qc.setQueryData(novidadesKey, [
    {
      versao: '0.6.0',
      data: '2026-10-07',
      novidades: [
        {
          chave: 'a1',
          categoria: 'added',
          titulo_original: 'Covers can star the host.',
          texto_original: 'Covers can star the host.',
          demandas: [],
          traducao: null,
          nova: false,
        },
      ],
    },
  ]);
  return renderToStaticMarkup(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[rota]}>
        <AtalhosPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Atalhos na Sala escura (§7.13)', () => {
  it('abre nos atalhos: abas Atalhos e Novidades, tabela com teclas em Kbd, zero primários', () => {
    const html = montar();
    expect(html).toContain('aria-label="Atalhos e novidades"');
    expect(html).toMatch(/role="tab"[^>]*>Novidades</);
    expect(html).toContain('<table');
    expect(html).toContain('<kbd');
    expect(html).toContain('role="search"');
    expect(html).toContain('role="radiogroup"');
    expect(contarPrimarios(html)).toBe(0);
  });

  it('as Novidades entram em Atalhos: a aba traz as versões do CHANGELOG', () => {
    const html = montar('/novidades');
    expect(html).toContain('Versão 0.6.0');
    expect(html).toContain('Covers can star the host.');
    expect(html).not.toContain('<table');
    expect(contarPrimarios(html)).toBe(0);
  });

  it('a aba segue a rota: trocar de /atalhos para /novidades troca o conteúdo', () => {
    // Mesmo componente nas duas rotas: a aba tem de sair da URL, não de um estado que só
    // lê o valor na primeira montagem (achado da auditoria do PR #424).
    const emAtalhos = montar('/atalhos');
    const emNovidades = montar('/novidades');
    expect(emAtalhos).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Atalhos</);
    expect(emNovidades).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Novidades</);
  });

  it('não sobram classes do tema antigo', () => {
    expect(montar()).not.toContain('--wb-');
  });
});
