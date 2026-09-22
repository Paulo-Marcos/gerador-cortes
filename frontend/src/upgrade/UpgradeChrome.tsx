import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { IconName } from './Icon';
import type { ScreenAction } from './ScreenHeader';
import type { Migalha } from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · Como a tela conversa com a casca.
//
// A regra que mantém isso honesto: a casca monta sozinha, pela ROTA,
// tudo o que não depende de dados — título, ícone, trilha, esteira da
// live. O que a tela declara aqui é o resto: quantos cortes, a lista
// lateral, o que o botão primário faz. E declarar é também decidir: a
// lista, o seletor e a barra de ações aparecem exatamente quando a tela
// os fornece.
//
// RODADA 2 · UMA lista no contrato, não duas.
//
// Até aqui a tela escrevia a mesma lista de cortes duas vezes —
// `contexto.itens` (coluna) e `seletor.itens` (painel) —, com formatos
// de legenda diferentes e títulos que já discordavam ("Cortes da live"
// na coluna, "Cortes de LIVE 267" no painel). A rodada 1 garantiu que
// as duas nunca aparecem juntas; esta garante que elas não podem
// DIVERGIR, porque são a mesma declaração:
//
//   lista  → o que mais existe aqui (título, resumo, filtros, itens)
//   atual  → o item em foco e como trocar dele (J/K, ‹ ›)
//
// A casca decide onde pintar: coluna quando a janela cabe, painel do
// seletor quando não. `contexto` e `seletor` continuam aceitos e são
// convertidos por `listaDoChrome` — nenhuma tela quebra ao aplicar o
// patch; as que forem tocadas ficam ~40 linhas menores.
// ─────────────────────────────────────────────────────────────────

/** Uma linha de lista — na coluna de contexto ou no painel do seletor. */
export type ItemDeLista = {
  id: string;
  /** Número do corte, quando existe: entra em mono, antes do título. */
  num?: string;
  titulo: string;
  legenda?: string;
  dur?: string;
  /** URL da miniatura real (`thumbnailUrl` / `resolveThumbUrl`). Sem ela a
   *  caixa não é desenhada: 14 retângulos cinza idênticos custavam 38 px de
   *  largura para não identificar nada. */
  thumb?: string;
  /** Cor da bolinha de estado à direita. */
  dot: string;
  ativo?: boolean;
  onClick?: () => void;
};

export type ChromeLista = {
  /** Identidade do conjunto — a live, o Fire. Aparece acima da lista. */
  cabecalho?: { titulo: string; sub?: string; thumb?: string };
  titulo: string;
  resumo?: string;
  filtros?: Array<{ texto: string; n: number; ativo?: boolean; onClick?: () => void }>;
  itens: ItemDeLista[];
  acao?: { texto: string; onClick?: () => void };
};

/** O item em foco e como trocar dele. */
export type ChromeAtual = {
  num?: string;
  titulo: string;
  onAnterior?: () => void;
  onProximo?: () => void;
  onVerTodos?: () => void;
};

/** Um passo da esteira da live, quando a tela conhece o estado real. */
export type EtapaProjeto = {
  icone: IconName;
  titulo: string;
  estado: 'feito' | 'agora' | 'todo';
  onClick?: () => void;
};

