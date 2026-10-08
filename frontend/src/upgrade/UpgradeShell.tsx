import { Suspense, useCallback, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import {
  WorkbenchQueueProvider,
  useWorkbenchQueueOptional,
} from '@/shared/filaGlobal/useWorkbenchQueue';
import { overlayAberto } from '@/shared/atalhos/shortcuts';
import { ActionBar } from './ActionBar';
import { ColunaRecolhida, ContextColumn } from './ContextColumn';
import { useCanais } from '@/features/channels/useChannels';
import { filaDoTrilho, resumoDoLote } from './cartaoDaFila';
import { GavetaDaFila } from './GavetaDaFila';
import { GlobalRail, TRILHO_ESTREITO, TRILHO_LARGO, type FilaDoTrilho } from './GlobalRail';
import {
  useAtalhosDeHistorico,
  useHistoricoDaCasca,
  visitar,
  visitarPeloNavegador,
} from './historicoDaCasca';
import { Icon } from './Icon';
import { useLoteDaFila } from './LoteNaFila';
import { CONTEXTO_MIN_PX, useJanelaMin } from './medidas';
import { PaletaDeComandos } from './PaletaDeComandos';
import { ScreenHeader } from './ScreenHeader';
import { TopBar } from './TopBar';
import { barraComTeclas, useAtalhosDaCasca } from './useAtalhosDaCasca';
import { TrilhaDeEtapas } from './TrilhaDeEtapas';
import { dentroDeUmaLive } from './trilhaDaLive';
import { useGavetaDaFila } from './useGavetaDaFila';
import { useTrilho } from './useTrilho';
import { useTrilhaDaLive } from './useTrilhaDaLive';
import {
  UpgradeChromeProvider,
  listaDoChrome,
  useChrome,
} from './UpgradeChrome';
import {
  CABECALHO,
  entraNoHistorico,
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
// superior (onde estou) → trilha da live (em que etapa) → contexto (o que
// mais existe aqui) → conteúdo, com a barra de ações ancorada embaixo.
// Só o miolo rola. É essa fixidez que faz a casca desaparecer da
// atenção: quem usa para de procurar as coisas e passa a saber onde
// elas estão.
//
// RODADA 2 · quatro decisões mudaram de lugar, e todas para cá:
//
//   1. O TRILHO NÃO MUDA MAIS DE TAMANHO. As fases da live saíram dele
//      e viraram uma faixa própria — hoje a `TrilhaDeEtapas` (D-866) —, um
//      lugar só, e só nas telas de dentro de uma live. `menuDoTrilho()` é fixo, vindo da tabela de
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
  const { theme, toggleTheme, glass } = useUpgradeTheme();
  const tela = telaDaRota(pathname);
  const projetoId = projetoDaRota(pathname);
  const { expandido, alternar } = useTrilho(dentroDeUmaLive(tela) ? projetoId : null);
  const chrome = useChrome();
  const filaGlobal = useWorkbenchQueueOptional();
  const janelaLarga = useJanelaMin(CONTEXTO_MIN_PX);

  const menu = useMemo(() => menuDoTrilho(), []);
  const cab = CABECALHO[tela];

  const navigate = useNavigate();
  const [buscaAberta, setBuscaAberta] = useState(false);
  const abrirBusca = useCallback(() => setBuscaAberta(true), []);

  const gaveta = useGavetaDaFila(pathname);
  const lote = useLoteDaFila();
  useAtalhosDaCasca(alternar, abrirBusca, gaveta.abrir, chrome);
  const jobsRodando = (filaGlobal?.jobs ?? []).filter((j) => j.estado === 'rodando').length;
  const canais = useCanais();
  const canalAtivo = canais.data?.canais.find((c) => c.ativo);
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
  const etapasDaLive = useTrilhaDaLive(tela, projetoId);
  const denso = Boolean(chrome.denso);

  // D-746: cada tela visitada entra na pilha (← →) e em "Onde eu estava".
  // O rótulo chega depois do fetch; `visitar` atualiza sem empilhar.
  const rotuloDoLugar = rotuloParaHistorico(chrome.titulo, trilha, cab.titulo);
  const tipoDeNavegacao = useNavigationType();
  // O tipo de navegação é lido na hora, sem ser gatilho: ele só importa na
  // chegada, e mudar o rótulo depois não é uma nova navegação.
  const registrarVisita = useEffectEvent((lugar: Parameters<typeof visitar>[0]) => {
    (tipoDeNavegacao === 'POP' ? visitarPeloNavegador : visitar)(lugar);
  });
  useEffect(() => {
    if (!entraNoHistorico(tela)) return;
    registrarVisita({ to: pathname, rotulo: rotuloDoLugar, icone: cab.icone, tipo: TIPO_DA_TELA[tela] ?? 'tela' });
  }, [pathname, rotuloDoLugar, cab.icone, tela]);
  const historico = useHistoricoDaCasca();
  const irPara = useCallback((to: string) => navigate(to), [navigate]);
  const lugaresAnteriores = useMemo(
    () => historico.lugares.filter((l) => l.to !== pathname).slice(0, 4),
    [historico.lugares, pathname],
  );
  // Uma regra, dois consumidores: `overlayAberto` é a mesma que o teclado
  // da casca usa.
  useAtalhosDeHistorico(irPara, lugaresAnteriores, overlayAberto);

  return (
    <div
      className="ap"
      data-theme={theme}
      data-glass={glass ? '1' : '0'}
      style={{
        display: 'grid',
        gridTemplateColumns: `${expandido ? TRILHO_LARGO : TRILHO_ESTREITO} 1fr`,
        height: '100%', // D-879: o que o App lhe dá; o aviso de sincronia pode estar acima
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <GlobalRail
        expandido={expandido}
        onAlternar={alternar}
        telaAtual={tela}
        menu={menu}
        fila={fila ?? filaDoTrilho(filaGlobal?.jobs ?? [], tela === 'fila', gaveta.abrir, lote && resumoDoLote(lote))}
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
          onAbrirBusca={abrirBusca}
          onAbrirAvisos={gaveta.abrir}
          avisosAtivos={jobsRodando}
          avisoDeErro={jobComErro}
          canal={canalAtivo ? { nome: canalAtivo.nome, handle: canalAtivo.handle } : undefined}
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
          <GavetaDaFila aberta={gaveta.aberta} aoFechar={gaveta.fechar} aoAbrirTelaCheia={gaveta.telaCheia} />
        ) : null}

        <TrilhaDeEtapas etapas={etapasDaLive} />

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
