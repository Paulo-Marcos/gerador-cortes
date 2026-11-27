// D-1198 (DIRECAO §8.2 Formulário): todo campo tem `name` (o nome do campo no contrato),
// todo <input> cru diz o `type` e todo campo numérico diz o teclado (`inputMode`).
// Vale para a tag crua e para o uso dos primitivos, que só repassam o que recebem.
// Lê o código com o compilador do TypeScript: o JSX multilinha escapa de regex.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../..');
const CAMPOS = new Set(['input', 'select', 'textarea', 'Input', 'Select', 'Textarea', 'Busca']);
// Os primitivos recebem o `name` de quem chama (por prop ou por `{...props}`).
const PRIMITIVOS = new Set(
  ['input', 'select', 'textarea', 'busca'].map((nome) => `components/ui/${nome}.tsx`),
);

function arquivosDaTela(): string[] {
  return execFileSync('git', ['ls-files', '.'], { cwd: SRC, encoding: 'utf8', timeout: 30_000 })
    .split('\n')
    .filter((f) => f.endsWith('.tsx') && !/__tests__|\.test\./.test(f) && !PRIMITIVOS.has(f));
}

export function faltas(arquivo: string, codigo: string): string[] {
  const sf = ts.createSourceFile(arquivo, codigo, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visitar = (n: ts.Node) => {
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText();
      if (CAMPOS.has(tag)) {
        const attrs = new Map(
          n.attributes.properties
            .filter(ts.isJsxAttribute)
            .map((a) => [a.name.getText(), a.initializer?.getText() ?? 'true']),
        );
        const onde = `${arquivo}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} <${tag}>`;
        const name = attrs.get('name');
        if (!name || name === '""') out.push(`${onde} sem name`);
        if (tag === 'input' && !attrs.has('type')) out.push(`${onde} sem type`);
        if (attrs.get('type') === '"number"' && !attrs.has('inputMode')) {
          out.push(`${onde} numérico sem inputMode`);
        }
      }
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return out;
}

describe('campo com name (D-1198)', () => {
  it('acusa o campo sem name, o input sem type e o número sem teclado', () => {
    const codigo = `const t = (
      <>
        <input value="a" />
        <select name="" />
        <textarea name="descricao" />
        <Input type="number" name="parte" />
        <Busca name="busca" />
        <Select {...props} />
      </>
    );`;
    expect(faltas('x.tsx', codigo)).toEqual([
      'x.tsx:3 <input> sem name',
      'x.tsx:3 <input> sem type',
      'x.tsx:4 <select> sem name',
      'x.tsx:6 <Input> numérico sem inputMode',
      'x.tsx:8 <Select> sem name',
    ]);
  });

  it('nenhum campo do app está sem name, type ou teclado numérico', () => {
    const arquivos = arquivosDaTela();
    expect(arquivos.length).toBeGreaterThan(100);
    expect(arquivos.flatMap((f) => faltas(f, fs.readFileSync(path.join(SRC, f), 'utf8')))).toEqual(
      [],
    );
  });
});
