import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import postcss from 'postcss';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import tailwind from 'tailwindcss';
import { describe, expect, it, vi } from 'vitest';
import config from '../../../../tailwind.config';
import App from '@/App';
import { AvisoSincronizacao } from '../AvisoSincronizacao';
import type { sincronizacaoApi } from '../api';

// D-879: o aviso flutuava (`fixed`, z-50) sobre os 31 px de cima da barra
// superior. Medido na verificação da D-870: `elementFromPoint` no centro do
// "Mais" do editor devolvia o aviso, e o clique não chegava ao botão.

vi.mock('@/components/layout/AppShell', () => ({
  AppShell: () => <nav data-casca="">casca</nav>,
}));

type Estado = Awaited<ReturnType<typeof sincronizacaoApi.estado>>;

const EM_DIA: Estado = {
  em_dia: true,
  backend_velho: false,
  commit_rodando: 'abc1234',
  commit_disco: 'abc1234',
  dependencias_faltando: [],
  colunas_pendentes: [],
  troca_de_canal_pendente: false,
  canal_escolhido: 'sapo',
  canal_em_uso: 'sapo',
};

const BACKEND_VELHO: Estado = {
  ...EM_DIA,
  em_dia: false,
  backend_velho: true,
  commit_disco: 'def5678',
};

function desenhar(no: ReactNode, estado: Estado) {
  const cliente = new QueryClient();
  cliente.setQueryData(['sincronizacao'], estado);
  return renderToStaticMarkup(<QueryClientProvider client={cliente}>{no}</QueryClientProvider>);
}

const classesDoAviso = (html: string) => /<div role="status" class="([^"]*)"/.exec(html)?.[1] ?? '';
const estiloDe = (html: string, antesDe: string) =>
  new RegExp(`<div style="([^"]*)">${antesDe}`).exec(html)?.[1] ?? '';

/** O CSS que o Tailwind gera de verdade para estas classes. */
async function cssDas(classes: string) {
  const saida = await postcss([
    tailwind({
      ...config,
      content: [{ raw: `<div class="${classes}"></div>`, extension: 'html' }],
      corePlugins: { preflight: false },
    }),
  ]).process('@tailwind utilities;', { from: undefined });
  return saida.css;
}

describe('AvisoSincronizacao · continua visível', () => {
  it('com o backend atrás do disco, diz os dois commits e pede o restart', () => {
    const html = desenhar(<AvisoSincronizacao />, BACKEND_VELHO);
    expect(html).toContain('role="status"');
    expect(html).toContain('Fora de sincronia.');
    expect(html).toMatch(/backend rodando <code[^>]*>abc1234<\/code>, disco em/);
    expect(html).toMatch(/<code[^>]*>def5678<\/code> — reinicie/);
  });

  it('em dia, não ocupa espaço nenhum', () => {
    expect(desenhar(<AvisoSincronizacao />, EM_DIA)).toBe('');
  });
});

describe('AvisoSincronizacao · não cobre a casca', () => {
  it('não flutua: nenhuma classe dele tira a caixa do fluxo', async () => {
    const css = await cssDas(classesDoAviso(desenhar(<AvisoSincronizacao />, BACKEND_VELHO)));
    expect(css).not.toMatch(/position:\s*(fixed|absolute|sticky)/);
    expect(css).not.toMatch(/z-index/);
  });

  it('não encolhe na coluna: guarda a própria altura', async () => {
    const css = await cssDas(classesDoAviso(desenhar(<AvisoSincronizacao />, BACKEND_VELHO)));
    expect(css).toMatch(/flex:\s*none/);
  });
});

describe('App · o aviso empurra a casca', () => {
  it('monta uma coluna da altura da janela, com o aviso antes da casca', () => {
    const html = desenhar(<App />, BACKEND_VELHO);
    expect(html.startsWith('<div style="display:flex;flex-direction:column;height:100dvh">')).toBe(
      true,
    );
    expect(html.indexOf('Fora de sincronia.')).toBeLessThan(html.indexOf('data-casca'));
  });

  it('a casca fica com o resto da coluna, e pode encolher para caber', () => {
    const estilo = estiloDe(desenhar(<App />, BACKEND_VELHO), '<nav data-casca');
    expect(estilo).toBe('flex:1 1 0;min-height:0');
  });

  it('sem aviso, a casca fica com a coluna inteira', () => {
    const html = desenhar(<App />, EM_DIA);
    expect(html).not.toContain('role="status"');
    expect(estiloDe(html, '<nav data-casca')).toBe('flex:1 1 0;min-height:0');
  });

  it('a casca mede o espaço que o App lhe dá, não a janela', () => {
    // Com 100dvh a casca teria a janela inteira debaixo do aviso, e os 31 px
    // dele sairiam do pé da tela — o rodapé do Workspace (D-870) mora lá.
    const casca = readFileSync(resolve(__dirname, '../../../upgrade/UpgradeShell.tsx'), 'utf-8');
    expect(casca).toContain("height: '100%',");
    expect(casca).not.toContain('100dvh');
  });
});
