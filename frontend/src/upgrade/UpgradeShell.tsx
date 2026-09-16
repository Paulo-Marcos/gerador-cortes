import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  WorkbenchQueueProvider,
  useWorkbenchQueueOptional,
  type QueueJob,
} from '@/components/workbench/useWorkbenchQueue';
import { ActionBar } from './ActionBar';
import { ContextColumn } from './ContextColumn';
import {
  GlobalRail,
  TRILHO_ESTREITO,
  TRILHO_LARGO,
  type FilaDoTrilho,
  type ItemTrilho,
} from './GlobalRail';
import { Icon } from './Icon';
import { PaletaDeComandos } from './PaletaDeComandos';
import { ScreenHeader } from './ScreenHeader';
import { TopBar } from './TopBar';
import { UpgradeChromeProvider, useChrome, type Chrome, type ChromeBarra } from './UpgradeChrome';
import { CABECALHO, projetoDaRota, telaDaRota, trilhaDaTela } from './upgradeRoutes';
import { useUpgradeTheme } from './useUpgradeTheme';

// ─────────────────────────────────────────────────────────────────
// D-599 · A casca.
//
// Quatro faixas, sempre nesta ordem: trilho (onde posso ir) → barra
// superior (onde estou) → contexto (o que mais existe aqui) →
// conteúdo, com a barra de ações ancorada embaixo. Só o miolo rola.
// É essa fixidez que faz a casca desaparecer da atenção: quem usa
// para de procurar as coisas e passa a saber onde elas estão.
//
// RODADA 1 · três decisões que estavam espalhadas voltaram para cá,
// onde valem para as 17 telas de uma vez:
//
//   1. A coluna de contexto aparece por MEDIDA DE JANELA, não por
//      `display:none` no CSS. Com ela na tela o seletor encolhe (a
//      mesma lista duas vezes era ruído); sem ela, o seletor recebe a
//      identidade da live e a esteira que a coluna levava embora.
//   2. Enter dispara o botão primário da barra — o ↵ que ele já
//      exibia finalmente é verdade.
//   3. O lembrete "J K trocar de corte" é emitido pela casca sempre
//      que existir seletor. Antes só a Bancada o declarava, e em
//      Metadados as teclas funcionavam em silêncio.
// ─────────────────────────────────────────────────────────────────

const TRILHO_KEY = 'upgrade-trilho';

/** Largura a partir da qual cabem trilho + contexto + miolo. */
const LARGURA_CONTEXTO = '(min-width: 1241px)';

/**
 * O cartao da fila no pe do trilho. Mostra o job que esta ANDANDO; sem
 * nenhum ativo, o cartao some — um anel parado em 0% ocuparia espaco para
 * dizer "nada acontecendo", que e justamente o que o silencio ja diz.
 */
function filaDoTrilho(jobs: QueueJob[]): FilaDoTrilho | undefined {
  const ativos = jobs.filter((j) => j.estado === 'rodando' || j.estado === 'aguardando');
  if (ativos.length === 0) return undefined;
  const rodando = ativos.find((j) => j.estado === 'rodando') ?? ativos[0];
  return {
    titulo: `Fila · ${ativos.length} job${ativos.length === 1 ? '' : 's'}`,
    sub: `${rodando.rotuloTipo} ${Math.round(rodando.progresso)}%`,
    progresso: rodando.progresso,
    to: '/fila',
  };
}

function useTrilho() {
  const [expandido, setExpandido] = useState(() => {
    try {
      return window.localStorage.getItem(TRILHO_KEY) !== 'recolhido';
    } catch {
      return true;
    }
  });

  const alternar = useCallback(() => {
    setExpandido((atual) => {
      const proximo = !atual;
      try {
        window.localStorage.setItem(TRILHO_KEY, proximo ? 'expandido' : 'recolhido');
      } catch {
        // preferência some ao recarregar; não vale derrubar a casca por isso
      }
      return proximo;
    });
  }, []);

  return { expandido, alternar };
}

/** `true` enquanto a janela couber a coluna de contexto. */
function useJanelaLarga(): boolean {
  const [larga, setLarga] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return true;
    return window.matchMedia(LARGURA_CONTEXTO).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(LARGURA_CONTEXTO);
    const aoMudar = (e: MediaQueryListEvent) => setLarga(e.matches);
    mq.addEventListener('change', aoMudar);
    setLarga(mq.matches);
    return () => mq.removeEventListener('change', aoMudar);
  }, []);

  return larga;
}

/** Há um diálogo modal aberto? Nesse caso o teclado é dele, não da casca. */
function overlayAberto(): boolean {
  return document.querySelector('[aria-modal="true"]') !== null;
}

/** Atalhos da casca: ⌘B recolhe o trilho, ⌘K busca, J/K trocam de corte,
 *  Enter dispara a ação primária da barra. */
