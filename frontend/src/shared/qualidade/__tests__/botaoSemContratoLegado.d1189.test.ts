// D-1189 (E-069 H-24a): nenhum <Button> de features/, shared/, routes e App usa o contrato
// antigo (`variant` default/outline/ghost/danger/secondary, `size` default/sm/icon/icon-sm)
// nem fica sem `variant` (o `default` antigo desenhava um primário que a régua não contava, D-1173).
// Lê o código com o compilador do TypeScript: o JSX multilinha escapa de regex.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../..');
const LEGADO_VARIANT = /'(default|outline|ghost|danger|secondary)'|^"(default|outline|ghost|danger|secondary)"$/;
const LEGADO_SIZE = /^["'](default|sm|icon|icon-sm)["']$/;

function arquivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : arquivos(p);
    return /\.tsx$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
  });
}

function achados(arquivo: string): string[] {
  const sf = ts.createSourceFile(arquivo, fs.readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visitar = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === 'Button') {
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
      const nome = (a: ts.JsxAttribute) => a.name.getText();
      const variant = attrs.find((a) => nome(a) === 'variant');
      const size = attrs.find((a) => nome(a) === 'size');
      const hasSpread = n.attributes.properties.some(ts.isJsxSpreadAttribute);
      const onde = `${path.relative(SRC, arquivo)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
      if (!variant && !hasSpread) out.push(`${onde} sem variant`);
      if (variant?.initializer && LEGADO_VARIANT.test(variant.initializer.getText())) out.push(`${onde} variant legado`);
      if (size?.initializer && LEGADO_SIZE.test(size.initializer.getText())) out.push(`${onde} size legado`);
    }
    ts.forEachChild(n, visitar);
  };
  visitar(sf);
  return out;
}

describe('Button no contrato novo (D-1189)', () => {
  it('nenhuma chamada em features/shared/routes/App usa variant ou size antigos', () => {
    const alvos = [
      ...arquivos(path.join(SRC, 'features')),
      ...arquivos(path.join(SRC, 'shared')),
      path.join(SRC, 'routes.tsx'),
      path.join(SRC, 'App.tsx'),
    ].filter((p) => fs.existsSync(p));
    expect(alvos.flatMap(achados)).toEqual([]);
  });
});
