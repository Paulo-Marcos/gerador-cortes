import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import {
  WorkbenchQueueProvider,
  useWorkbenchQueueOptional,
  type QueueJob,
} from '@/components/workbench/useWorkbenchQueue';
import { ActionBar } from './ActionBar';
import { ColunaRecolhida, ContextColumn } from './ContextColumn';
import { FitaDaLive } from './FitaDaLive';
import { GavetaDaFila } from './GavetaDaFila';
import { GlobalRail, TRILHO_ESTREITO, TRILHO_LARGO, type FilaDoTrilho } from './GlobalRail';
import {
  useAtalhosDeHistorico,
  useHistoricoDaCasca,
  visitar,
  visitarPeloNavegador,
} from './historicoDaCasca';
import { Icon } from './Icon';
import { CONTEXTO_MIN_PX, useJanelaMin } from './medidas';
import { PaletaDeComandos } from './PaletaDeComandos';
import { ScreenHeader } from './ScreenHeader';
import { acaoDaTecla } from './teclasDaCasca';
import { TopBar } from './TopBar';
import {
  UpgradeChromeProvider,
  etapasDoChrome,
  listaDoChrome,
  useChrome,
  type Chrome,
  type ChromeBarra,
} from './UpgradeChrome';
import {
  CABECALHO,
  esteiraDaLive,
  type TelaId,
  menuDoTrilho,
  projetoDaRota,
  telaDaRota,
  trilhaDaTela,
} from './upgradeRoutes';
import { useUpgradeTheme } from './useUpgradeTheme';

// ─────────────────────────────────────────────────────────────────
// D-599 · A casca.
//
// Faixas fixas, sempre nesta ordem: trilho (onde posso ir) → barra
// superior (onde estou) → fita da live (em que fase) → contexto (o que
// mais existe aqui) → conteúdo, com a barra de ações ancorada embaixo.
// Só o miolo rola. É essa fixidez que faz a casca desaparecer da
// atenção: quem usa para de procurar as coisas e passa a saber onde
// elas estão.
//
// RODADA 2 · quatro decisões mudaram de lugar, e todas para cá:
//
//   1. O TRILHO NÃO MUDA MAIS DE TAMANHO. As cinco fases da live saíram
//      dele e viraram a `FitaDaLive` — um lugar só, e só nas telas de
//      dentro de uma live. `menuDoTrilho()` é fixo, vindo da tabela de
//      telas.
//   2. TELA DENSA FUNDE O CABEÇALHO na barra superior: ~46 px devolvidos
//      ao player, e o título deixa de repetir a última migalha.
//   3. UMA LISTA. `listaDoChrome` normaliza o contrato antigo
//      (`contexto` + `seletor`) no novo (`lista` + `atual`), então a
//      coluna e o painel passam a ser a mesma declaração.
//   4. A trava do Enter olha para controles de DECISÃO (`data-decisao`),
//      não para qualquer botão focado — era o que matava o ↵ depois do
//      primeiro clique em qualquer lugar da tela.
// ─────────────────────────────────────────────────────────────────

const TRILHO_KEY = 'upgrade-trilho';

/**
 * O cartao da fila no pe do trilho. Mostra o job que esta ANDANDO; sem
 * nenhum ativo, o cartao some — um anel parado em 0% ocuparia espaco para
 * dizer "nada acontecendo", que e justamente o que o silencio ja diz.
 *
 * Excecao: estando NA tela da Fila, o cartao fica em estado quieto, para a
 * rota ter representacao no trilho.
 */
function filaDoTrilho(
  jobs: QueueJob[],
  naFila: boolean,
  onAbrir?: () => void,
): FilaDoTrilho | undefined {
  const ativos = jobs.filter((j) => j.estado === 'rodando' || j.estado === 'aguardando');
  if (ativos.length === 0) {
    return naFila
      ? { titulo: 'Fila', sub: jobs.length > 0 ? 'nada rodando' : 'vazia', progresso: 0, to: '/fila' }
      : undefined;
  }
  const rodando = ativos.find((j) => j.estado === 'rodando') ?? ativos[0];
  return {
    titulo: `Fila · ${ativos.length} job${ativos.length === 1 ? '' : 's'}`,
    sub: `${rodando.rotuloTipo} ${Math.round(rodando.progresso)}%`,
    progresso: rodando.progresso,
    to: '/fila',
    onAbrir,
  };
}

