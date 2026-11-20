import { Suspense, useCallback, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { Aurora } from '@/components/ui/aurora';
import {
  WorkbenchQueueProvider,
  useWorkbenchQueueOptional,
} from '@/shared/filaGlobal/useWorkbenchQueue';
import { overlayAberto } from '@/shared/atalhos/shortcuts';
import { useSincronia } from './useSincronia';
import { useAvisosDasNovidades } from '@/features/novidades/useNovidades';
import { useUpgradeTheme } from '@/lib/tema';
import { cn } from '@/lib/utils';
import { ActionBar } from './ActionBar';
import { ColunaRecolhida, ContextColumn } from './ContextColumn';
import { filaDoTrilho, resumoDoLote } from './cartaoDaFila';
import { GavetaDaFila } from './GavetaDaFila';
import { GlobalRail, TRILHO_ESTREITO, TRILHO_LARGO, type FilaDoTrilho, type GlobalRailProps } from './GlobalRail';
import { useAtalhosDeHistorico, useHistoricoDaCasca, visitar, visitarPeloNavegador } from './historicoDaCasca';
import { Icon, type IconName } from './Icon';
import { LinhaDoTopo } from './LinhaDoTopo';
import { useLoteDaFila } from './LoteNaFila';
import { CONTEXTO_MIN_PX, useJanelaMin } from './medidas';
import { PaletaDeComandos } from './PaletaDeComandos';
import { ScreenHeader, sobretituloDaTela } from './ScreenHeader';
import { barraComTeclas, useAtalhosDaCasca } from './useAtalhosDaCasca';
import { TrilhaDeEtapas } from './TrilhaDeEtapas';
import { FichaDoCanal } from './TrocaDeCanal';
import { dentroDeUmaLive } from './trilhaDaLive';
import { useGavetaDaFila } from './useGavetaDaFila';
import { useLuzDaSala } from './useLuzDaSala';
import { alternarTrilhoForaDoFoco, partesDaCasca } from './modoFoco';
import { useModoFocoDaCasca } from './useModoFoco';
import { useTrilho } from './useTrilho';
import { useTrilhaDaTela } from './useTrilhaDoFire';
import { UpgradeChromeProvider, listaDoChrome, useChrome } from './UpgradeChrome';
import {
  CABECALHO,
  entraNoHistorico,
  type Migalha,
  type TelaId,
  menuDoTrilho,
  projetoDaRota,
  telaDaRota,
  trilhaDaTela,
} from './upgradeRoutes';

// ─────────────────────────────────────────────────────────────────
// D-599 · A casca.
//
// Faixas fixas, sempre na mesma ordem. Só o miolo rola. É essa fixidez que faz
// a casca desaparecer da atenção: quem usa para de procurar as coisas e passa a
// saber onde elas estão. Quem decide se a lista, o seletor e a barra aparecem é a
// TELA, pelo simples ato de fornecer os dados (`useDefinirChrome`); a casca
// decide onde cabem.
//
// D-1137 (E-069 H-13; DIRECAO §7.0) · a sala. A barra superior deixou de existir.
// Tudo flutua a 12 px da janela sobre a aurora, em duas formas:
//   - FORA de uma live: o trilho aberto (244 px) e o cabeçalho da própria tela
//     (sobretítulo, h1, busca, ações). Não há barra no topo.
//   - DENTRO de uma live (e nas telas densas): o trilho recolhido (64 px) e a
//     linha do topo — "voltar", a trilha da live em cápsula, o seletor, a busca.
// A barra de ação é uma pílula no rodapé. A luz (aurora e vidro) segue a
// `luzDaSala`: no Editor e na Pós, só os halos e nenhum blur (§3.6). O primeiro
// link da página é o "Pular para o conteúdo".
// ─────────────────────────────────────────────────────────────────

/**
 * D-746: o nome de um lugar no histórico. A última migalha de um corte é só
 * "#2", e o título que o editor declara é o da live — sozinhos, os dois
 * fazem o histórico listar live e corte com o mesmo nome.
 */
function rotuloParaHistorico(titulo: string | undefined, trilha: { texto: string }[], padrao: string): string {
  const ultima = trilha[trilha.length - 1]?.texto;
  if (ultima?.startsWith('#')) {
    if (titulo?.includes(ultima)) return titulo;
    const live = trilha.length > 2 ? trilha[1].texto : undefined;
    return live ? `Corte ${ultima} · ${live}` : `Corte ${ultima}`;
  }
  return titulo ?? ultima ?? padrao;
}

/** D-746: o que o histórico chama cada tela. O ⌘K mostra isto ao lado do rótulo,
 *  para "O erro que toda igreja comete" dizer se é a live, o corte ou o short. */
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
 * D-746: cada tela visitada entra na pilha (⌘[ ⌘]) e nos atalhos ⌘1…⌘4. O rótulo
 * chega depois do fetch; `visitar` atualiza sem empilhar. O tipo de navegação é
 * lido na hora, sem ser gatilho: ele só importa na chegada.
 */
function useHistoricoDaTela(tela: TelaId, pathname: string, rotulo: string, icone: IconName) {
  const navigate = useNavigate();
  const tipoDeNavegacao = useNavigationType();
  const registrarVisita = useEffectEvent((lugar: Parameters<typeof visitar>[0]) => {
    (tipoDeNavegacao === 'POP' ? visitarPeloNavegador : visitar)(lugar);
  });
  useEffect(() => {
    if (!entraNoHistorico(tela)) return;
    registrarVisita({ to: pathname, rotulo, icone, tipo: TIPO_DA_TELA[tela] ?? 'tela' });
  }, [pathname, rotulo, icone, tela]);
  const historico = useHistoricoDaCasca();
  const irPara = useCallback((to: string) => navigate(to), [navigate]);
  const lugaresAnteriores = useMemo(
    () => historico.lugares.filter((l) => l.to !== pathname).slice(0, 4),
    [historico.lugares, pathname],
  );
  // Uma regra, dois consumidores: `overlayAberto` é a mesma que o teclado da casca usa.
  useAtalhosDeHistorico(irPara, lugaresAnteriores, overlayAberto);
}

/**
 * A casca em si. `children` existe para as rotas de vitrine; em uso
 * normal ela renderiza o `<Outlet/>` do router.
 */
type CascaProps = {
  children?: ReactNode;
  /** A fila no trilho. Só as vitrines passam isto à mão. */
  fila?: FilaDoTrilho;
};

/** D-922: o trilho com o ponto de "tem novidade" e a ficha do canal. Fora da
 *  `Casca`, e o trilho em si continua sem buscar dado nenhum. */
function TrilhoComAvisos(props: Omit<GlobalRailProps, 'avisos' | 'ficha' | 'sincronia'>) {
  return <GlobalRail {...props} avisos={useAvisosDasNovidades()} ficha={<FichaDoCanal expandido={props.expandido} />} sincronia={useSincronia()} />;
}

/** O primeiro link da página: com o Tab, pula o trilho e a linha do topo (§8.2). */
function PularParaOConteudo() {
  return (
    <a
      href="#conteudo"
      className="sr-only rounded-pilula bg-pop px-4 py-2 text-corpo font-semibold text-fg shadow-pop-luz focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[70] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foco"
    >
      Pular para o conteúdo
    </a>
  );
}

function Carregando() {
  return (
    <div className="grid place-items-center p-12 text-fg-3">
      <Icon name="loader" size={20} />
    </div>
  );
}

function Casca({ children, fila }: CascaProps) {
  const { pathname } = useLocation();
  const { theme, glass } = useUpgradeTheme();
  const tela = telaDaRota(pathname);
  const projetoId = projetoDaRota(pathname);
  const { expandido, alternar } = useTrilho(dentroDeUmaLive(tela) ? projetoId : null);
  // D-1085: no foco a casca some, sem tocar nas escolhas de coluna, e a luz apaga.
  const foco = useModoFocoDaCasca(tela === 'cortes');
  const parte = partesDaCasca(foco);
  const luz = useLuzDaSala(tela, projetoId, foco);
  const chrome = useChrome();
  const filaGlobal = useWorkbenchQueueOptional();
  const janelaLarga = useJanelaMin(CONTEXTO_MIN_PX);
  const menu = useMemo(() => menuDoTrilho(), []);
  const cab = CABECALHO[tela];

  const [buscaAberta, setBuscaAberta] = useState(false);
  const abrirBusca = useCallback(() => setBuscaAberta(true), []);
  const gaveta = useGavetaDaFila(pathname);
  const lote = useLoteDaFila();
  useAtalhosDaCasca(alternarTrilhoForaDoFoco(parte.trilho, alternar), abrirBusca, gaveta.abrir, chrome);
  const jobComErro = (filaGlobal?.jobs ?? []).some((j) => j.estado === 'erro' || j.estado === 'perdido');

  // A casca decide ONDE a lista cabe: na coluna (janela larga) ou dentro do
  // painel do seletor. Nunca nos dois. Recolhida é escolha dele, e vale só onde
  // a coluna caberia.
  const { lista, atual } = useMemo(() => listaDoChrome(chrome), [chrome]);
  const [colunaRecolhida, alternarColuna] = usePreferenciaLigada(COLUNA_KEY);
  const listaNaColuna = Boolean(lista) && janelaLarga && !colunaRecolhida;

  const trilha: Migalha[] = useMemo(() => trilhaDaTela(tela, chrome.rotulos, projetoId), [tela, chrome.rotulos, projetoId]);
  const etapasDaLive = useTrilhaDaTela(tela, projetoId);
  const denso = Boolean(chrome.denso);
  // Dentro de uma live (ou do Fire) e nas telas densas, a linha do topo substitui o cabeçalho.
  const comLinhaDoTopo = denso || etapasDaLive.length > 0;
  const titulo = chrome.titulo ?? cab.titulo;
  useHistoricoDaTela(tela, pathname, rotuloParaHistorico(chrome.titulo, trilha, cab.titulo), cab.icone);

  return (
    <div
      className={cn('ap relative isolate grid min-h-0 overflow-hidden', parte.trilho && 'gap-3 p-3')}
      data-theme={theme}
      data-glass={glass ? '1' : '0'}
      data-vidro={luz.vidro ? '1' : '0'}
      style={{
        gridTemplateColumns: parte.trilho ? `${expandido ? TRILHO_LARGO : TRILHO_ESTREITO} 1fr` : '1fr',
        height: '100%', // D-879: o que o App lhe dá; o aviso de sincronia pode estar acima
      }}
    >
      <PularParaOConteudo />
      {luz.aurora === 'nenhuma' ? null : <Aurora src={luz.src} />}
      {parte.trilho ? (
        <TrilhoComAvisos
          expandido={expandido}
          onAlternar={alternar}
          telaAtual={tela}
          menu={menu}
          fila={fila ?? filaDoTrilho(filaGlobal?.jobs ?? [], tela === 'fila', gaveta.abrir, lote && resumoDoLote(lote))}
          filaAtiva={tela === 'fila'}
          filaComErro={jobComErro}
        />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-col gap-3">
        {parte.barraSuperior && comLinhaDoTopo ? (
          <LinhaDoTopo
            trilha={trilha}
            titulo={titulo}
            etapas={parte.trilhaDeEtapas ? <TrilhaDeEtapas etapas={etapasDaLive} /> : null}
            atual={atual}
            seletorCompacto={listaNaColuna}
            listaNoPainel={listaNaColuna ? undefined : lista}
            estado={chrome.estado}
            cabecalho={{ sub: chrome.sub, acoes: chrome.acoes }}
            onAbrirBusca={abrirBusca}
          />
        ) : null}
        <PaletaDeComandos aberta={buscaAberta} onFechar={() => setBuscaAberta(false)} />
        {filaGlobal ? (
          <GavetaDaFila aberta={gaveta.aberta} aoFechar={gaveta.fechar} aoAbrirTelaCheia={gaveta.telaCheia} />
        ) : null}

        <div className="flex min-h-0 flex-1 gap-3">
          {parte.colunaDeContexto && listaNaColuna && lista ? (
            <ContextColumn lista={lista} onRecolher={alternarColuna} />
          ) : null}
          {parte.colunaDeContexto && lista && janelaLarga && colunaRecolhida ? (
            <ColunaRecolhida titulo={lista.titulo} onAbrir={alternarColuna} />
          ) : null}

          <main id="conteudo" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col">
            {comLinhaDoTopo || !parte.cabecalho ? null : (
              <ScreenHeader
                titulo={titulo}
                sobretitulo={sobretituloDaTela(tela, trilha)}
                sub={chrome.sub}
                acoes={chrome.acoes}
                onAbrirBusca={abrirBusca}
              />
            )}

            <div className={cn('min-h-0 flex-1', denso ? 'overflow-hidden' : 'overflow-auto px-6 pb-6 pt-1')}>
              <Suspense fallback={<Carregando />}>{children ?? <Outlet />}</Suspense>
            </div>

            {chrome.barra && parte.barraDeAcoes ? (
              <div className="flex-none pt-3">
                <ActionBar barra={barraComTeclas(chrome.barra, Boolean(atual))} />
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}

export function UpgradeShell({ children, fila }: CascaProps) {
  return (
    // A fila e o provider mais externo: o item do trilho e a tela de Fila
    // precisam da MESMA lista, e um job disparado em qualquer tela tem de
    // aparecer nos dois sem passar pelo chrome.
    <WorkbenchQueueProvider>
      <UpgradeChromeProvider>
        <Casca fila={fila}>{children}</Casca>
      </UpgradeChromeProvider>
    </WorkbenchQueueProvider>
  );
}
