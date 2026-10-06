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
// O dicionário (REGRAS) e o leitor de código moram em `conceitosDoApp.ts`.

import { ICONE_DO_CONCEITO } from '@/upgrade/Icon';
import { REGRAS, acoesDoCodigo, erradas, regra, todasAsAcoes } from './conceitosDoApp';

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
    // Um <Icon name={ICONE_DO_CONCEITO.editar}> (o "Editar" da linha do
    // corte, rótulo em texto desde a D-868) e um icone={ICONE_DO_CONCEITO.iaGera}
    // (gerar trechos de todos).
    expect(comDicionario.some((a) => a.rotulos.includes('Editar'))).toBe(true);
    expect(rotulosVistos).toContain('Gerar trechos de todos os cortes');
  });

  it.each(REGRAS)('ação de "$conceito" usa o ícone $icone', (r) => {
    expect(erradas(acoes, r)).toEqual([]);
  });

  // Regra que não casa com nada não reprova nada: o exemplo de cada caminho
  // tem de estar no app e casar com a regex (pr-audit do #144).
  it.each(REGRAS)('a regra de "$conceito" casa com o rótulo real de cada caminho', ({ rotulo, exemplos }) => {
    const reais = new Set(acoes.flatMap((a) => a.rotulos));
    expect(exemplos.filter((e) => !reais.has(e))).toEqual([]);
    expect(exemplos.filter((e) => !rotulo.test(e))).toEqual([]);
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
