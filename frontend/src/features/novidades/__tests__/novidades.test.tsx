import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { novidadesKey } from '@/shared/chavesDeCache';
import { GlobalRail } from '@/upgrade/GlobalRail';
import { destinosDaPaleta, menuDoTrilho, telaDaRota } from '@/upgrade/upgradeRoutes';
import type { Novidade, VersaoDasNovidades } from '../api';
import { CartaoDaNovidade } from '../CartaoDaNovidade';
import NovidadesPage from '../NovidadesPage';
import {
  avisoDasNovidades,
  passosDoComoUsar,
  rotuloDaCategoria,
  textoCorrido,
  tituloDaVersao,
  trechosComCodigo,
} from '../rotulos';
import { versaoParaTraduzir } from '../useNovidades';

// D-922: a tela de Novidades — o CHANGELOG em português, com o "como usar".

const EM_INGLES: Novidade = {
  chave: 'a1',
  categoria: 'added',
  titulo_original: 'Covers can star the host.',
  texto_original: '**Covers can star the host.** Canais gains "Estilo das capas".',
  demandas: ['D-909'],
  traducao: null,
  nova: true,
};

const TRADUZIDA: Novidade = {
  ...EM_INGLES,
  chave: 'b2',
  nova: false,
  traducao: {
    titulo: 'A capa pode ter o apresentador',
    resumo: 'Em vez do mascote, a capa pode trazer o `apresentador` da live.',
    como_usar: '1. Abra Canais → "Estilo das capas".\n2. Escolha o protagonista.',
  },
};

const versao = (v: string, data: string | null, novidades: Novidade[]): VersaoDasNovidades => ({
  versao: v,
  data,
  novidades,
});

describe('rótulos', () => {
  it('cada categoria tem nome em português e a desconhecida passa como veio', () => {
    expect(rotuloDaCategoria('added').rotulo).toBe('Novo');
    expect(rotuloDaCategoria('fixed').rotulo).toBe('Corrigido');
    expect(rotuloDaCategoria('outra')).toEqual({ rotulo: 'outra', tom: 'mute' });
  });

  it('a data da versão não muda de dia com o fuso', () => {
    expect(tituloDaVersao('0.6.0', '2026-10-07')).toBe('Versão 0.6.0 · 7 out 2026');
    expect(tituloDaVersao('0.6.0', null)).toBe('Versão 0.6.0');
    expect(tituloDaVersao('Unreleased', null)).toMatch(/ainda sem número/);
  });

  it('o como usar vira passos, sem a numeração ou o marcador', () => {
    expect(passosDoComoUsar('1. Abra Canais.\n- Escolha.\n\n• Salve.')).toEqual([
      'Abra Canais.',
      'Escolha.',
      'Salve.',
    ]);
    expect(passosDoComoUsar('')).toEqual([]);
  });

  it('o original sai sem o título em negrito e sem as quebras de 80 colunas', () => {
    const texto = '**Covers.** Canais gains\na section:\n- one item\n  that wraps\n- two';
    expect(textoCorrido(texto)).toBe('Canais gains a section:\n- one item that wraps\n- two');
    expect(textoCorrido('Plain entry.')).toBe('Plain entry.');
  });

  it('o que vem entre crases vira trecho de código', () => {
    expect(trechosComCodigo('use `*Game*` no gancho')).toEqual([
      { texto: 'use ', codigo: false },
      { texto: '*Game*', codigo: true },
      { texto: ' no gancho', codigo: false },
    ]);
  });

  it('o aviso do trilho concorda com o número', () => {
    expect(avisoDasNovidades(1)).toBe('1 novidade que você ainda não viu');
    expect(avisoDasNovidades(3)).toBe('3 novidades que você ainda não viu');
  });
});

