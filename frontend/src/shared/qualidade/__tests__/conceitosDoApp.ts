// O dicionário e o leitor de código da catraca "um conceito, um desenho"
// (D-858). Moram fora do teste para ele caber no teto de 500 linhas (D-771):
// o teste fica com os casos; aqui, o que as regras dizem e como o código é lido.
//
// Como o rótulo e o ícone mudam com o estado (`isPending ? … : …`,
// `porApi && …`), a catraca SIMULA as renderizações: junta as condições do
// elemento, percorre cada combinação de verdadeiro/falso e confere o que
// aparece JUNTO em cada uma. Antes ela pareava ternários por regra, e cada
// regra deixava um furo (aninhado, negação, `&&`, ícone num ramo só,
// profundidades diferentes — achados das auditorias do #107).

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { ICONE_DO_CONCEITO, type IconName } from '@/upgrade/Icon';

const TESTES = /(__tests__\/|\.test\.tsx?$)/;

// `exemplos`: um rótulo REAL do app por caminho da regex, com a caixa de
// como aparece. Sem eles, a regex estragada (uma letra a mais numa
// alternativa, o `/i` perdido) não reprovava nada e passava calada
// (pr-audit do #144).
export const REGRAS: { conceito: string; rotulo: RegExp; icone: IconName; exemplos: string[] }[] = [
  {
    conceito: 'publicar',
    rotulo: /^(publicar\b|ir para publicar|enviar .*ao youtube|subir para o tiktok)/i,
    icone: ICONE_DO_CONCEITO.publicar,
    exemplos: ['Publicar este', 'Ir para publicar', 'Enviar ao YouTube agora', 'Subir para o TikTok (robô ou pacote)'],
  },
  {
    conceito: 'editar',
    rotulo: /^(editar\b|voltar à edição|ir para a edição)/i,
    icone: ICONE_DO_CONCEITO.editar,
    exemplos: ['Editar', 'Voltar à edição', 'Ir para a edição'],
  },
  {
    conceito: 'renomear', // D-888: só troca o nome
    rotulo: /^renomear\b/i,
    icone: ICONE_DO_CONCEITO.renomear,
    exemplos: ['Renomear preset selecionado'],
  },
  {
    conceito: 'urlPublicada',
    rotulo: /^informar a url/i,
    icone: ICONE_DO_CONCEITO.urlPublicada,
    exemplos: ['Informar a URL publicada'],
  },
  {
    conceito: 'auditar',
    rotulo: /^audit(ar\b|oria da análise)/i,
    icone: ICONE_DO_CONCEITO.auditar,
    exemplos: ['Auditar análise', 'Auditoria da análise'],
  },
  {
    conceito: 'iaGera',
    // "Gerar bruto" é render (tesoura); gerar COM a IA — trechos, o que falta,
    // no ChatGPT, no Gemini — é a estrela.
    rotulo: /^gerar (trechos|o que falta)\b|^gerar\b.*\b(com (a )?ia|no chatgpt|no gemini)\b|^ia$/i,
    icone: ICONE_DO_CONCEITO.iaGera,
    exemplos: ['Gerar trechos', 'Gerar o que falta', 'Gerar com IA', 'Gerar no ChatGPT', 'Gerar no Gemini', 'IA'],
  },
  { conceito: 'prontos', rotulo: /^prontos$/i, icone: ICONE_DO_CONCEITO.prontos, exemplos: ['Prontos'] },
  // Decisões da D-858 fora do dicionário do design, para o mesmo desenho
  // não voltar a ser dois: o pacote para subir à mão não é publicar; baixar
  // não é tocar; analisar com a IA é o cérebro, como em "Reanalisar".
  {
    conceito: 'pacote',
    rotulo: /(^|\b)(só o pacote|preparar pacote)/i,
    icone: 'package',
    exemplos: ['Só o pacote', 'preparar pacote'],
  },
  { conceito: 'baixar', rotulo: /^baixar\b/i, icone: 'download', exemplos: ['Baixar'] },
  {
    conceito: 'analisar',
    rotulo: /^(re)?analisar\b|^an[aá]lise completa por ia/i,
    icone: 'brain',
    exemplos: ['Analisar a live', 'Reanalisar', 'Analise completa por IA'],
  },
];

