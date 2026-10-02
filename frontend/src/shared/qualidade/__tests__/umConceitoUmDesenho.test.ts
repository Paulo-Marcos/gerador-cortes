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

const REGRAS: { conceito: string; rotulo: RegExp; icone: IconName }[] = [
  {
    conceito: 'publicar',
    rotulo: /^(publicar\b|ir para publicar|enviar .*ao youtube|subir para o tiktok)/i,
    icone: ICONE_DO_CONCEITO.publicar,
  },
  { conceito: 'editar', rotulo: /^(editar\b|voltar à edição|ir para a edição)/i, icone: ICONE_DO_CONCEITO.editar },
  { conceito: 'urlPublicada', rotulo: /^informar a url/i, icone: ICONE_DO_CONCEITO.urlPublicada },
  { conceito: 'auditar', rotulo: /^audit(ar\b|oria da análise)/i, icone: ICONE_DO_CONCEITO.auditar },
  {
    conceito: 'iaGera',
    // "Gerar bruto" é render (tesoura); gerar COM a IA — trechos, o que falta,
    // no ChatGPT, no Gemini — é a estrela.
    rotulo: /^gerar (trechos|o que falta)\b|^gerar\b.*\b(com (a )?ia|no chatgpt|no gemini)\b|^ia$/i,
    icone: ICONE_DO_CONCEITO.iaGera,
  },
  { conceito: 'prontos', rotulo: /^prontos$/i, icone: ICONE_DO_CONCEITO.prontos },
  // Decisões da D-858 fora do dicionário do design, para o mesmo desenho
  // não voltar a ser dois: o pacote para subir à mão não é publicar; baixar
  // não é tocar; analisar com a IA é o cérebro, como em "Reanalisar".
  { conceito: 'pacote', rotulo: /(^|\b)(só o pacote|preparar pacote)/i, icone: 'package' },
  { conceito: 'baixar', rotulo: /^baixar\b/i, icone: 'download' },
  { conceito: 'analisar', rotulo: /^(re)?analisar\b|^an[aá]lise completa por ia/i, icone: 'brain' },
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

function acoesDoCodigo(arquivo: string, codigo: string): Acao[] {
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

function todasAsAcoes(): Acao[] {
  const arquivos = execFileSync('git', ['ls-files', 'src'], { encoding: 'utf8', timeout: 60_000 })
    .split('\n')
    .filter((caminho) => /\.tsx?$/.test(caminho) && !TESTES.test(caminho));
  return arquivos.flatMap((arquivo) => acoesDoCodigo(arquivo, readFileSync(arquivo, 'utf8')));
}

/** As ações que quebram a regra: rotuladas com o conceito e sem o desenho dele. */
function erradas(acoes: Acao[], { rotulo, icone }: { rotulo: RegExp; icone: string }): string[] {
  return acoes
    .filter((a) => a.rotulos.some((r) => rotulo.test(r)))
    .filter((a) => ![...a.icones].every((i) => DE_ABRIR.test(i) || NEUTROS.has(i)))
    .filter((a) => !a.icones.has(icone))
    .map(
      (a) =>
        `${a.arquivo}:${a.linha} [${[...a.icones].filter((i) => !NEUTROS.has(i)).join(', ')}] ${a.rotulos.join(' | ')}`,
    );
}

const regra = (conceito: string) => {
  const achada = REGRAS.find((r) => r.conceito === conceito);
  if (!achada) throw new Error(`regra ${conceito} não existe`);
  return achada;
};

describe('um conceito, um desenho (D-858)', () => {
  const acoes = todasAsAcoes();

  it('acha as ações (a varredura não ficou cega)', () => {
    // Só entram as ações que dizem um conceito: 88 em 02/10/2026.
    expect(acoes.length).toBeGreaterThan(60);
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

  it.each(REGRAS)('ação de "$conceito" usa o ícone $icone', (r) => {
    expect(erradas(acoes, r)).toEqual([]);
  });
});

// A catraca contra ela mesma: casos que ela tem de reprovar e de aprovar.
describe('a catraca de conceitos enxerga…', () => {
  const casos = (codigo: string) => acoesDoCodigo('caso.tsx', codigo);

  it('o "IA gera" que o AcaoDeIa desenha quando não recebe ícone', () => {
    const semIcone = '<AcaoDeIa rotulo="Analisar padrões" emVoo={null} />';
    const comCerebro = '<AcaoDeIa rotulo="Analisar padrões" icone="brain" emVoo={null} />';
    expect(erradas(casos(semIcone), regra('analisar'))).toHaveLength(1);
    expect(erradas(casos(comCerebro), regra('analisar'))).toEqual([]);
  });

  it('rótulo e ícone do mesmo ternário, ramo a ramo', () => {
    const botao = (a: string, b: string) =>
      `<Button>{porApi ? <Icon name="${a}" /> : <Icon name="${b}" />}{porApi ? 'publicar' : 'preparar pacote'}</Button>`;
    expect(erradas(casos(botao('upload', 'package')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(botao('upload', 'package')), regra('pacote'))).toEqual([]);
    expect(erradas(casos(botao('package', 'upload')), regra('publicar'))).toHaveLength(1);
    expect(erradas(casos(botao('package', 'upload')), regra('pacote'))).toHaveLength(1);
  });

  it('ternário aninhado, folha a folha', () => {
    const botao = (a: string, b: string) =>
      `<Button>{agendar ? <Icon name="clock" /> : porApi ? <Icon name="${a}" /> : <Icon name="${b}" />}` +
      `{agendar ? 'agendar' : porApi ? 'publicar' : 'preparar pacote'}</Button>`;
    expect(erradas(casos(botao('upload', 'package')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(botao('package', 'upload')), regra('publicar'))).toHaveLength(1);
  });

  it('condição negada: !x ? a : b é x ? b : a', () => {
    const botao = (a: string, b: string) =>
      `<Button>{!porApi ? <Icon name="${a}" /> : <Icon name="${b}" />}{porApi ? 'publicar' : 'preparar pacote'}</Button>`;
    expect(erradas(casos(botao('package', 'upload')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(botao('upload', 'package')), regra('publicar'))).toHaveLength(1);
  });

  it('texto e ícone dentro de um fragmento do ramo', () => {
    const botao = (icone: string) =>
      `<Button>{aberto ? 'fechar a publicação' : <><Icon name="${icone}" />Publicar este</>}</Button>`;
    expect(erradas(casos(botao('upload')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(botao('rocket')), regra('publicar'))).toHaveLength(1);
  });

  it('ícone num ramo só não é cobrado do rótulo do outro', () => {
    const botao = `<Button>{aberto ? <Icon name="x" /> : null}{aberto ? 'fechar a publicação' : 'Publicar este'}</Button>`;
    expect(erradas(casos(botao), regra('publicar'))).toEqual([]);
  });

  it('gerar com a IA, no ChatGPT ou no Gemini é a estrela; gerar bruto não é', () => {
    expect(erradas(casos('<Button><Icon name="sparkles" />Gerar no Gemini</Button>'), regra('iaGera'))).toHaveLength(1);
    expect(erradas(casos('<Button><Icon name="sparkle" />Gerar no ChatGPT</Button>'), regra('iaGera'))).toEqual([]);
    expect(erradas(casos('<Button><Icon name="scissors" />Gerar bruto</Button>'), regra('iaGera'))).toEqual([]);
  });

  it('ícone e rótulo em ternários de condições diferentes, lado a lado', () => {
    // O botão "Gerar no Gemini" da capa: o spinner gira por uma condição, o
    // texto troca por outra. Sem par, vale a conferência por conjunto.
    const botao = (icone: string) =>
      `<Button>{pendente || conferindo ? <Icon name="loader-2" /> : <Icon name="${icone}" />}` +
      `{conferindo ? 'Gerando…' : 'Gerar no Gemini'}</Button>`;
    expect(erradas(casos(botao('sparkle')), regra('iaGera'))).toEqual([]);
    expect(erradas(casos(botao('sparkles')), regra('iaGera'))).toHaveLength(1);
  });

  it('rótulo mais fundo que o ícone (o "Gerar shorts com IA" da ShortsPage)', () => {
    const botao = (icone: string) =>
      `<Button>{pendente ? <Icon name="loader-2" /> : <Icon name="${icone}" />}` +
      `{pendente ? 'gerando…' : temBruto ? 'Gerar shorts com IA' : 'Gerar bruto e shorts com IA'}</Button>`;
    expect(erradas(casos(botao('sparkle')), regra('iaGera'))).toEqual([]);
    expect(erradas(casos(botao('sparkles')), regra('iaGera'))).not.toEqual([]);
  });

  it('ícone mais fundo que o rótulo', () => {
    const botao = (icone: string) =>
      `<Button>{aberto ? <Icon name="x" /> : enviando ? <Icon name="loader-2" /> : <Icon name="${icone}" />}` +
      `{aberto ? 'fechar a publicação' : 'Publicar este'}</Button>`;
    expect(erradas(casos(botao('upload')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(botao('rocket')), regra('publicar'))).toHaveLength(1);
  });

  it('ícone fixo ao lado de um ícone que só aparece num ramo', () => {
    const botao = (icone: string) =>
      `<Button><Icon name="${icone}" />{aberto ? <Icon name="x" /> : null}{aberto ? 'fechar' : 'Publicar este'}</Button>`;
    expect(erradas(casos(botao('upload')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(botao('rocket')), regra('publicar'))).toHaveLength(1);
  });

  it('&& no rótulo e no ícone', () => {
    const rotulo = (icone: string) => `<Button><Icon name="${icone}" />{!aberto && 'Publicar este'}</Button>`;
    expect(erradas(casos(rotulo('upload')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(rotulo('rocket')), regra('publicar'))).toHaveLength(1);
    const icones_ = (a: string, b: string) =>
      `<Button>{porApi && <Icon name="${a}" />}{!porApi && <Icon name="${b}" />}{porApi ? 'publicar' : 'preparar pacote'}</Button>`;
    expect(erradas(casos(icones_('upload', 'package')), regra('publicar'))).toEqual([]);
    expect(erradas(casos(icones_('package', 'upload')), regra('publicar'))).toHaveLength(1);
  });

  it('condição composta é avaliada pelos átomos: código certo não reprova', () => {
    // Variantes do "Publicar este" do workspace do Fire: `!aberto && pronto` e
    // `aberto || travado` dependem de `aberto`, como o ternário do ícone.
    const e = `<Button>{aberto ? <Icon name="x" /> : <Icon name="upload" />}{!aberto && pronto ? 'Publicar este' : 'fechar'}</Button>`;
    const ou = `<Button>{aberto ? <Icon name="x" /> : <Icon name="upload" />}{aberto || travado ? 'fechar' : 'Publicar este'}</Button>`;
    expect(erradas(casos(e), regra('publicar'))).toEqual([]);
    expect(erradas(casos(ou), regra('publicar'))).toEqual([]);
    expect(erradas(casos(ou.replace('"upload"', '"rocket"')), regra('publicar'))).toHaveLength(1);
  });

  it('acima do teto de condições, falha em voz alta em vez de cortar', () => {
    const muitas = Array.from({ length: 11 }, (_, i) => `{c${i} && 'x'}`).join('');
    expect(() => casos(`<Button title="Publicar">${muitas}</Button>`)).toThrow(/11 condições/);
  });

  it('a aba "IA" é a estrela; "Análise completa por IA" é o cérebro', () => {
    expect(erradas(casos('<button><Icon name="sparkles" />IA</button>'), regra('iaGera'))).toHaveLength(1);
    expect(erradas(casos('<p><Icon name="sparkle" /> Analise completa por IA</p>'), regra('analisar'))).toHaveLength(1);
  });

  it('o par primaryLabel/primaryIcon, ramo a ramo', () => {
    const modal = (icone: string) =>
      `<UpgradeModal primaryLabel={agendar ? 'Agendar no YouTube' : 'Enviar ao YouTube agora'} primaryIcon={${icone}} />`;
    expect(erradas(casos(modal("agendar ? 'clock' : 'upload'")), regra('publicar'))).toEqual([]);
    expect(erradas(casos(modal("agendar ? 'upload' : 'rocket'")), regra('publicar'))).toHaveLength(1);
  });
});