export type ChromeBarra = {
  secundario?: { texto: string; icone: IconName; onClick?: () => void };
  terciario?: { titulo: string; icone: IconName; onClick?: () => void };
  /** `desabilitado` quando a decisão ainda não é possível (nada pronto para
   *  publicar). O botão fica VISÍVEL e apagado, não some: a ausência dele
   *  mudaria a barra de lugar e esconderia a resposta "ainda não dá". */
  primario: {
    texto: string;
    icone: IconName;
    onClick?: () => void;
    desabilitado?: boolean;
    /** D-746: POR QUE está desabilitado, escrito ao lado. Botão apagado sem
     *  motivo obriga o operador a clicar para descobrir. */
    motivo?: string;
    /** D-746: ação cara e sem desfazer (render final): só no clique. O Enter
     *  solto não dispara ~20 min de GPU. */
    semEnter?: boolean;
  };
  /** D-746: o veredito editorial, separado da ação cara e com peso menor.
   *  Reversível: aprovado ⇄ proposto. */
  veredito?: { aprovado: boolean; ocupado?: boolean; onAlternar: () => void };
  /** Lembretes de teclado à esquerda. A casca injeta o de J/K quando há
   *  `atual` — declare aqui só o que a TELA acrescenta (Space, etc.). */
  teclas?: Array<{ teclas: string[]; texto: string }>;
  /** Controles de lote (destinos, agendamento) à esquerda do fiel. */
  extra?: ReactNode;
  /** D-610: qualificadores do item (Fire, Leitura). Ligam e desligam — não
   *  decidem —, mas moram AO LADO das decisões porque são dadas no mesmo
   *  momento: quem aprova um corte é quem sabe se ele é Fire. */
  alternancias?: ChromeAlternancia[];
};

export type ChromeAlternancia = {
  texto: string;
  icone: IconName;
  ativo: boolean;
  /** Cor de identidade quando ligada (fire = acento, leitura = info). */
  cor: string;
  corSuave: string;
  titulo?: string;
  ocupado?: boolean;
  onClick?: () => void;
  /** Ajuste do qualificador ligado (autor/parte da leitura): lápis ao lado. */
  editar?: { titulo: string; onClick: () => void };
};

export type ChromeEstado = {
  texto: string;
  icone: 'circle-check' | 'loader' | 'triangle-alert';
  cor: string;
  bg: string;
};

// ── Contrato antigo (rodada 1). Aceito, convertido, a caminho da saída ──

/** @deprecated use `lista`. */
export type ContextoItem = {
  id: string;
  titulo: string;
  legenda: string;
  dur?: string;
  thumb?: string;
  dot: string;
  ativo?: boolean;
  onClick?: () => void;
};

/** @deprecated use `lista` + `chrome.etapas`. */
export type ChromeContexto = {
  titulo: string;
  sub?: string;
  thumb?: string;
  etapas?: EtapaProjeto[];
  listaTitulo: string;
  listaResumo?: string;
  itens: ContextoItem[];
  acao?: { texto: string; onClick?: () => void };
};

/** @deprecated use `lista`. */
export type SeletorItem = {
  id: string;
  num: string;
  titulo: string;
  dur?: string;
  thumb?: string;
  inicio?: string;
  fim?: string;
  status: string;
  statusBg: string;
  statusCor: string;
  fire?: boolean;
  ativo?: boolean;
  onClick?: () => void;
};

/** @deprecated use `lista` + `atual`. */
export type ChromeSeletor = {
  num: string;
  titulo: string;
  listaTitulo: string;
  listaResumo?: string;
  itens: SeletorItem[];
  filtros?: Array<{ texto: string; n: number; ativo?: boolean; onClick?: () => void }>;
  onAnterior?: () => void;
  onProximo?: () => void;
  onVerTodos?: () => void;
};

export type Chrome = {
  /** Sobrescreve o título do cabeçalho quando ele depende de dados
      ("Corte #7 — O erro do BC"). Sem isso vale o título da rota. */
  titulo?: string;
  /** Subtítulo do cabeçalho — sempre com número, nunca decorativo. */
  sub?: string;
  acoes?: ScreenAction[];
  /** Bancada: o miolo ocupa a altura toda e rola por dentro, não por fora.
      Um player com barra de rolagem da página é um player que some.
      Nesta rodada `denso` também funde o cabeçalho de tela na barra
      superior — são ~46 px devolvidos ao player. */
  denso?: boolean;
  /** Migalhas do meio: "LIVE 267", "#7". String usa o destino padrão da
      rota; `{ texto, to }` quando a tela quer mandar no destino. */
  rotulos?: Array<string | Migalha>;
  /** Chip de estado na barra superior ("salvo", "salvando…", "erro"). */
  estado?: ChromeEstado;
  /** A lista do lado — coluna ou painel, a casca decide. */
  lista?: ChromeLista;
  /** O item em foco dentro dessa lista. */
  atual?: ChromeAtual;
  /** Estado real das fases da live, quando a tela o conhece. A fita já
   *  existe sem isto (ela sabe em que fase a rota está). */
  etapas?: EtapaProjeto[];
  /** @deprecated use `lista` (+ `chrome.etapas`). */
  contexto?: ChromeContexto;
  /** @deprecated use `lista` + `atual`. */
  seletor?: ChromeSeletor;
  barra?: ChromeBarra;
};

