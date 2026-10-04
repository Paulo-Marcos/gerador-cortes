import { readdirSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { describe, expect, it } from 'vitest';
import config from '../../../tailwind.config';

// D-841: o tema da casca tem de valer em TODA classe de cor, não só nas novas.

const ler = (relativo: string) => readFileSync(resolve(__dirname, relativo), 'utf-8');

/** Declarações `--nome: valor` de cada bloco que abre com o seletor dado. */
function declaracoesDos(css: string, seletor: RegExp): Map<string, string> {
  const achadas = new Map<string, string>();
  for (const bloco of css.matchAll(new RegExp(`${seletor.source}\\s*\\{([^}]*)\\}`, 'g'))) {
    for (const d of bloco[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) achadas.set(d[1], d[2].trim());
  }
  return achadas;
}

describe('escalas antigas dentro da casca', () => {
  // Uma variável que aponta para outra é resolvida onde é DECLARADA. Declarada
  // só no :root, `--bg-900: var(--wb-bg-panel)` congela o branco do tema claro
  // antes de o `.ap` reapontar `--wb-bg-panel` — e bg-bg-900 fica branco no escuro.
  const raiz = declaracoesDos(ler('../../index.css'), /\n {2}:root/);
  const casca = declaracoesDos(ler('../upgrade.css'), /\n\.ap/);
  // Só as escalas antigas: um `--wb-*` que aponta para outro `--wb-*` já é da ponte.
  const apelidos = [...raiz].filter(([nome, valor]) => !nome.startsWith('--wb-') && /^var\(--wb-/.test(valor));

  it('há apelidos para conferir', () => {
    expect(apelidos.length).toBeGreaterThan(20);
  });

  it.each(apelidos)('%s é redeclarado no .ap com o mesmo valor', (nome, valor) => {
    expect(casca.get(nome)).toBe(valor);
  });
});

describe('opacidade sobre cor de token', () => {
  // `border-error/30` sobre `var(--error)` não gerava CSS nenhum: o Tailwind 3
  // não sabe aplicar alfa a um var(). A classe existia no código e não na tela.
  async function gerar(classes: string) {
    const saida = await postcss([
      tailwind({
        ...config,
        content: [{ raw: `<div class="${classes}"></div>`, extension: 'html' }],
        corePlugins: { preflight: false },
      }),
    ]).process('@tailwind utilities;', { from: undefined });
    return saida.css;
  }

  it.each(['border-error/30', 'bg-success/15', 'border-warning/25', 'border-info/30', 'bg-wb-accent/10', 'border-wb-ok/40', 'bg-bg-900/40', 'bg-accent-500/10'])(
    '%s vira CSS',
    async (classe) => {
      const css = await gerar(classe);
      expect(css).toContain(`.${classe.replace('/', '\\/')}`);
      expect(css).toContain('color-mix');
    },
  );

  it('sem opacidade, a cor sai inteira', async () => {
    const css = await gerar('bg-error');
    expect(css).toMatch(/background-color: color-mix\(in oklab, var\(--error\) calc\(var\(--tw-bg-opacity, 1\) \* 100%\), transparent\)/);
  });
});

describe('fundo da casca', () => {
  // D-846: os brilhos radiais (vermelho, âmbar/teal, azul) ficavam atrás do
  // conteúdo e disputavam com as cores de estado. Cor no fundo da casca é
  // ruído: ela volta a ser sinal só onde significa algo.
  const semComentarios = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
  const blocos = [ler('../upgrade.css'), ler('../upgrade-temas.css')].map(semComentarios).flatMap((css) =>
    [...css.matchAll(/(\.ap[^{]*)\{([^}]*)\}/g)].map((m) => [m[1].trim(), m[2]] as const),
  );

  it('há blocos da casca para conferir', () => {
    expect(blocos.length).toBeGreaterThan(5);
  });

  // Todo bloco, não só os que declaram background-image: um brilho que volte
  // pelo atalho `background:` também é brilho.
  it.each(blocos)('%s não pinta brilho radial', (_seletor, corpo) => {
    expect(corpo).not.toMatch(/radial-gradient/);
  });
});

describe('o acento é ação, não lugar', () => {
  // D-847: "onde estou" (item do trilho, aba, filtro, fase da live) usava o
  // mesmo vermelho de "Nova live" e de "Excluir". Seleção é tinta neutra
  // (--sel-*); o acento fica para o que se aperta.
  const raiz = resolve(__dirname, '../..');
  const fontes = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const caminho = resolve(dir, e.name);
      if (e.isDirectory()) return e.name === '__tests__' ? [] : fontes(caminho);
      return /\.tsx?$/.test(e.name) ? [caminho] : [];
    });
  // Sobre o arquivo inteiro, não linha a linha: o ternário quebrado em duas
  // linhas (`ativo` ⏎ `? '…--wb-accent…'`) escapava — achado da auditoria do #94.
  const selecaoComAcento = /\b(ativo|ativa|active|selecionado|selecionada|agora)\s*\?\s*['`][^'`]*--(wb-)?accent/g;

  it('nenhum estado de seleção escolhe a cor do acento', () => {
    const achados = fontes(raiz).flatMap((arquivo) => {
      const texto = readFileSync(arquivo, 'utf-8');
      return [...texto.matchAll(selecaoComAcento)].map(
        (m) => `${relative(raiz, arquivo)}:${texto.slice(0, m.index).split('\n').length}`,
      );
    });
    expect(achados).toEqual([]);
  });

  it('a etapa acesa da trilha não usa a cor de aviso', () => {
    expect(ler('../TrilhaDeEtapas.tsx')).not.toMatch(/agora:\s*\{[^}]*--warn/);
  });
});

describe('estado fala uma língua só', () => {
  // D-848: o SeloDeEstado define "aviso = convida a um ato" e "info = em
  // curso", mas trabalho da máquina saía em âmbar; e um segundo vocabulário
  // (StatusChip: success/warning/accent…) convivia com o do selo.
  it('trabalho da máquina é info, não aviso', async () => {
    const { TOM_DO_PROJETO } = await import('../SeloDeEstado');
    expect([TOM_DO_PROJETO.baixando, TOM_DO_PROJETO.transcrevendo, TOM_DO_PROJETO.publicando]).toEqual([
      'info',
      'info',
      'info',
    ]);
  });

  it('ninguém mais importa o StatusChip', () => {
    const raiz = resolve(__dirname, '../..');
    const fontes = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        const caminho = resolve(dir, e.name);
        if (e.isDirectory()) return fontes(caminho);
        return /\.tsx?$/.test(e.name) ? [caminho] : [];
      });
    const importam = fontes(raiz).filter((f) => /components\/ui\/status-chip/.test(readFileSync(f, 'utf-8')));
    expect(importam.map((f) => relative(raiz, f))).toEqual([]);
  });

  // Qualquer prefixo (text, fill, stroke, ring…), as famílias de cor de estado
  // e os hex soltos que o app já teve, sem diferenciar maiúscula — a primeira
  // versão só via `amber` em text/border/bg (achado da auditoria do #95).
  // CenaPlayerPanel fica de fora: a pílula sobre o vídeo segue a regra sobreArte.
  const corSolta = /-(red|rose|amber|emerald|yellow|orange|green|lime)-\d{2,3}\b|#(fca5a5|ff9b9b|e5484d|f87171)\b|--wb-danger,/i;

  it.each([
    'features/editor/avaliacao/AvaliacaoBrutoPanel.tsx',
    'features/editor/avaliacao/AvaliacaoCorteForm.tsx',
    'features/editor/fase2/AlertaCenasForaDoCorte.tsx',
    'features/editor/fase1/AudioSyncControl.tsx',
    'features/projeto-detalhe/AuditoriaAnaliseModal.tsx',
    'features/projeto-detalhe/PublicarMassaModal.tsx',
  ])('%s usa os tokens de estado, não cor solta', (arquivo) => {
    const texto = readFileSync(resolve(__dirname, '../..', arquivo), 'utf-8');
    expect(texto).not.toMatch(corSolta);
  });
});
