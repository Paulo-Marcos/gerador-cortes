import type { IconName } from './Icon';

// ─────────────────────────────────────────────────────────────────
// D-599 · O mapa entre o protótipo e as rotas que existem de verdade.
//
// RODADA 2 · uma tabela, quatro consumidores. Antes a mesma tela era
// declarada em quatro lugares que precisavam concordar: `montarNavegacao`
// (trilho), `TELAS` da paleta do ⌘K, `TRILHA_BASE`+`ROTA_FIXA` (trilha) e
// `CABECALHO` (ícone e título). Já discordavam — a paleta oferecia a Fila,
// o trilho não. Agora existe `TELAS`, e trilho, paleta, trilha e cabeçalho
// são DERIVADOS dela: acrescentar tela é uma linha, e nenhuma das quatro
// vistas pode ficar para trás.
//
// A segunda mudança da rodada mora aqui também: `esteiraDaLive`. As cinco
// fases de uma live saíram do trilho (eram elas que faziam o menu global
// mudar de tamanho conforme a rota) e passaram a ser uma fita própria, com
// uma definição só — a desta tabela.
// ─────────────────────────────────────────────────────────────────

export type TelaId =
  | 'biblioteca'
  | 'projeto'
  | 'cortes'
  | 'pos'
  | 'metadados'
  | 'revisao'
  | 'shorts'
  | 'fire'
  | 'prateleira'
  | 'prontos'
  | 'lives'
  | 'ranking'
  | 'thumbs'
  | 'analises'
  | 'config'
  | 'atalhos'
  | 'fila'
  | 'kit'
  | 'erro';

/** Blocos do trilho. A divisão não é arrumação: "Produção" é o que se faz
 *  com o acervo de lives, "Inteligência" é o que se pergunta a ele, e
 *  "Ferramentas" é a ferramenta. */
export type Grupo = 'producao' | 'inteligencia' | 'ferramentas';

/** Uma migalha da trilha. Sem `to` ela é texto — é o caso da última. */
export type Migalha = { texto: string; to?: string };

/** Item de menu já resolvido: é o que o trilho e a paleta consomem. */
export type DestinoDeMenu = {
  id: TelaId;
  icone: IconName;
  texto: string;
  to: string;
  /** Todas as telas em que este item é o lugar onde a pessoa está. */
  telas: TelaId[];
};

/** O token `{}` marca onde entra um rótulo vindo da tela. */
const SLOT = '{}';

type Def = {
  icone: IconName;
  /** Título do cabeçalho de tela. */
  titulo: string;
  /** Rótulo curto, quando o título não cabe no trilho ou na trilha. */
  menu?: string;
  /** Rota canônica. Função porque algumas dependem do projeto aberto. */
  rota?: (projetoId: string | null) => string | undefined;
  /** Padrões de URL que caem nesta tela. */
  padroes?: RegExp[];
  /** Item do trilho a que esta tela pertence, quando ela é tela-filha:
   *  "Curar o Fire #7" não é destino de menu, é um lugar DENTRO de Shorts. */
  dentroDe?: TelaId;
  /** Bloco do trilho. Sem grupo, a tela não é item de menu. */
  grupo?: Grupo;
  /** Entra na busca do ⌘K. */
  paleta?: boolean;
  trilha: string[];
};