/**
 * D-746: o nome de um lugar no histórico. A última migalha de um corte é só
 * "#2", e o título que o editor declara é o da live — sozinhos, os dois
 * fazem "Onde eu estava" listar live e corte com o mesmo nome.
 */
function rotuloParaHistorico(
  titulo: string | undefined,
  trilha: { texto: string }[],
  padrao: string,
): string {
  const ultima = trilha[trilha.length - 1]?.texto;
  if (ultima?.startsWith('#')) {
    if (titulo?.includes(ultima)) return titulo;
    const live = trilha.length > 2 ? trilha[1].texto : undefined;
    return live ? `Corte ${ultima} · ${live}` : `Corte ${ultima}`;
  }
  return titulo ?? ultima ?? padrao;
}

/** D-746: o que o histórico chama cada tela. "Onde eu estava" e o ⌘K
 *  mostram isto ao lado do rótulo, para "O erro que toda igreja comete"
 *  dizer se é a live, o corte ou o short. */
const TIPO_DA_TELA: Partial<Record<TelaId, string>> = {
  projeto: 'live',
  cortes: 'corte',
  pos: 'pós',
  metadados: 'metadados',
  revisao: 'revisão',
  fire: 'short',
};

const COLUNA_KEY = 'upgrade-coluna-recolhida';

/** Um liga/desliga lembrado entre visitas (localStorage, com tolerância). */
function usePreferenciaLigada(chave: string): [boolean, () => void] {
  const [ligada, setLigada] = useState(() => {
    try {
      return window.localStorage.getItem(chave) === '1';
    } catch {
      return false;
    }
  });
  const alternar = useCallback(() => {
    setLigada((atual) => {
      try {
        window.localStorage.setItem(chave, atual ? '0' : '1');
      } catch {
        // sem localStorage a escolha vale só nesta visita
      }
      return !atual;
    });
  }, [chave]);
  return [ligada, alternar];
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

/**
 * Há um diálogo, menu ou popover aberto? Nesse caso o teclado é dele, não da
 * casca. `[role="dialog"]` e `[role="menu"]` entram além do `aria-modal`: os
 * popovers da régua e os menus "⋯" não são modais, mas J/K trocando o corte
 * por trás de uma decisão aberta é o mesmo erro.
 */
function overlayAberto(): boolean {
  return document.querySelector('[aria-modal="true"], [role="dialog"], [role="menu"]') !== null;
}

/**
 * O foco está num controle que TAMBÉM decide? Só esses engolem o Enter.
 *
 * RODADA 2 · antes a pergunta era "está em qualquer botão?", e como o
 * navegador deixa o foco no botão clicado, bastava clicar um corte na lista
 * para o Enter morrer — com o ↵ ainda impresso na barra. `data-decisao` está
 * nos três botões da `ActionBar`; ponha-o também em veredito inline
 * (aprovar/rejeitar dentro do conteúdo) e o Enter não duplicará nada.
 */
function focoEmDecisao(alvo: HTMLElement | null): boolean {
  if (!alvo) return false;
  if (alvo.closest('[data-decisao]')) return true;
  // Um botão COMUM focado também é acionado pelo navegador no Enter: foco em
  // "Fire" ou "Gerar bruto" + Enter faria a ação dele E aprovaria o corte.
  // Só as linhas de lista (`data-navegacao`) — o caso que a rodada 2 quis
  // destravar — deixam o Enter com a casca.
  const controle = alvo.closest('button, a[href], [role="button"]');
  return controle != null && controle.closest('[data-navegacao]') == null;
}

/** Atalhos da casca: ⌘B recolhe o trilho, ⌘K busca, J/K trocam de item,
 *  Enter dispara a ação primária da barra. A DECISÃO mora em `teclasDaCasca`
 *  (pura e testada); aqui só se lê o DOM e se executa. */
function useAtalhosDaCasca(
  alternarTrilho: () => void,
  abrirBusca: () => void,
  abrirFila: () => void,
  chrome: Chrome,
) {
  const atual = chrome.atual ?? listaDoChrome(chrome).atual;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const primario = chrome.barra?.primario;
      const acao = acaoDaTecla({
        tecla: e.key,
        meta: e.metaKey,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        digitando:
          alvo instanceof HTMLInputElement ||
          alvo instanceof HTMLTextAreaElement ||
          alvo instanceof HTMLSelectElement ||
          alvo?.isContentEditable === true,
        focoEmDecisao: focoEmDecisao(alvo),
        overlayAberto: overlayAberto(),
        jaTratado: e.defaultPrevented,
        primarioDisponivel:
          Boolean(primario?.onClick) && !primario?.desabilitado && !primario?.semEnter,
      });
      if (!acao) return;

      if (acao === 'trilho') alternarTrilho();
      if (acao === 'busca') abrirBusca();
      if (acao === 'fila') abrirFila();
      if (acao === 'proximo') atual?.onProximo?.();
      if (acao === 'anterior') atual?.onAnterior?.();
      if (acao === 'primario') primario?.onClick?.();
      // J/K nao chamam preventDefault: fora de campo elas nao tem acao nativa.
      // ⌘J precisa do preventDefault: no Chrome ele abre os downloads.
      if (acao === 'trilho' || acao === 'busca' || acao === 'fila' || acao === 'primario')
        e.preventDefault();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [alternarTrilho, abrirBusca, abrirFila, atual, chrome.barra]);
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
  /** Cartão da fila no pé do trilho. Só as vitrines passam isto à mão. */
  fila?: FilaDoTrilho;
};