/**
 * Converte o contrato antigo no novo. Uma fonte para as duas vistas: o que
 * a coluna mostra e o que o painel mostra deixam de poder discordar.
 */
export function listaDoChrome(chrome: Chrome): { lista?: ChromeLista; atual?: ChromeAtual } {
  if (chrome.lista) return { lista: chrome.lista, atual: chrome.atual };

  const c = chrome.contexto;
  const s = chrome.seletor;
  if (!c && !s) return {};

  const itens: ItemDeLista[] = c
    ? c.itens.map((i) => ({
        id: i.id,
        titulo: i.titulo,
        legenda: i.legenda,
        dur: i.dur,
        thumb: i.thumb,
        dot: i.dot,
        ativo: i.ativo,
        onClick: i.onClick,
      }))
    : (s?.itens ?? []).map((i) => ({
        id: i.id,
        num: i.num,
        titulo: i.titulo,
        legenda: i.inicio ? `#${i.num} · ${i.inicio} → ${i.fim ?? ''}` : `#${i.num}`,
        dur: i.dur,
        thumb: i.thumb,
        dot: i.statusCor,
        ativo: i.ativo,
        onClick: i.onClick,
      }));

  const lista: ChromeLista = {
    cabecalho: c ? { titulo: c.titulo, sub: c.sub, thumb: c.thumb } : undefined,
    titulo: c?.listaTitulo ?? s?.listaTitulo ?? 'Itens',
    resumo: c?.listaResumo ?? s?.listaResumo,
    filtros: s?.filtros,
    itens,
    acao: c?.acao,
  };

  const atual: ChromeAtual | undefined =
    chrome.atual ??
    (s
      ? {
          num: s.num,
          titulo: s.titulo,
          onAnterior: s.onAnterior,
          onProximo: s.onProximo,
          onVerTodos: s.onVerTodos,
        }
      : undefined);

  return { lista, atual };
}

/** Estado real das fases, venha do campo novo ou do contexto antigo. */
export function etapasDoChrome(chrome: Chrome): EtapaProjeto[] | undefined {
  return chrome.etapas ?? chrome.contexto?.etapas;
}

type ChromeStore = {
  chrome: Chrome;
  definir: (c: Chrome | null) => void;
};

const ChromeContext = createContext<ChromeStore | null>(null);

export function UpgradeChromeProvider({ children }: { children: ReactNode }) {
  const [chrome, setChrome] = useState<Chrome>({});
  // `definir` precisa ser estável: ela entra no efeito de `useDefinirChrome`,
  // e uma identidade nova a cada render viraria laço infinito.
  const definir = useCallback((c: Chrome | null) => setChrome(c ?? {}), []);
  const valor = useMemo<ChromeStore>(() => ({ chrome, definir }), [chrome, definir]);
  return <ChromeContext.Provider value={valor}>{children}</ChromeContext.Provider>;
}

export function useChrome(): Chrome {
  return useContext(ChromeContext)?.chrome ?? {};
}

/**
 * Chamada pela tela para alimentar a casca. Limpa ao desmontar, senão
 * a barra de ações da tela anterior sobreviveria à navegação — e um
 * botão "Renderizar final" órfão numa tela de lista é pior do que
 * botão nenhum.
 */
export function useDefinirChrome(chrome: Chrome, deps: unknown[]) {
  const store = useContext(ChromeContext);
  useEffect(() => {
    if (!store) return;
    store.definir(chrome);
    return () => store.definir(null);
    // `chrome` é recriado a cada render; as deps da tela é que mandam.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