export const TELAS: Record<TelaId, Def> = {
  biblioteca: {
    icone: 'home',
    titulo: 'Biblioteca de lives',
    menu: 'Biblioteca',
    rota: () => '/projetos',
    padroes: [/^\/projetos\/?$/],
    grupo: 'producao',
    paleta: true,
    trilha: ['Biblioteca'],
  },
  projeto: {
    icone: 'layout-grid',
    titulo: 'Workspace do projeto',
    menu: 'Workspace',
    rota: (id) => (id ? `/projetos/${id}` : undefined),
    padroes: [/^\/projetos\/[^/]+$/],
    dentroDe: 'biblioteca',
    trilha: ['Biblioteca', SLOT],
  },
  cortes: {
    icone: 'scissors',
    titulo: 'Editor de cortes',
    menu: 'Cortes',
    rota: (id) => (id ? `/projetos/${id}/cortes` : undefined),
    padroes: [/^\/projetos\/[^/]+\/cortes/],
    dentroDe: 'biblioteca',
    trilha: ['Biblioteca', SLOT, 'Cortes', SLOT],
  },
  pos: {
    icone: 'clapperboard',
    titulo: 'Pós-produção',
    menu: 'Pós',
    rota: (id) => (id ? `/projetos/${id}/post-production` : undefined),
    padroes: [/^\/projetos\/[^/]+\/(post-production|export)/],
    dentroDe: 'biblioteca',
    trilha: ['Biblioteca', SLOT, 'Pós-produção', SLOT],
  },
  metadados: {
    icone: 'tags',
    titulo: 'Metadados & capas',
    menu: 'Metadados',
    rota: (id) => (id ? `/projetos/${id}/metadados` : undefined),
    padroes: [/^\/projetos\/[^/]+\/metadados/],
    dentroDe: 'biblioteca',
    trilha: ['Biblioteca', SLOT, 'Metadados', SLOT],
  },
  revisao: {
    icone: 'check-check',
    titulo: 'Revisão final',
    menu: 'Revisão',
    rota: (id) => (id ? `/projetos/${id}/final-review` : undefined),
    padroes: [/^\/projetos\/[^/]+\/final-review/],
    dentroDe: 'biblioteca',
    trilha: ['Biblioteca', SLOT, 'Revisão final'],
  },
  shorts: {
    icone: 'flame',
    titulo: 'Shorts',
    rota: () => '/shorts',
    padroes: [/^\/shorts\/?$/],
    grupo: 'producao',
    paleta: true,
    trilha: ['Shorts'],
  },
  fire: {
    icone: 'flame',
    titulo: 'Curadoria do Fire',
    padroes: [/^\/shorts\/[^/]+/],
    dentroDe: 'shorts',
    trilha: ['Shorts', SLOT, 'Curar'],
  },
  prateleira: {
    icone: 'layout-grid',
    titulo: 'Prateleira do Fire',
    padroes: [/^\/shorts\/[^/]+\/workspace/],
    dentroDe: 'shorts',
    trilha: ['Shorts', SLOT, 'Prateleira'],
  },
  // D-611: item próprio, e não filha de Shorts — ela não pertence a um Fire.
  prontos: {
    icone: 'send',
    titulo: 'Prontos para publicar',
    menu: 'Prontos',
    rota: () => '/prontos',
    padroes: [/^\/prontos/],
    grupo: 'producao',
    paleta: true,
    trilha: ['Prontos para publicar'],
  },
  lives: {
    icone: 'radio',
    titulo: 'Buscar lives do canal',
    menu: 'Buscar lives',
    rota: () => '/buscar-lives',
    padroes: [/^\/buscar-lives/],
    grupo: 'inteligencia',
    paleta: true,
    trilha: ['Inteligência', 'Buscar lives'],
  },
  ranking: {
    icone: 'trophy',
    titulo: 'Ranking de lives',
    menu: 'Ranking',
    rota: () => '/ranking-lives',
    padroes: [/^\/ranking-lives/],
    grupo: 'inteligencia',
    paleta: true,
    trilha: ['Inteligência', 'Ranking'],
  },
  thumbs: {
    icone: 'sparkles',
    titulo: 'Padrões de capa',
    rota: () => '/padroes-thumbnail',
    padroes: [/^\/padroes-thumbnail/],
    grupo: 'inteligencia',
    paleta: true,
    trilha: ['Inteligência', 'Padrões de capa'],
  },
  analises: {
    icone: 'bar-chart',
    titulo: 'Análises',
    rota: () => '/analises',
    padroes: [/^\/analises/],
    grupo: 'inteligencia',
    paleta: true,
    trilha: ['Inteligência', 'Análises'],
  },
  // A Fila não é item de bloco: ela já tem o cartão do pé do trilho, que
  // mostra progresso. Dois caminhos para a mesma tela, um deles sem
  // informação, seria o tipo de redundância que esta rodada está tirando.
  fila: {
    icone: 'loader',
    titulo: 'Fila de processamento',
    menu: 'Fila',
    rota: () => '/fila',
    padroes: [/^\/fila/],
    paleta: true,
    trilha: ['Fila'],
  },
  atalhos: {
    icone: 'keyboard',
    titulo: 'Atalhos',
    rota: () => '/atalhos',
    padroes: [/^\/atalhos/],
    grupo: 'ferramentas',
    paleta: true,
    trilha: ['Atalhos'],
  },
  config: {
    icone: 'settings',
    titulo: 'Configurações',
    rota: () => '/canais',
    padroes: [/^\/canais/],
    grupo: 'ferramentas',
    paleta: true,
    trilha: ['Configurações'],
  },
  // Andaime de dev: fora do trilho e fora da paleta em produção (as rotas
  // ficam sob `import.meta.env.DEV` no router).
  kit: {
    icone: 'layout-template',
    titulo: 'Componentes',
    padroes: [/^\/upgrade/],
    trilha: ['Componentes'],
  },
  erro: {
    icone: 'triangle-alert',
    titulo: 'Página não encontrada',
    trilha: ['Página não encontrada'],
  },
};