describe('tradução automática', () => {
  const versoes = [
    versao('Unreleased', null, [TRADUZIDA]),
    versao('0.6.0', '2026-10-07', [EM_INGLES]),
    versao('0.5.0', '2026-09-28', [EM_INGLES]),
  ];

  it('traduz a primeira versão aberta que ainda tem inglês', () => {
    const abertas = new Set(['Unreleased', '0.6.0', '0.5.0']);
    expect(versaoParaTraduzir(versoes, abertas, new Set())?.versao).toBe('0.6.0');
  });

  it('versão fechada ou parada fica de fora', () => {
    expect(versaoParaTraduzir(versoes, new Set(['Unreleased']), new Set())).toBeUndefined();
    const abertas = new Set(['0.6.0', '0.5.0']);
    expect(versaoParaTraduzir(versoes, abertas, new Set(['0.6.0']))?.versao).toBe('0.5.0');
  });
});

describe('trilho e rotas', () => {
  it('Novidades é item de Ferramentas, da paleta e da rota /novidades', () => {
    expect(menuDoTrilho().ferramentas.map((i) => i.id)).toContain('novidades');
    expect(destinosDaPaleta().map((d) => d.ir)).toContain('/novidades');
    expect(telaDaRota('/novidades')).toBe('novidades');
  });

  const trilho = (avisos?: { novidades?: string }) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <GlobalRail
          expandido
          onAlternar={() => {}}
          telaAtual="biblioteca"
          menu={menuDoTrilho()}
          avisos={avisos}
        />
      </MemoryRouter>,
    );

  it('o ponto aparece só com aviso, e o title diz o motivo', () => {
    expect(trilho()).not.toContain('data-aviso');
    const html = trilho({ novidades: '2 novidades que você ainda não viu' });
    expect(html.match(/data-aviso/g)).toHaveLength(1);
    expect(html).toContain('title="Novidades · 2 novidades que você ainda não viu"');
  });
});

describe('cartão', () => {
  it('traduzida: título e resumo em português, como usar em passos e o original guardado', () => {
    const html = renderToStaticMarkup(
      <CartaoDaNovidade novidade={TRADUZIDA} nova traduzindo={false} />,
    );
    expect(html).toContain('A capa pode ter o apresentador');
    expect(html).toContain('Como usar');
    expect(html).toContain('<li><span>Escolha o protagonista.</span></li>');
    expect(html).toContain('novo para você');
    expect(html).toMatch(/<code[^>]*>apresentador<\/code>/);
    expect(html).toContain('Ver o original (inglês)');
    expect(html).not.toContain('Canais gains');
  });

  it('em inglês: mostra o original e diz que a tradução está a caminho', () => {
    const html = renderToStaticMarkup(
      <CartaoDaNovidade novidade={EM_INGLES} nova={false} traduzindo />,
    );
    expect(html).toContain('Canais gains');
    expect(html).toContain('traduzindo…');
    expect(html).not.toContain('Como usar');
    expect(html).not.toContain('novo para você');
  });
});

describe('tela', () => {
  const desenhar = (no: ReactNode, versoes: VersaoDasNovidades[]) => {
    const cliente = new QueryClient();
    cliente.setQueryData(novidadesKey, versoes);
    return renderToStaticMarkup(<QueryClientProvider client={cliente}>{no}</QueryClientProvider>);
  };

  it('abre o que não tem número e a última versão; as antigas ficam fechadas', () => {
    const html = desenhar(<NovidadesPage />, [
      versao('Unreleased', null, [TRADUZIDA]),
      versao('0.6.0', '2026-10-07', [{ ...EM_INGLES, chave: 'c3' }]),
      versao('0.5.0', '2026-09-28', [{ ...EM_INGLES, chave: 'd4', titulo_original: 'Velha.' }]),
    ]);
    expect(html).toContain('Já na main, ainda sem número de versão');
    expect(html).toContain('Versão 0.6.0 · 7 out 2026');
    expect(html).toContain('Versão 0.5.0 · 28 set 2026');
    expect(html).toContain('A capa pode ter o apresentador');
    expect(html).toContain('Covers can star the host.');
    expect(html).not.toContain('Velha.');
  });
});