function useAtalhosDaCasca(alternarTrilho: () => void, abrirBusca: () => void, chrome: Chrome) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      // Digitar "j" num campo de título não pode trocar de corte.
      const digitando =
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLTextAreaElement ||
        alvo instanceof HTMLSelectElement ||
        alvo?.isContentEditable === true;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        alternarTrilho();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        abrirBusca();
        return;
      }

      // Com um modal aberto o teclado pertence ao modal. Sem esta trava,
      // J/K trocavam o corte ATRÁS do diálogo e o Enter disparava duas
      // ações ao mesmo tempo.
      if (digitando || e.metaKey || e.ctrlKey || e.altKey || overlayAberto()) return;

      if (e.key === 'j') {
        chrome.seletor?.onProximo?.();
        return;
      }
      if (e.key === 'k') {
        chrome.seletor?.onAnterior?.();
        return;
      }
      // O ↵ desenhado no botão primário passa a ser verdade. Botão
      // desabilitado não responde — e a ActionBar esconde o ↵ nesse caso.
      if (e.key === 'Enter') {
        const primario = chrome.barra?.primario;
        if (!primario || primario.desabilitado || !primario.onClick) return;
        e.preventDefault();
        primario.onClick();
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [alternarTrilho, abrirBusca, chrome.seletor, chrome.barra]);
}

function montarNavegacao(projetoId: string | null): {
  producao: ItemTrilho[];
  inteligencia: ItemTrilho[];
  rodape: ItemTrilho[];
} {
  const producao: ItemTrilho[] = [
    { icone: 'home', texto: 'Biblioteca', to: '/projetos', telas: ['biblioteca'] },
  ];

  // O bloco da live só existe quando há uma live aberta. No protótipo
  // ele é fixo porque a live é uma só; aqui, mostrar "Cortes" sem
  // projeto seria oferecer uma porta que não abre.
  //
  // RODADA 2 vai tirar estas cinco entradas do trilho e levar a esteira
  // para o contexto da live — é ela que faz o trilho mudar de tamanho
  // conforme a rota. Até lá, ao menos as telas-filhas acendem certo.
  if (projetoId) {
    producao.push(
      {
        icone: 'layout-grid',
        texto: 'Esta live',
        to: `/projetos/${projetoId}`,
        telas: ['projeto'],
      },
      {
        icone: 'scissors',
        texto: 'Cortes',
        to: `/projetos/${projetoId}/cortes`,
        telas: ['cortes'],
      },
      {
        icone: 'clapperboard',
        texto: 'Pós-produção',
        to: `/projetos/${projetoId}/post-production`,
        telas: ['pos'],
      },
      {
        icone: 'tags',
        texto: 'Metadados',
        to: `/projetos/${projetoId}/metadados`,
        telas: ['metadados'],
      },
      {
        icone: 'check-check',
        texto: 'Revisão final',
        to: `/projetos/${projetoId}/final-review`,
        telas: ['revisao'],
      },
    );
  }

  // Curar um Fire e despachar a prateleira são lugares DENTRO de Shorts,
  // não destinos próprios do menu: entram como telas do mesmo item.
  producao.push({
    icone: 'flame',
    texto: 'Shorts',
    to: '/shorts',
    telas: ['shorts', 'fire', 'prateleira'],
  });

  return {
    producao,
    inteligencia: [
      { icone: 'radio', texto: 'Buscar lives', to: '/buscar-lives', telas: ['lives'] },
      { icone: 'trophy', texto: 'Ranking', to: '/ranking-lives', telas: ['ranking'] },
      { icone: 'sparkles', texto: 'Padrões de capa', to: '/padroes-thumbnail', telas: ['thumbs'] },
      { icone: 'bar-chart', texto: 'Análises', to: '/analises', telas: ['analises'] },
    ],
    // `/upgrade/kit` saiu daqui: é rota de nível superior, FORA da casca —
    // clicar nela descartava trilho e barra superior, sem volta. Continua
    // alcançável pela URL e pelo ⌘K, que é onde andaime de dev deve morar.
    rodape: [
      { icone: 'keyboard', texto: 'Atalhos', to: '/atalhos', telas: ['atalhos'] },
      { icone: 'settings', texto: 'Configurações', to: '/canais', telas: ['config'] },
    ],
  };
}

/** Injeta o lembrete de J/K quando existe seletor e a tela não declarou o seu. */
function barraComTeclas(barra: ChromeBarra, temSeletor: boolean): ChromeBarra {
  if (!temSeletor) return barra;
  const jaTem = barra.teclas?.some((t) => t.teclas.includes('J'));
  if (jaTem) return barra;
  return {
    ...barra,
    teclas: [{ teclas: ['J', 'K'], texto: 'trocar de corte' }, ...(barra.teclas ?? [])],
  };
}