/**
 * Ordem de teste dos padrões — do mais específico para o mais geral.
 * `/shorts/7/workspace` tem de ser lido antes de `/shorts/7`, e
 * `/projetos/267/cortes` antes de `/projetos/267`.
 */
const ORDEM: TelaId[] = [
  'cortes',
  'pos',
  'metadados',
  'revisao',
  'projeto',
  'biblioteca',
  'prateleira',
  'fire',
  'shorts',
  'prontos',
  'lives',
  'ranking',
  'thumbs',
  'analises',
  'config',
  'atalhos',
  'fila',
  'kit',
];

export function telaDaRota(pathname: string): TelaId {
  for (const id of ORDEM) {
    if (TELAS[id].padroes?.some((re) => re.test(pathname))) return id;
  }
  return 'erro';
}

/** Id do projeto quando a rota está dentro de um; `null` fora dele. */
export function projetoDaRota(pathname: string): string | null {
  return /^\/projetos\/([^/]+)/.exec(pathname)?.[1] ?? null;
}

/** Id do corte quando a rota aponta para um corte específico. */
export function corteDaRota(pathname: string): string | null {
  return (
    /^\/projetos\/[^/]+\/cortes\/([^/]+)/.exec(pathname)?.[1] ??
    /^\/shorts\/([^/]+)/.exec(pathname)?.[1] ??
    null
  );
}

// ── Cabeçalho de tela ────────────────────────────────────────────
// Derivado da tabela. Subtítulo e ações dependem de dados e continuam
// chegando da tela, via `useDefinirChrome`.

export const CABECALHO: Record<TelaId, { icone: IconName; titulo: string }> = Object.fromEntries(
  (Object.keys(TELAS) as TelaId[]).map((id) => [
    id,
    { icone: TELAS[id].icone, titulo: TELAS[id].titulo },
  ]),
) as Record<TelaId, { icone: IconName; titulo: string }>;

// ── Trilho ───────────────────────────────────────────────────────

function telasDoItem(id: TelaId): TelaId[] {
  const filhas = (Object.keys(TELAS) as TelaId[]).filter((t) => TELAS[t].dentroDe === id);
  return [id, ...filhas];
}

/**
 * Os itens do trilho, por bloco. A lista é FIXA — não depende da rota.
 *
 * RODADA 2 · era aqui que a casca acrescentava cinco entradas quando havia
 * uma live aberta, empurrando Shorts, Inteligência e o rodapé 170 px para
 * baixo. Um menu global que muda de tamanho deixa de ser um lugar fixo, que
 * é a única coisa que um menu global precisa ser. As fases da live viraram
 * a fita de `esteiraDaLive`, e "Biblioteca" acende em todas elas: é de lá
 * que a live veio.
 */
export function menuDoTrilho(): Record<Grupo, DestinoDeMenu[]> {
  const grupos: Record<Grupo, DestinoDeMenu[]> = {
    producao: [],
    inteligencia: [],
    ferramentas: [],
  };
  for (const id of Object.keys(TELAS) as TelaId[]) {
    const def = TELAS[id];
    const to = def.grupo ? def.rota?.(null) : undefined;
    if (!def.grupo || !to) continue;
    grupos[def.grupo].push({
      id,
      icone: def.icone,
      texto: def.menu ?? def.titulo,
      to,
      telas: telasDoItem(id),
    });
  }
  return grupos;
}

// ── Paleta do ⌘K ─────────────────────────────────────────────────

export type DestinoDaPaleta = { id: string; icone: IconName; texto: string; dica: string; ir: string };

/** As telas alcançáveis pela busca, na ordem da tabela. */
export function destinosDaPaleta(): DestinoDaPaleta[] {
  const fora: TelaId[] = ['kit', 'erro'];
  return (Object.keys(TELAS) as TelaId[])
    .filter((id) => TELAS[id].paleta && !fora.includes(id))
    .flatMap((id) => {
      const to = TELAS[id].rota?.(null);
      if (!to) return [];
      return [
        {
          id: `t-${id}`,
          icone: TELAS[id].icone,
          texto: TELAS[id].titulo,
          dica: 'tela',
          ir: to,
        },
      ];
    });
}

// ── A esteira da live ────────────────────────────────────────────

