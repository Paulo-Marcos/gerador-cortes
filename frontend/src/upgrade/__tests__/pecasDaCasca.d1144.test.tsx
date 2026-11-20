import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { statusExportPendente } from '@/features/publicacao/statusExport';
import type { StatusExportCorte } from '@/types/models';
import { ContextColumn, LinhaDeLista } from '../ContextColumn';
import Erro404Page from '../Erro404Page';
import { MolduraDeVideo } from '../MolduraDeVideo';
import { PaletaDeComandos } from '../PaletaDeComandos';
import { TiraDoCorteAp, TiraMini } from '../TiraDoCorteAp';
import { montarTira, resumoDaLinha } from '../tiraDoCorte';

// D-1144 (E-069 H-14): as peças flutuantes e de lista da casca na Sala escura. Cada bloco é
// um item do aceite; o ambiente é `node`, então a prova é o HTML e o fonte.

vi.mock('@/features/shorts/useFires', () => ({ useFires: () => ({ data: { fires: [] } }) }));
vi.mock('@/features/editor/useCortes', () => ({ useCortesProjeto: () => ({ data: [] }) }));
vi.mock('@/features/projetos/useProjetos', () => ({
  useProjetos: () => ({ data: [{ id: 7, titulo_live: 'Pedro II e a Igreja', total_cortes: 3 }] }),
}));

const raiz = resolve(__dirname, '..');
const fonte = (arquivo: string) => readFileSync(resolve(raiz, arquivo), 'utf8');
/** O fonte sem comentários: a regra vale para o código, e o comentário pode citar o que saiu. */
const codigo = (arquivo: string) => fonte(arquivo).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/** O HTML sem os `<svg>`: o `Icon` carrega o seu `style="flex-shrink:0"`, que não é desta peça. */
const semIcones = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, '');

function tiraDoCorte(patch: Partial<StatusExportCorte> = {}) {
  return montarTira(
    statusExportPendente({
      corte_id: 'c',
      numero: 1,
      titulo: 'Corte',
      raw_pronto: true,
      grade_pronta: false,
      overlays_prontos: false,
      cenas_geradas: true,
      cenas_validadas: true,
      video_pronto: false,
      thumbnail_pronta: false,
      metadados_completos: false,
      pronto_publicar: false,
      ...patch,
    }),
  );
}

const SIGLAS = ['>BRU<', '>CEN<', '>GRD<', '>OVL<', '>FIN<', '>THU<', '>MET<', '>YT<', '>CENAS<', '>RENDER<', '>PUBLICAÇÃO<'];

describe('as siglas viram o medidor de etapas (§5)', () => {
  const tira = tiraDoCorte();
  const frase = resumoDaLinha(tira);
  const todas = {
    TiraMini: renderToStaticMarkup(<TiraMini tira={tira} />),
    TiraDoCorteAp: renderToStaticMarkup(<TiraDoCorteAp tira={tira} />),
  };

  for (const [nome, html] of Object.entries(todas)) {
    it(`${nome}: oito traços com o nome da etapa, sem sigla e sem style inline`, () => {
      expect(html.match(/data-etapa="/g)).toHaveLength(8);
      expect(html).toContain('role="img"');
      for (const sigla of SIGLAS) expect(html).not.toContain(sigla);
      expect(semIcones(html)).not.toContain('style=');
    });
  }

  it('a lista lateral mostra só os traços; a frase fica no aria-label (não cabe em 145 px)', () => {
    expect(todas.TiraMini).toContain(`aria-label="Etapas do corte: ${frase}"`);
    expect(todas.TiraMini).not.toContain(`>${frase}</span>`);
  });

  it('a tira da Pós e do modal leva a frase; compacta não', () => {
    expect(todas.TiraDoCorteAp).toContain(`>${frase}</span>`);
    expect(renderToStaticMarkup(<TiraDoCorteAp tira={tira} compacta />)).not.toContain(`>${frase}</span>`);
  });

  it('a linha da lista traz o medidor no lugar das siglas', () => {
    const html = renderToStaticMarkup(<LinhaDeLista item={{ id: 'c1', titulo: 'Pedro II', dot: 'red', tira }} />);
    expect(html).toContain('data-etapa="Filtro"');
    expect(html).not.toContain('>GRD<');
  });
});

describe('UpgradeToast sai de vez', () => {
  it('o arquivo não existe e ninguém o importa', () => {
    expect(existsSync(resolve(raiz, 'UpgradeToast.tsx'))).toBe(false);
    const pastas = ['upgrade', 'features', 'components', 'shared', 'lib'];
    const achados: string[] = [];
    const varrer = (dir: string) => {
      for (const nome of readdirSync(dir)) {
        const caminho = resolve(dir, nome);
        if (statSync(caminho).isDirectory()) varrer(caminho);
        else if (/\.tsx?$/.test(nome) && !/__tests__/.test(caminho) && /from ['"][^'"]*UpgradeToast['"]/.test(readFileSync(caminho, 'utf8')))
          achados.push(caminho);
      }
    };
    for (const p of pastas) varrer(resolve(raiz, '../', p));
    expect(achados).toEqual([]);
  });
});

describe('a paleta de comandos é o diálogo da Sala escura', () => {
  const abrir = (aberta: boolean) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <PaletaDeComandos aberta={aberta} onFechar={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );

  it('fechada não desenha nada', () => {
    expect(abrir(false)).toBe('');
  });

  it('aberta é um diálogo nomeado, com o campo de busca, o escopo em chips e o rodapé de teclas', () => {
    const html = abrir(true);
    expect(html).toContain('role="dialog"');
    expect(html).toMatch(/<h2[^>]*>Buscar live, short, corte, tela ou ação<\/h2>/);
    expect(html).toContain('role="search"');
    expect(html).toContain('aria-label="Onde procurar"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>(?:(?!<\/button>)[\s\S])*Tudo<\/button>/);
    expect(html).toContain('Digite para procurar.');
    expect(html).toContain('escolher');
  });

  it('o Tab gira o escopo e PARA no campo: sem stopPropagation o foco preso do Radix tira o foco da busca no Shift+Tab', () => {
    expect(fonte('PaletaDeComandos.tsx')).toMatch(/e\.key === 'Tab'\) \{\s*e\.preventDefault\(\);[^}]*e\.stopPropagation\(\);\s*girarEscopo/);
  });

  it('sem blur sobre o vídeo e sem style inline: a pele é a flutuante', () => {
    const html = abrir(true);
    expect(html).not.toContain('backdrop');
    expect(semIcones(html).replace(/ style="pointer-events:auto"/, '')).not.toContain('style=');
    expect(html).toContain('bg-pop');
    expect(html).toContain('data-sala=""');
  });
});

describe('Erro404Page na Sala escura', () => {
  it('diz o caminho pedido, tem UMA primária e o "Voltar" secundário', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/projetos/267/export']}>
        <Erro404Page />
      </MemoryRouter>,
    );
    expect(html).toContain('/projetos/267/export');
    expect(html).toContain('Esta página não existe');
    expect(html.match(/data-variant="primario"/g)).toHaveLength(1);
    expect(html).toContain('data-variant="secundario"');
    expect(semIcones(html)).not.toContain('style=');
  });
});