/**
 * A casca em si. `children` existe para as rotas de vitrine; em uso
 * normal ela renderiza o `<Outlet/>` do router.
 */
type CascaProps = {
  children?: ReactNode;
  /** Cartão da fila no pé do trilho. Ainda chega de fora: a fila real
      entra quando a tela de Fila for migrada. */
  fila?: FilaDoTrilho;
};

function Casca({ children, fila }: CascaProps) {
  const { pathname } = useLocation();
  const { theme, toggleTheme, glass } = useUpgradeTheme();
  const { expandido, alternar } = useTrilho();
  const chrome = useChrome();
  const filaGlobal = useWorkbenchQueueOptional();
  const janelaLarga = useJanelaLarga();

  const tela = telaDaRota(pathname);
  const projetoId = projetoDaRota(pathname);
  const nav = useMemo(() => montarNavegacao(projetoId), [projetoId]);
  const cab = CABECALHO[tela];

  const navigate = useNavigate();
  const [buscaAberta, setBuscaAberta] = useState(false);
  const abrirBusca = useCallback(() => setBuscaAberta(true), []);
  useAtalhosDaCasca(alternar, abrirBusca, chrome);
  const jobsRodando = (filaGlobal?.jobs ?? []).filter((j) => j.estado === 'rodando').length;

  // Quem decide se a coluna de contexto e o seletor aparecem é a TELA,
  // pelo simples ato de fornecer os dados. Duplicar essa decisão numa
  // tabela por rota só criaria duas fontes da verdade que um dia
  // discordariam — e a rota nunca sabe se a lista veio vazia.
  //
  // O que a CASCA decide é onde o contexto cabe: na coluna (janela larga)
  // ou dentro do painel do seletor (janela estreita). Nunca nos dois.
  const contextoNaColuna = Boolean(chrome.contexto) && janelaLarga;
  const trilha = useMemo(
    () => trilhaDaTela(tela, chrome.rotulos, projetoId),
    [tela, chrome.rotulos, projetoId],
  );

  return (
    <div
      className="ap"
      data-theme={theme}
      data-glass={glass ? '1' : '0'}
      style={{
        display: 'grid',
        gridTemplateColumns: `${expandido ? TRILHO_LARGO : TRILHO_ESTREITO} 1fr`,
        height: '100dvh',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <GlobalRail
        expandido={expandido}
        onAlternar={alternar}
        telaAtual={tela}
        producao={nav.producao}
        inteligencia={nav.inteligencia}
        rodape={nav.rodape}
        fila={fila ?? filaDoTrilho(filaGlobal?.jobs ?? [])}
      />

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <TopBar
          trilha={trilha}
          seletor={chrome.seletor}
          seletorCompacto={contextoNaColuna}
          contextoNoPainel={contextoNaColuna ? undefined : chrome.contexto}
          estado={chrome.estado}
          tema={theme}
          onAlternarTema={toggleTheme}
          onAbrirBusca={abrirBusca}
          onAbrirAvisos={() => navigate('/fila')}
          avisosAtivos={jobsRodando}
        />
        <PaletaDeComandos aberta={buscaAberta} onFechar={() => setBuscaAberta(false)} />

        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
          {contextoNaColuna && chrome.contexto ? (
            <ContextColumn contexto={chrome.contexto} />
          ) : null}

          <main
            style={{
              display: 'flex',
              flexDirection: 'column',
              minWidth: 0,
              flex: 1,
              minHeight: 0,
            }}
          >
            <ScreenHeader
              icone={cab.icone}
              titulo={chrome.titulo ?? cab.titulo}
              sub={chrome.sub}
              acoes={chrome.acoes}
            />

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: chrome.denso ? 'hidden' : 'auto',
                padding: chrome.denso ? '0 12px 12px' : '4px 18px 18px',
              }}
            >
              <Suspense
                fallback={
                  <div
                    style={{
                      display: 'grid',
                      placeItems: 'center',
                      padding: 48,
                      color: 'var(--dim)',
                    }}
                  >
                    <Icon name="loader" size={20} />
                  </div>
                }
              >
                {children ?? <Outlet />}
              </Suspense>
            </div>

            {chrome.barra ? (
              <ActionBar barra={barraComTeclas(chrome.barra, Boolean(chrome.seletor))} />
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

export function UpgradeShell({ children, fila }: CascaProps) {
  return (
    // A fila e o provider mais externo: o cartao do trilho e a tela de Fila
    // precisam da MESMA lista, e um job disparado em qualquer tela tem de
    // aparecer nos dois sem passar pelo chrome.
    <WorkbenchQueueProvider>
      <UpgradeChromeProvider>
        <Casca fila={fila}>{children}</Casca>
      </UpgradeChromeProvider>
    </WorkbenchQueueProvider>
  );
}
