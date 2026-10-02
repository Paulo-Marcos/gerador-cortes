// Emoji fora da interface (D-858). Sexta catraca, irmã da de ícone pelo
// Icon (D-853): emoji fazendo papel de ícone escapa da escala (cada sistema
// desenha o seu, em cor e tamanho próprios) e brigava com os ícones de traço
// — 🎞️ 🎭 🎨 nas etapas, 🎥 📋 nas cenas, 🧠 🧩 nos Canais, ⚡ 📅 🔥 ⚠ soltos.
//
// A varredura olha só o que vira texto na tela — strings, templates e texto
// JSX —, não os comentários. A exceção é o conteúdo que o app PUBLICA: o 🔥 e o
// 📖 que vão no título e na capa do YouTube não são interface.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const TESTES = /(__tests__\/|\.test\.tsx?$)/;
const CONTEUDO_PUBLICADO = new Set(['src/lib/readingMetadata.ts']);
// Extended_Pictographic pega os emoji; os dingbats de traço (✓ ✎ ✍ ✂) faziam o
// mesmo papel de ícone e entram junto. Setas no meio da frase ("crie na
// timeline ↙"), ×, … e · são tipografia, não ícone: saem antes do teste.
const EMOJI = /\p{Extended_Pictographic}|[✓✔✍✎✂]/u;
const SIMBOLOS_DE_TEXTO = /[©®™←-⇿]/gu;

function emojisDoArquivo(arquivo: string): string[] {
  const fonte = ts.createSourceFile(arquivo, readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true);
  const achados: string[] = [];
  const visitar = (no: ts.Node): void => {
    const texto =
      ts.isStringLiteral(no) ||
      ts.isNoSubstitutionTemplateLiteral(no) ||
      ts.isTemplateHead(no) ||
      ts.isTemplateMiddle(no) ||
      ts.isTemplateTail(no) ||
      ts.isJsxText(no)
        ? no.text
        : null;
    if (texto && EMOJI.test(texto.replace(SIMBOLOS_DE_TEXTO, ''))) {
      const linha = fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
      achados.push(`${arquivo}:${linha} ${texto.trim().slice(0, 60)}`);
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return achados;
}

describe('emoji fora da interface (D-858)', () => {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && !TESTES.test(caminho));

  it('nenhum texto da interface leva emoji', () => {
    const achados = arquivos.filter((a) => !CONTEUDO_PUBLICADO.has(a)).flatMap(emojisDoArquivo);
    expect(achados, 'Use <Icon name=…> do upgrade/Icon no lugar do emoji').toEqual([]);
  });

  it('o conteúdo publicado continua com o 🔥 e o 📖 (a exceção não ficou vazia)', () => {
    for (const arquivo of CONTEUDO_PUBLICADO) expect(emojisDoArquivo(arquivo)).not.toEqual([]);
  });
});