describe('MolduraDeVideo e a coluna de contexto', () => {
  it('a moldura leva o passe-partout em variável própria (não mais o --mat legado) e fio de foco quando clicável', () => {
    const html = renderToStaticMarkup(<MolduraDeVideo mat={4} proporcao="9/16" onClick={() => {}} rotulo="Abrir" />);
    expect(html).toContain('--respiro:4px');
    expect(html).toContain('--proporcao:9 / 16');
    expect(html).not.toContain('var(--mat)');
    expect(html).toContain('data-sala=""');
    expect(html).toContain('aria-label="Abrir"');
    expect(html).toContain('outline-foco');
  });

  it('a coluna usa vidro chapado (sem blur), chips nos filtros e o botão da Sala na ação', () => {
    const html = renderToStaticMarkup(
      <ContextColumn
        lista={{
          titulo: 'Cortes da live',
          filtros: [{ texto: 'Todos', n: 3, ativo: true }, { texto: 'Prontos', n: 1 }],
          itens: [{ id: 'c1', titulo: 'A renda da terra', dot: 'red', ativo: true }],
          acao: { texto: 'Novo corte', onClick: () => {} },
        }}
        onRecolher={() => {}}
      />,
    );
    expect(html).toContain('bg-vidro');
    expect(html).not.toContain('backdrop');
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Todos/s);
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-variant="secundario"');
    // a cor da bolinha é dado da tela: entra por variável CSS, nunca por `background`
    expect(html).toContain('--dot:red');
    expect(html).not.toMatch(/style="[^"]*background/);
  });
});

// As regras da Sala escura (DIRECAO §3.6, §8): escala de fonte, sem style inline, `data-sala`
// no elemento focável, foco de verdade e vidro só na casca.
describe('as regras da Sala escura nas peças migradas', () => {
  const PECAS = [
    'PaletaDeComandos.tsx',
    'GavetaDaFila.tsx',
    'LoteNaFila.tsx',
    'ContextColumn.tsx',
    'TiraDoCorteAp.tsx',
    'MolduraDeVideo.tsx',
    'Erro404Page.tsx',
  ];

  for (const peca of PECAS) {
    describe(peca, () => {
      const src = codigo(peca);
      it('escala de fonte do Tailwind: nada de px solto nem fontSize', () => {
        expect(src).not.toMatch(/text-\[\d+(\.\d+)?px\]/);
        expect(src).not.toMatch(/fontSize/);
      });
      it('sem style inline: só variável CSS de geometria (`--algo`)', () => {
        const estilos = [...src.matchAll(/style=\{\{([^}]*)\}\}/g)].map((m) => m[1].trim());
        for (const e of estilos) expect(e, e).toMatch(/^'--[\w-]+':/);
      });
      it('vidro só na casca: nenhum backdrop-filter', () => {
        expect(src).not.toMatch(/backdrop-?filter|backdrop-blur/i);
      });
      it('todo <button>/<input> cru leva data-sala (foco de verdade, sem o reset da casca)', () => {
        for (const m of src.matchAll(/<(button|input)\b[^>]*?>/gs)) expect(m[0], m[0]).toContain('data-sala');
      });
      it('sem cor solta (hex, rgb) fora da exceção nomeada do vídeo', () => {
        if (peca === 'MolduraDeVideo.tsx') return;
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
      });
    });
  }
});