// O spinner divide o lugar com o ícone enquanto a ação roda.
const NEUTROS = new Set<string>(['loader', 'loader-2']);
// Botão só com seta é abrir/recolher (a cena, o painel), não a ação que o
// título nomeia: "Editar cena" num chevron diz o que se abre, não o que se faz.
const DE_ABRIR = /^chevron-/;
const ATRIBUTOS_DE_ROTULO = new Set(['title', 'aria-label', 'label', 'rotulo', 'descricao', 'titulo', 'texto', 'menu']);
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

/** Desembrulha `{…}`, `(…)` e `x as T`. */
function nu(no: ts.Node): ts.Node {
  if (ts.isJsxExpression(no) && no.expression) return nu(no.expression);
  if (ts.isParenthesizedExpression(no) || ts.isAsExpression(no)) return nu(no.expression);
  return no;
}

const E_LOGICO = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);

/**
 * Os átomos de uma condição: as folhas que não são `!`, `&&`, `||` nem `??`.
 * `!aberto && pronto` são `aberto` e `pronto` — tratar a condição inteira como
 * um átomo só criava combinações impossíveis e reprovava código certo
 * (achado da auditoria do #107).
 */
function atomos(condicao: ts.Node): string[] {
  const c = nu(condicao);
  if (ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken) return atomos(c.operand);
  if (ts.isBinaryExpression(c) && E_LOGICO.has(c.operatorToken.kind)) return [...atomos(c.left), ...atomos(c.right)];
  return [c.getText()];
}

/** O valor de uma condição numa combinação, a partir dos átomos. */
function avaliar(condicao: ts.Node, valor: Map<string, boolean>): boolean {
  const c = nu(condicao);
  if (ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken) return !avaliar(c.operand, valor);
  if (ts.isBinaryExpression(c) && c.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return avaliar(c.left, valor) && avaliar(c.right, valor);
  }
  if (ts.isBinaryExpression(c) && E_LOGICO.has(c.operatorToken.kind)) {
    return avaliar(c.left, valor) || avaliar(c.right, valor);
  }
  const v = valor.get(c.getText());
  if (v === undefined) throw new Error(`condição fora da simulação: ${c.getText()}`);
  return v;
}

const INLINE = new Set(['span', 'strong', 'em', 'b', 'i', 'small', 'kbd']);

/** Elemento que faz parte da ação do pai: inline e sem rótulo próprio. */
function envolve(no: ts.JsxElement | ts.JsxSelfClosingElement): no is ts.JsxElement {
  return ts.isJsxElement(no) && INLINE.has(no.openingElement.tagName.getText()) && rotulosDe(no).length === 0;
}

type Visto = { rotulos: string[]; icones: string[] };
type Fonte = { no: ts.Node; contexto: 'rotulo' | 'icone' };

/**
 * O que um pedaço de código mostra numa combinação de condições: o ramo do
 * ternário que vale, o lado direito do `&&` se a condição vale, o texto e os
 * <Icon> de um fragmento ou de um invólucro sem rótulo próprio. String é
 * rótulo — ou ícone, quando vem de um atributo de ícone.
 */
function ver(no: ts.Node, contexto: Fonte['contexto'], valor: Map<string, boolean>, saida: Visto): void {
  const n = nu(no);
  const vale = (condicao: ts.Node) => avaliar(condicao, valor);
  if (ts.isConditionalExpression(n)) {
    ver(vale(n.condition) ? n.whenTrue : n.whenFalse, contexto, valor, saida);
  } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    if (vale(n.left)) ver(n.right, contexto, valor, saida);
  } else if (ts.isPropertyAccessExpression(n) && n.expression.getText() === 'ICONE_DO_CONCEITO') {
    saida.icones.push(...icones(n));
  } else if (ts.isJsxText(n)) {
    if (n.text.trim()) saida.rotulos.push(n.text.trim());
  } else if (ts.isJsxFragment(n)) {
    n.children.forEach((f) => ver(f, 'rotulo', valor, saida));
  } else if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
    const abertura = ts.isJsxElement(n) ? n.openingElement : n;
    if (abertura.tagName.getText() === 'Icon') {
      atributo(abertura.attributes, new Set(['name'])).forEach((v) => ver(v, 'icone', valor, saida));
    } else if (envolve(n)) {
      // Invólucro inline sem rótulo (span, strong…): o que ele mostra é do pai.
      // Filho com rótulo próprio é outra ação — o título do modal não herda o
      // ícone do botão "Salvar" do corpo —, e bloco (div, section) é conteúdo,
      // não parte da ação.
      n.children.forEach((f) => ver(f, 'rotulo', valor, saida));
    }
  } else {
    const txt = textos(n);
    if (contexto === 'icone') saida.icones.push(...txt);
    else saida.rotulos.push(...txt);
  }
}