export type PassoDaLive = {
  id: TelaId;
  icone: IconName;
  texto: string;
  to?: string;
  /** `true` na fase onde a pessoa está agora. */
  agora: boolean;
};

const ESTEIRA: TelaId[] = ['projeto', 'cortes', 'pos', 'metadados', 'revisao'];

/** As telas que pertencem a uma live — e portanto mostram a esteira. */
export function dentroDeUmaLive(tela: TelaId): boolean {
  return ESTEIRA.includes(tela);
}

/**
 * A esteira da live, na ordem do trabalho. Sai do trilho e passa a ser uma
 * fita própria, logo abaixo da barra superior: um lugar só, sempre o mesmo,
 * e apenas nas telas de dentro de uma live.
 *
 * Os estados "feito"/"a fazer" dependem de dados e continuam vindo da tela
 * (`chrome.etapas`) quando ela os tem; a fita sozinha já responde "em que
 * fase estou" e "como pulo para outra", que é o que o trilho respondia mal.
 */
export function esteiraDaLive(tela: TelaId, projetoId: string | null): PassoDaLive[] {
  if (!projetoId || !dentroDeUmaLive(tela)) return [];
  return ESTEIRA.map((id) => ({
    id,
    icone: TELAS[id].icone,
    texto: TELAS[id].menu ?? TELAS[id].titulo,
    to: TELAS[id].rota?.(projetoId),
    agora: id === tela,
  }));
}

// ── Trilha (breadcrumb) ──────────────────────────────────────────
// A última migalha é sempre a tela atual, em peso 700 e SEM destino:
// clicar em "onde estou" não é lugar nenhum. As anteriores situam e levam
// de volta.

/**
 * De qual tela cada migalha de texto fixo é o nome. "Inteligência" fica de
 * fora de propósito: é nome de BLOCO do trilho, não de tela — dar a ela um
 * link seria prometer uma página que não existe.
 */
const TELA_DA_MIGALHA: Record<string, TelaId> = {
  Biblioteca: 'biblioteca',
  Shorts: 'shorts',
  Cortes: 'cortes',
  'Pós-produção': 'pos',
  Metadados: 'metadados',
  'Revisão final': 'revisao',
  Fila: 'fila',
  Configurações: 'config',
  Atalhos: 'atalhos',
};

/**
 * Destino PADRÃO de cada slot, por tela e por posição. É o que torna
 * "LIVE 267" clicável sem que nenhuma tela mude uma linha: o primeiro slot
 * das telas de dentro de uma live é sempre a própria live.
 */
const SLOT_ROTA: Partial<Record<TelaId, Array<(projetoId: string | null) => string | undefined>>> = {
  cortes: [(id) => TELAS.projeto.rota?.(id)],
  pos: [(id) => TELAS.projeto.rota?.(id)],
  metadados: [(id) => TELAS.projeto.rota?.(id)],
  revisao: [(id) => TELAS.projeto.rota?.(id)],
};

/**
 * Monta a trilha preenchendo os slots `{}` com `rotulos`, na ordem.
 * Slots sobrando somem; rótulos sobrando são ignorados.
 *
 * `rotulos` aceita string (o caso comum — o destino vem de SLOT_ROTA) ou
 * `{ texto, to }` quando a tela quer mandar no destino.
 */
export function trilhaDaTela(
  tela: TelaId,
  rotulos: Array<string | Migalha> = [],
  projetoId: string | null = null,
): Migalha[] {
  const base = TELAS[tela]?.trilha ?? TELAS.biblioteca.trilha;
  const destinosDeSlot = SLOT_ROTA[tela] ?? [];
  let proximo = 0;

  const migalhas = base.flatMap<Migalha>((parte) => {
    if (parte !== SLOT) {
      const alvo = TELA_DA_MIGALHA[parte];
      return [{ texto: parte, to: alvo ? TELAS[alvo].rota?.(projetoId) : undefined }];
    }
    const posicao = proximo;
    const rotulo = rotulos[posicao];
    proximo += 1;
    if (!rotulo) return [];
    if (typeof rotulo === 'string') {
      return [{ texto: rotulo, to: destinosDeSlot[posicao]?.(projetoId) }];
    }
    return [{ texto: rotulo.texto, to: rotulo.to ?? destinosDeSlot[posicao]?.(projetoId) }];
  });

  // A última migalha é o lugar onde a pessoa já está. Link para cá só
  // gastaria um clique para não sair do lugar.
  if (migalhas.length > 0) {
    migalhas[migalhas.length - 1] = { texto: migalhas[migalhas.length - 1].texto };
  }

  return migalhas;
}