function Casca({ children, fila }: CascaProps) {
  const { pathname } = useLocation();
  const { theme, setTheme, toggleTheme, glass } = useUpgradeTheme();
  const { expandido, alternar } = useTrilho();
  const chrome = useChrome();
  const filaGlobal = useWorkbenchQueueOptional();
  const janelaLarga = useJanelaMin(CONTEXTO_MIN_PX);

  const tela = telaDaRota(pathname);
  const projetoId = projetoDaRota(pathname);
  const menu = useMemo(() => menuDoTrilho(), []);
  const cab = CABECALHO[tela];

  const navigate = useNavigate();
  const [buscaAberta, setBuscaAberta] = useState(false);
  const abrirBusca = useCallback(() => setBuscaAberta(true), []);

  // D-746: a fila é consulta, não destino — gaveta sobre a tela atual.
  const [filaAberta, setFilaAberta] = useState(false);
  const abrirFila = useCallback(() => setFilaAberta(true), []);
  const fecharFila = useCallback(() => setFilaAberta(false), []);
  const filaEmTelaCheia = useCallback(() => {
    setFilaAberta(false);
    navigate('/fila');
  }, [navigate]);
  // Trocou de tela (⌘[, "Onde eu estava", link): a gaveta não viaja junto.
  useEffect(() => setFilaAberta(false), [pathname]);

  useAtalhosDaCasca(alternar, abrirBusca, abrirFila, chrome);
  const jobsRodando = (filaGlobal?.jobs ?? []).filter((j) => j.estado === 'rodando').length;
  const jobComErro = (filaGlobal?.jobs ?? []).some(
    (j) => j.estado === 'erro' || j.estado === 'perdido',
  );

  // Quem decide se a lista e o seletor aparecem é a TELA, pelo simples ato
  // de fornecer os dados. O que a CASCA decide é ONDE a lista cabe: na
  // coluna (janela larga) ou dentro do painel do seletor. Nunca nos dois.
  const { lista, atual } = useMemo(() => listaDoChrome(chrome), [chrome]);
  const [colunaRecolhida, alternarColuna] = usePreferenciaLigada(COLUNA_KEY);
  // Recolhida é escolha dele, e vale só onde a coluna caberia: na janela
  // estreita a lista já mora no painel do seletor de qualquer jeito.
  const listaNaColuna = Boolean(lista) && janelaLarga && !colunaRecolhida;

  const trilha = useMemo(
    () => trilhaDaTela(tela, chrome.rotulos, projetoId),
    [tela, chrome.rotulos, projetoId],
  );
  const passos = useMemo(() => esteiraDaLive(tela, projetoId), [tela, projetoId]);
  const denso = Boolean(chrome.denso);

  // D-746: cada tela visitada entra na pilha (← →) e em "Onde eu estava".
  // O rótulo chega depois do fetch; `visitar` atualiza sem empilhar.
  const rotuloDoLugar = rotuloParaHistorico(chrome.titulo, trilha, cab.titulo);
  const tipoDeNavegacao = useNavigationType();
  useEffect(() => {
    const lugar = { to: pathname, rotulo: rotuloDoLugar, icone: cab.icone, tipo: TIPO_DA_TELA[tela] ?? 'tela' };
    if (tipoDeNavegacao === 'POP') visitarPeloNavegador(lugar);
    else visitar(lugar);
    // O tipo de navegação só importa na chegada; mudar o rótulo depois não
    // é uma nova navegação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, rotuloDoLugar, cab.icone, tela]);
  const historico = useHistoricoDaCasca();
  const irPara = useCallback((to: string) => navigate(to), [navigate]);
  const lugaresAnteriores = useMemo(
    () => historico.lugares.filter((l) => l.to !== pathname).slice(0, 4),
    [historico.lugares, pathname],
  );
  useAtalhosDeHistorico(irPara, lugaresAnteriores);

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
        menu={menu}
        fila={fila ?? filaDoTrilho(filaGlobal?.jobs ?? [], tela === 'fila', abrirFila)}
        filaAtiva={tela === 'fila'}
        lugares={lugaresAnteriores}
      />

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <TopBar
          trilha={trilha}
          atual={atual}
          seletorCompacto={listaNaColuna}
          listaNoPainel={listaNaColuna ? undefined : lista}
          estado={chrome.estado}
          // Em tela densa o cabeçalho vem para cá; a faixa abaixo não é montada.
          cabecalho={denso ? { sub: chrome.sub, acoes: chrome.acoes } : undefined}
          tema={theme}
          onAlternarTema={toggleTheme}
          onEscolherTema={setTheme}
          onAbrirBusca={abrirBusca}
          onAbrirAvisos={abrirFila}
          avisosAtivos={jobsRodando}
          avisoDeErro={jobComErro}
          historico={{
            podeVoltar: historico.podeVoltar,
            podeAvancar: historico.podeAvancar,
            anterior: historico.anterior?.rotulo,
            proximo: historico.proximo?.rotulo,
            onVoltar: () => {
              const l = historico.voltar();
              if (l) navigate(l.to);
            },
            onAvancar: () => {
              const l = historico.avancar();
              if (l) navigate(l.to);
            },
          }}
        />
        <PaletaDeComandos aberta={buscaAberta} onFechar={() => setBuscaAberta(false)} />
        {filaGlobal ? (
          <GavetaDaFila
            aberta={filaAberta}
            aoFechar={fecharFila}
            aoAbrirTelaCheia={filaEmTelaCheia}
          />
        ) : null}

        <FitaDaLive passos={passos} etapas={etapasDoChrome(chrome)} />

        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
          {listaNaColuna && lista ? (
            <ContextColumn lista={lista} onRecolher={alternarColuna} />
          ) : null}
          {lista && janelaLarga && colunaRecolhida ? (
            <ColunaRecolhida titulo={lista.titulo} onAbrir={alternarColuna} />
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
            {denso ? null : (
              <ScreenHeader
                icone={cab.icone}
                titulo={chrome.titulo ?? cab.titulo}
                sub={chrome.sub}
                acoes={chrome.acoes}
              />
            )}

            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflow: denso ? 'hidden' : 'auto',
                padding: denso ? '8px 12px 12px' : '4px 18px 18px',
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
              <ActionBar barra={barraComTeclas(chrome.barra, Boolean(atual))} />
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