const MAX_CONDICOES = 10;

/**
 * As condições que a simulação ALCANÇA — o mesmo caminho do `ver`: não entra
 * em filho com rótulo próprio, que é outra ação. Contar a subárvore inteira
 * deixava a catraca lenta e passava do teto à toa em contêineres.
 */
function condicoesAlcancadas(no: ts.Node, chaves: Set<string>): void {
  const n = nu(no);
  if (ts.isConditionalExpression(n)) {
    atomos(n.condition).forEach((a) => chaves.add(a));
    condicoesAlcancadas(n.whenTrue, chaves);
    condicoesAlcancadas(n.whenFalse, chaves);
  } else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    atomos(n.left).forEach((a) => chaves.add(a));
    condicoesAlcancadas(n.right, chaves);
  } else if (ts.isJsxFragment(n)) {
    n.children.forEach((f) => condicoesAlcancadas(f, chaves));
  } else if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
    const abertura = ts.isJsxElement(n) ? n.openingElement : n;
    if (abertura.tagName.getText() === 'Icon') {
      atributo(abertura.attributes, new Set(['name'])).forEach((v) => condicoesAlcancadas(v, chaves));
    } else if (envolve(n)) {
      n.children.forEach((f) => condicoesAlcancadas(f, chaves));
    }
  }
}

/** Todos os rótulos que as fontes podem mostrar, em qualquer ramo. */
function rotulosPossiveis(fontes: Fonte[]): string[] {
  const saida: string[] = [];
  const juntar = (no: ts.Node): void => {
    const n = nu(no);
    if (ts.isConditionalExpression(n)) [n.whenTrue, n.whenFalse].forEach(juntar);
    else if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) juntar(n.right);
    else if (ts.isJsxText(n)) saida.push(n.text.trim());
    else if (ts.isJsxFragment(n)) n.children.forEach(juntar);
    else if ((ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) && envolve(n)) n.children.forEach(juntar);
    else saida.push(...textos(n));
  };
  fontes.filter((f) => f.contexto === 'rotulo').forEach((f) => juntar(f.no));
  return saida;
}

/** Cada combinação de verdadeiro/falso das condições das fontes, e o que ela mostra. */
function renderizacoes(fontes: Fonte[], fixos: Visto): Visto[] {
  const chaves = new Set<string>();
  fontes.forEach((f) => condicoesAlcancadas(f.no, chaves));
  // Acima do teto, a simulação não corta em silêncio: avisa, e o elemento se
  // divide (ou o teto sobe com motivo).
  if (chaves.size > MAX_CONDICOES) throw new Error(`${chaves.size} condições (teto ${MAX_CONDICOES})`);
  const lista = [...chaves];
  const saidas: Visto[] = [];
  for (let combinacao = 0; combinacao < 1 << lista.length; combinacao++) {
    const valor = new Map(lista.map((c, i) => [c, Boolean(combinacao & (1 << i))]));
    const saida: Visto = { rotulos: [...fixos.rotulos], icones: [...fixos.icones] };
    for (const f of fontes) ver(f.no, f.contexto, valor, saida);
    saidas.push(saida);
  }
  return saidas;
}

