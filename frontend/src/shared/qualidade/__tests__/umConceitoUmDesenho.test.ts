// Um conceito, um desenho (D-858). Quinta catraca, irmã das de tamanho
// (D-771, D-772), cor solta (D-849) e ícone pelo Icon (D-853).
//
// O app usava o mesmo glifo para ideias diferentes: a tesoura era a etapa
// Cortes, "Editar corte" e "Gerar trechos"; o avião de papel, o menu Prontos e
// "Subir para o TikTok"; o play, "Tocar vídeo" e "Informar a URL"; a lupa,
// "Buscar" e "Auditar". Quem lê o ícone antes do texto — que é o motivo de
// ter ícone — aprendia o desenho errado.
//
// A regra olha a AÇÃO pelo rótulo: todo elemento JSX (ou objeto de
// configuração de ação, como o `primario` da barra) cujo rótulo começa por um
// conceito do dicionário tem de levar o ícone dele. Vale para ação nova: não
// há lista de exceção.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ICONE_DO_CONCEITO, type IconName } from '@/upgrade/Icon';

const TESTES = /(__tests__\/|\.test\.tsx?$)/;

const REGRAS: { conceito: string; rotulo: RegExp; icone: IconName }[] = [
  {
    conceito: 'publicar',
    rotulo: /^(publicar\b|ir para publicar|enviar .*ao youtube|subir para o tiktok)/i,
    icone: ICONE_DO_CONCEITO.publicar,
  },
  { conceito: 'editar', rotulo: /^editar\b/i, icone: ICONE_DO_CONCEITO.editar },
  { conceito: 'urlPublicada', rotulo: /^informar a url/i, icone: ICONE_DO_CONCEITO.urlPublicada },
  { conceito: 'auditar', rotulo: /^audit(ar\b|oria da análise)/i, icone: ICONE_DO_CONCEITO.auditar },
  { conceito: 'iaGera', rotulo: /^gerar (trechos|com (a )?ia)\b/i, icone: ICONE_DO_CONCEITO.iaGera },
  { conceito: 'prontos', rotulo: /^prontos$/i, icone: ICONE_DO_CONCEITO.prontos },
  // Decisões da D-858 fora do dicionário do design, para o mesmo desenho
  // não voltar a ser dois: o pacote para subir à mão não é publicar; baixar
  // não é tocar; analisar com a IA é o cérebro, como em "Reanalisar".
  { conceito: 'pacote', rotulo: /(^|\b)(só o pacote|preparar pacote)/i, icone: 'package' },
  { conceito: 'baixar', rotulo: /^baixar\b/i, icone: 'download' },
  { conceito: 'analisar', rotulo: /^(re)?analisar\b/i, icone: 'brain' },
];

// O spinner divide o lugar com o ícone enquanto a ação roda.
const NEUTROS = new Set<string>(['loader', 'loader-2']);
// Botão só com seta é abrir/recolher (a cena, o painel), não a ação que o
// título nomeia: "Editar cena" num chevron diz o que se abre, não o que se faz.
const DE_ABRIR = /^chevron-/;
const ATRIBUTOS_DE_ROTULO = new Set(['title', 'aria-label', 'label', 'rotulo', 'titulo', 'texto', 'menu']);
const ATRIBUTOS_DE_ICONE = new Set(['icon', 'icone']);

/** Os textos que uma expressão pode produzir (literal, template, ternário). */
function textos(no: ts.Node | undefined): string[] {
  if (!no) return [];
  if (ts.isStringLiteral(no) || ts.isNoSubstitutionTemplateLiteral(no)) return [no.text];
  if (ts.isTemplateExpression(no)) {
    return [no.head.text + no.templateSpans.map((s) => '…' + s.literal.text).join('')];
  }
  if (ts.isConditionalExpression(no)) return [...textos(no.whenTrue), ...textos(no.whenFalse)];
  if (ts.isParenthesizedExpression(no) || ts.isAsExpression(no)) return textos(no.expression);
  if (ts.isJsxExpression(no)) return textos(no.expression);
  return [];
}

/** O nome de ícone que uma expressão produz: 'x', 'x' as IconName, ICONE_DO_CONCEITO.y. */
function icones(no: ts.Node | undefined): string[] {
  if (!no) return [];
  // `name={ICONE_DO_CONCEITO.x}` chega embrulhado em JsxExpression: sem
  // desembrulhar, o ícone do dicionário ficava invisível e a ação passava sem
  // ser conferida.
  if (ts.isJsxExpression(no) || ts.isParenthesizedExpression(no) || ts.isAsExpression(no)) {
    return icones(no.expression);
  }
  if (ts.isConditionalExpression(no)) return [...icones(no.whenTrue), ...icones(no.whenFalse)];
  if (ts.isPropertyAccessExpression(no) && no.expression.getText() === 'ICONE_DO_CONCEITO') {
    return [ICONE_DO_CONCEITO[no.name.text as keyof typeof ICONE_DO_CONCEITO]];
  }
  return textos(no);
}

type Acao = { arquivo: string; linha: number; rotulos: string[]; icones: Set<string> };

function atributo(attrs: ts.JsxAttributes, nomes: Set<string>): ts.Node[] {
  return attrs.properties.flatMap((p) =>
    ts.isJsxAttribute(p) && nomes.has(p.name.getText()) && p.initializer ? [p.initializer] : [],
  );
}

