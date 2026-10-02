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
  { conceito: 'editar', rotulo: /^(editar\b|voltar à edição|ir para a edição)/i, icone: ICONE_DO_CONCEITO.editar },
  { conceito: 'urlPublicada', rotulo: /^informar a url/i, icone: ICONE_DO_CONCEITO.urlPublicada },
  { conceito: 'auditar', rotulo: /^audit(ar\b|oria da análise)/i, icone: ICONE_DO_CONCEITO.auditar },
  {
    conceito: 'iaGera',
    // "Gerar bruto" é render (tesoura); gerar COM a IA — trechos, o que falta,
    // no ChatGPT, no Gemini — é a estrela.
    rotulo: /^gerar (trechos|o que falta)\b|^gerar\b.*\b(com (a )?ia|no chatgpt|no gemini)\b/i,
    icone: ICONE_DO_CONCEITO.iaGera,
  },
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
  const proprios = atributo(abertura.attributes, ATRIBUTOS_DE_ICONE);
  for (const valor of proprios) {
    for (const nome of icones(valor)) achados.add(nome);
  }
  // O botão de IA desenha o "IA gera" quando ninguém diz outro ícone: sem isto,
  // "Analisar…" num AcaoDeIa sem `icone` passava com um ícone que não estava
  // na tela (achado da auditoria do #107).
  if (abertura.tagName.getText() === 'AcaoDeIa' && proprios.length === 0) achados.add(ICONE_DO_CONCEITO.iaGera);
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

/** Desembrulha `{…}`, `(…)` e `x as T`. */
function nu(no: ts.Node): ts.Node {
  if (ts.isJsxExpression(no) && no.expression) return nu(no.expression);
  if (ts.isParenthesizedExpression(no) || ts.isAsExpression(no)) return nu(no.expression);
  return no;
}

type Folha = { caminho: string; no: ts.Node };

/**
 * As folhas de um ternário, cada uma com o caminho de condições até ela
 * (`a?`, `a:b?`…), para ternário aninhado. A negação vira a mesma condição
 * com os ramos trocados: `!porApi ? x : y` é `porApi ? y : x`.
 */
function folhas(no: ts.Node, caminho = ''): Folha[] {
  const n = nu(no);
  if (!ts.isConditionalExpression(n)) return [{ caminho, no: n }];
  let condicao = nu(n.condition);
  let sim: ts.Node = n.whenTrue;
  let nao: ts.Node = n.whenFalse;
  while (ts.isPrefixUnaryExpression(condicao) && condicao.operator === ts.SyntaxKind.ExclamationToken) {
    condicao = nu(condicao.operand);
    [sim, nao] = [nao, sim];
  }
  const c = condicao.getText();
  return [...folhas(sim, `${caminho}${c}?`), ...folhas(nao, `${caminho}${c}:`)];
}

/** O texto de uma folha — inclusive o de dentro de um fragmento `<>…</>`. */
function textosDaFolha(no: ts.Node): string[] {
  if (ts.isJsxFragment(no) || ts.isJsxElement(no)) {
    return no.children.flatMap((f) => {
      if (ts.isJsxText(f)) return f.text.trim() ? [f.text.trim()] : [];
      if (ts.isJsxExpression(f)) return textos(f);
      if (ts.isJsxElement(f) || ts.isJsxFragment(f)) return textosDaFolha(f);
      return [];
    });
  }
  return textos(no);
}

/**
 * Os ícones de uma folha: os <Icon name=…> desenhados nela e o nome vindo do
 * dicionário. String solta só conta como ícone quando a folha é valor de um
 * atributo de ícone — num filho JSX, string é texto.
 */
function iconesDaFolha(no: ts.Node, literalVale: boolean): string[] {
  if (ts.isJsxSelfClosingElement(no) || ts.isJsxElement(no) || ts.isJsxFragment(no)) {
    const achados: string[] = [];
    const ver = (n: ts.Node): void => {
      if (ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'Icon') {
        achados.push(...atributo(n.attributes, new Set(['name'])).flatMap(icones));
      }
      ts.forEachChild(n, ver);
    };
    ver(no);
    return achados;
  }
  if (ts.isPropertyAccessExpression(no)) return icones(no);
  return literalVale ? icones(no) : [];
}

type Par = { rotulos: string[]; icones: Set<string> };
type FonteDeIcone = { no: ts.Node; literalVale: boolean };

/**
 * Rótulo e ícone escolhidos pelas MESMAS condições andam juntos, folha a folha:
 * `porApi ? 'publicar' : 'preparar pacote'` com `porApi ? <upload/> : <package/>`.
 * Sem o par, trocar os ícones de lado passava — o conjunto era o mesmo
 * (achados das auditorias do #107). Devolve também o que foi pareado, para
 * sair da conferência por conjunto: o ícone que só existe num ramo não pode
 * ser cobrado do rótulo do outro.
 */