export function acoesDoCodigo(arquivo: string, codigo: string): Acao[] {
  const fonte = ts.createSourceFile(arquivo, codigo, ts.ScriptTarget.Latest, true);
  const linha = (no: ts.Node) => fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
  const acoes: Acao[] = [];
  const vistas = new Set<string>();
  const registrar = (no: ts.Node, fontes: Fonte[], fixos: Visto = { rotulos: [], icones: [] }) => {
    // Só simula o que pode dizer um conceito: o resto não tem como quebrar a
    // regra, e simular contêiner (card, linha de lista) só custava tempo.
    const possiveis = rotulosPossiveis(fontes);
    if (!possiveis.some((r) => REGRAS.some((regra) => regra.rotulo.test(r)))) return;
    let vistos: Visto[];
    try {
      vistos = renderizacoes(fontes, fixos);
    } catch (erro) {
      throw new Error(`${arquivo}:${linha(no)}: ${(erro as Error).message}`);
    }
    for (const { rotulos, icones: achados } of vistos) {
      if (!rotulos.length || !achados.length) continue;
      const chave = `${linha(no)}|${rotulos.join('|')}|${[...new Set(achados)].sort().join('|')}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      acoes.push({ arquivo, linha: linha(no), rotulos, icones: new Set(achados) });
    }
  };
  const como = (contexto: Fonte['contexto']) => (no: ts.Node) => ({ no, contexto });

  const visitar = (no: ts.Node): void => {
    if (ts.isJsxElement(no) || ts.isJsxSelfClosingElement(no)) {
      const abertura = ts.isJsxElement(no) ? no.openingElement : no;
      const deIcone = atributo(abertura.attributes, ATRIBUTOS_DE_ICONE);
      // O botão de IA desenha o "IA gera" quando ninguém diz outro ícone: sem
      // isto, "Analisar…" num AcaoDeIa sem `icone` passava com um ícone que não
      // estava na tela (achado da auditoria do #107).
      const padrao =
        abertura.tagName.getText() === 'AcaoDeIa' && deIcone.length === 0 ? [ICONE_DO_CONCEITO.iaGera] : [];
      registrar(
        no,
        [
          ...atributo(abertura.attributes, ATRIBUTOS_DE_ROTULO).map(como('rotulo')),
          ...deIcone.map(como('icone')),
          ...(ts.isJsxElement(no) ? no.children.map(como('rotulo')) : []),
        ],
        { rotulos: [], icones: padrao },
      );
      // O botão principal de um modal vem em par de props (primaryLabel e
      // primaryIcon): é uma ação à parte da do título.
      registrar(no, [
        ...atributo(abertura.attributes, new Set(['primaryLabel'])).map(como('rotulo')),
        ...atributo(abertura.attributes, new Set(['primaryIcon'])).map(como('icone')),
      ]);
    } else if (ts.isObjectLiteralExpression(no)) {
      const fontes: Fonte[] = [];
      for (const p of no.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const nome = p.name.getText().replace(/['"]/g, '');
        if (ATRIBUTOS_DE_ROTULO.has(nome)) fontes.push({ no: p.initializer, contexto: 'rotulo' });
        if (ATRIBUTOS_DE_ICONE.has(nome)) fontes.push({ no: p.initializer, contexto: 'icone' });
      }
      registrar(no, fontes);
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return acoes;
}

export function todasAsAcoes(): Acao[] {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && !TESTES.test(caminho));
  return arquivos.flatMap((arquivo) => acoesDoCodigo(arquivo, readFileSync(arquivo, 'utf8')));
}

/** As ações que quebram a regra: rotuladas com o conceito e sem o desenho dele. */
export function erradas(acoes: Acao[], { rotulo, icone }: { rotulo: RegExp; icone: string }): string[] {
  return acoes
    .filter((a) => a.rotulos.some((r) => rotulo.test(r)))
    .filter((a) => ![...a.icones].every((i) => DE_ABRIR.test(i) || NEUTROS.has(i)))
    .filter((a) => !a.icones.has(icone))
    .map(
      (a) =>
        `${a.arquivo}:${a.linha} [${[...a.icones].filter((i) => !NEUTROS.has(i)).join(', ')}] ${a.rotulos.join(' | ')}`,
    );
}

export const regra = (conceito: string) => {
  const achada = REGRAS.find((r) => r.conceito === conceito);
  if (!achada) throw new Error(`regra ${conceito} não existe`);
  return achada;
};
