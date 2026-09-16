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

// ─────────────────────────────────────────────────────────────────
// D-599 · Como a tela conversa com a casca.
//
// No protótipo tudo vem de um objeto só porque existe um componente
// só. Aqui a tela e a casca são vizinhas separadas pelo router, e
// prop-drilling através do <Outlet/> não é opção.
//
// A regra que mantém isso honesto: a casca monta sozinha, pela ROTA,
// tudo o que não depende de dados — título, ícone, trilha. O que a
// tela declara aqui é o resto: quantos cortes, a lista lateral, o que
// o botão primário faz. E declarar é também decidir: a coluna de
// contexto, o seletor e a barra de ações aparecem exatamente quando a
// tela os fornece. Sem dados, a casca ainda desenha — apenas mais
// quieta.
// ─────────────────────────────────────────────────────────────────

export type ContextoItem = {
  id: string;
  titulo: string;
  legenda: string;
  dur?: string;
  /** Cor da bolinha de estado à direita. */
  dot: string;
  ativo?: boolean;
  onClick?: () => void;
};

export type EtapaProjeto = {
  icone: IconName;
  titulo: string;
  estado: 'feito' | 'agora' | 'todo';
  onClick?: () => void;
};

export type ChromeContexto = {
  titulo: string;
  sub?: string;
  etapas?: EtapaProjeto[];
  listaTitulo: string;
  listaResumo?: string;
  itens: ContextoItem[];
  acao?: { texto: string; onClick?: () => void };
};

export type SeletorItem = {
  id: string;
  num: string;
  titulo: string;
  dur?: string;
  inicio?: string;
  fim?: string;
  status: string;
  statusBg: string;
  statusCor: string;
  fire?: boolean;
  ativo?: boolean;
  onClick?: () => void;
};

export type ChromeSeletor = {
  /** O que aparece fechado: "#7 · O erro do BC…". */
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

export type ChromeBarra = {
  secundario?: { texto: string; icone: IconName; onClick?: () => void };
  terciario?: { titulo: string; icone: IconName; onClick?: () => void };
  primario: { texto: string; icone: IconName; onClick?: () => void };
  /** Lembretes de teclado à esquerda ("J K trocar de corte"). */
  teclas?: Array<{ teclas: string[]; texto: string }>;
  /** Controles de lote (destinos, agendamento) à esquerda do fiel. */
  extra?: ReactNode;
};

export type ChromeEstado = {
  texto: string;
  icone: 'circle-check' | 'loader' | 'triangle-alert';
  cor: string;
  bg: string;
};

export type Chrome = {
  /** Sobrescreve o título do cabeçalho quando ele depende de dados
      ("Corte #7 — O erro do BC"). Sem isso vale o título da rota. */
  titulo?: string;
  /** Subtítulo do cabeçalho — sempre com número, nunca decorativo. */
  sub?: string;
  acoes?: ScreenAction[];
  /** Migalhas do meio: "LIVE 267", "#7". */
  rotulos?: string[];
  /** Chip de estado na barra superior ("salvo", "salvando…", "erro"). */
  estado?: ChromeEstado;
  contexto?: ChromeContexto;
  seletor?: ChromeSeletor;
  barra?: ChromeBarra;
};

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