function pares(deRotulo: ts.Node[], deIcone: FonteDeIcone[]) {
  const saida: Par[] = [];
  const rotulosUsados = new Set<string>();
  const iconesUsados = new Set<string>();
  const condicional = (no: ts.Node) => ts.isConditionalExpression(nu(no));
  for (const r of deRotulo.filter(condicional)) {
    const fr = folhas(r);
    // Ternário sem texto (só ícones) não é fonte de rótulo: pareado consigo
    // mesmo, ele marcava os ícones como conferidos sem rótulo nenhum, e o
    // "Gerar no Gemini" ao lado saía da conferência.
    if (!fr.some((a) => textosDaFolha(a.no).length)) continue;
    for (const fonte of deIcone.filter((f) => condicional(f.no))) {
      const fi = folhas(fonte.no);
      const iconesDe_ = (f: Folha) => iconesDaFolha(f.no, fonte.literalVale);
      // Ternário que não desenha ícone (só texto) não é fonte de ícone.
      if (!fi.some((f) => iconesDe_(f).length)) continue;
      if (!fr.some((a) => fi.some((b) => b.caminho === a.caminho))) continue;
      for (const a of fr) {
        const b = fi.find((x) => x.caminho === a.caminho);
        const rotulos = textosDaFolha(a.no);
        rotulos.forEach((x) => rotulosUsados.add(x));
        saida.push({ rotulos, icones: new Set(b ? iconesDe_(b) : []) });
      }
      fi.forEach((b) => iconesDe_(b).forEach((x) => iconesUsados.add(x)));
    }
  }
  return { pares: saida, rotulosUsados, iconesUsados };
}

function acoesDoCodigo(arquivo: string, codigo: string): Acao[] {
  const fonte = ts.createSourceFile(arquivo, codigo, ts.ScriptTarget.Latest, true);
  const linha = (no: ts.Node) => fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
  const acoes: Acao[] = [];
  const registrar = (no: ts.Node, { rotulos, icones: achados }: Par) => {
    if (rotulos.length && achados.size) acoes.push({ arquivo, linha: linha(no), rotulos, icones: achados });
  };
  // A conferência por conjunto, sem o que já foi conferido par a par.
  const conjunto = (
    no: ts.Node,
    rotulos: string[],
    achados: Iterable<string>,
    usados: ReturnType<typeof pares>,
  ) => {
    registrar(no, {
      rotulos: rotulos.filter((r) => !usados.rotulosUsados.has(r)),
      icones: new Set([...achados].filter((i) => !usados.iconesUsados.has(i))),
    });
    usados.pares.forEach((p) => registrar(no, p));
  };

  const visitar = (no: ts.Node): void => {
    if (ts.isJsxElement(no) || ts.isJsxSelfClosingElement(no)) {
      const abertura = ts.isJsxElement(no) ? no.openingElement : no;
      const filhos = ts.isJsxElement(no) ? no.children.filter(ts.isJsxExpression) : [];
      const deRotulo = [...atributo(abertura.attributes, ATRIBUTOS_DE_ROTULO), ...filhos];
      const deIcone = [
        ...atributo(abertura.attributes, ATRIBUTOS_DE_ICONE).map((n) => ({ no: n, literalVale: true })),
        ...filhos.map((n) => ({ no: n, literalVale: false })),
      ];
      const achados = new Set<string>();
      iconesDe(no, achados);
      conjunto(no, rotulosDe(no), achados, pares(deRotulo, deIcone));
      // O botão principal de um modal vem em par de props (primaryLabel e
      // primaryIcon): é uma ação à parte da do título.
      const rotuloPrimario = atributo(abertura.attributes, new Set(['primaryLabel']));
      const iconePrimario = atributo(abertura.attributes, new Set(['primaryIcon']));
      conjunto(
        no,
        rotuloPrimario.flatMap(textos),
        iconePrimario.flatMap(icones),
        pares(rotuloPrimario, iconePrimario.map((n) => ({ no: n, literalVale: true }))),
      );
    } else if (ts.isObjectLiteralExpression(no)) {
      const rotulos: string[] = [];
      const achados = new Set<string>();
      for (const p of no.properties) {
        if (!ts.isPropertyAssignment(p)) continue;
        const nome = p.name.getText().replace(/['"]/g, '');
        if (ATRIBUTOS_DE_ROTULO.has(nome)) rotulos.push(...textos(p.initializer));
        if (ATRIBUTOS_DE_ICONE.has(nome)) for (const i of icones(p.initializer)) achados.add(i);
      }
      registrar(no, { rotulos, icones: achados });
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

  it('o par primaryLabel/primaryIcon, ramo a ramo', () => {
    const modal = (icone: string) =>
      `<UpgradeModal primaryLabel={agendar ? 'Agendar no YouTube' : 'Enviar ao YouTube agora'} primaryIcon={${icone}} />`;
    expect(erradas(casos(modal("agendar ? 'clock' : 'upload'")), regra('publicar'))).toEqual([]);
    expect(erradas(casos(modal("agendar ? 'upload' : 'rocket'")), regra('publicar'))).toHaveLength(1);
  });
});