/** Os rótulos próprios de um elemento: atributos de rótulo e texto direto. */
function rotulosDe(no: ts.JsxElement | ts.JsxSelfClosingElement): string[] {
  const abertura = ts.isJsxElement(no) ? no.openingElement : no;
  const rotulos = atributo(abertura.attributes, ATRIBUTOS_DE_ROTULO).flatMap(textos);
  if (ts.isJsxElement(no)) {
    for (const filho of no.children) {
      if (ts.isJsxText(filho) && filho.text.trim()) rotulos.push(filho.text.trim());
      else if (ts.isJsxExpression(filho)) rotulos.push(...textos(filho));
    }
  }
  return rotulos;
}

/**
 * Os ícones de um elemento: os atributos icon/icone dele e os <Icon> lá dentro
 * — sem entrar em filho que tem rótulo próprio. O título de um modal não
 * herda o ícone do botão "Salvar" que mora no corpo dele.
 */
function iconesDe(no: ts.JsxElement | ts.JsxSelfClosingElement, achados: Set<string>): void {
  const abertura = ts.isJsxElement(no) ? no.openingElement : no;
  if (abertura.tagName.getText() === 'Icon') {
    for (const valor of atributo(abertura.attributes, new Set(['name']))) {
      for (const nome of icones(valor)) achados.add(nome);
    }
    return;
  }
  for (const valor of atributo(abertura.attributes, ATRIBUTOS_DE_ICONE)) {
    for (const nome of icones(valor)) achados.add(nome);
  }
  const descer = (filho: ts.Node): void => {
    if (ts.isJsxElement(filho) || ts.isJsxSelfClosingElement(filho)) {
      const tag = (ts.isJsxElement(filho) ? filho.openingElement : filho).tagName.getText();
      if (tag === 'Icon' || rotulosDe(filho).length === 0) iconesDe(filho, achados);
      return;
    }
    ts.forEachChild(filho, descer);
  };
  if (ts.isJsxElement(no)) no.children.forEach(descer);
  ts.forEachChild(abertura.attributes, descer);
}

function acoesDoArquivo(arquivo: string): Acao[] {
  const fonte = ts.createSourceFile(arquivo, readFileSync(arquivo, 'utf8'), ts.ScriptTarget.Latest, true);
  const linha = (no: ts.Node) => fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
  const acoes: Acao[] = [];

  const visitar = (no: ts.Node): void => {
    if (ts.isJsxElement(no) || ts.isJsxSelfClosingElement(no)) {
      const rotulos = rotulosDe(no);
      const achados = new Set<string>();
      iconesDe(no, achados);
      if (rotulos.length && achados.size) acoes.push({ arquivo, linha: linha(no), rotulos, icones: achados });
      // O botão principal de um modal vem em par de props (primaryLabel e
      // primaryIcon): é uma ação à parte da do título.
      const abertura = ts.isJsxElement(no) ? no.openingElement : no;
      const rotuloPrimario = atributo(abertura.attributes, new Set(['primaryLabel'])).flatMap(textos);
      const iconePrimario = new Set(atributo(abertura.attributes, new Set(['primaryIcon'])).flatMap(icones));
      if (rotuloPrimario.length && iconePrimario.size) {
        acoes.push({ arquivo, linha: linha(no), rotulos: rotuloPrimario, icones: iconePrimario });
      }
    } else if (ts.isObjectLiteralExpression(no)) {
      const rotulos: string[] = [];
      const achados = new Set<string>();
      for (const p of no.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const nome = p.name.getText().replace(/['"]/g, '');
        if (ATRIBUTOS_DE_ROTULO.has(nome)) rotulos.push(...textos(p.initializer));
        if (ATRIBUTOS_DE_ICONE.has(nome)) for (const i of icones(p.initializer)) achados.add(i);
      }
      if (rotulos.length && achados.size) acoes.push({ arquivo, linha: linha(no), rotulos, icones: achados });
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return acoes;
}

function todasAsAcoes(): Acao[] {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && !TESTES.test(caminho));
  return arquivos.flatMap(acoesDoArquivo);
}

describe('um conceito, um desenho (D-858)', () => {
  const acoes = todasAsAcoes();

  it('acha as ações (a varredura não ficou cega)', () => {
    expect(acoes.length).toBeGreaterThan(100);
  });

  it('enxerga o ícone vindo do dicionário, em name={…} e em icone={…}', () => {
    const doDicionario = new Set<string>(Object.values(ICONE_DO_CONCEITO));
    const comDicionario = acoes.filter((a) => [...a.icones].some((i) => doDicionario.has(i)));
    const rotulosVistos = comDicionario.flatMap((a) => a.rotulos).join(' | ');
    // Um <Icon name={ICONE_DO_CONCEITO.editar}> (linha do corte) e um
    // icone={ICONE_DO_CONCEITO.iaGera} (gerar trechos de todos).
    expect(rotulosVistos).toContain('Editar corte');
    expect(rotulosVistos).toContain('Gerar trechos de todos os cortes');
  });

  it.each(REGRAS)('ação de "$conceito" usa o ícone $icone', ({ rotulo, icone }) => {
    const erradas = acoes
      .filter((a) => a.rotulos.some((r) => rotulo.test(r)))
      .filter((a) => ![...a.icones].every((i) => DE_ABRIR.test(i) || NEUTROS.has(i)))
      .filter((a) => !a.icones.has(icone))
      .map((a) => `${a.arquivo}:${a.linha} [${[...a.icones].filter((i) => !NEUTROS.has(i)).join(', ')}] ${a.rotulos.join(' | ')}`);
    expect(erradas).toEqual([]);
  });
});
