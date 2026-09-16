import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
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
import { ScreenHeader } from './ScreenHeader';
import { TopBar } from './TopBar';
import { UpgradeChromeProvider, useChrome, type Chrome } from './UpgradeChrome';
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
// ─────────────────────────────────────────────────────────────────

const TRILHO_KEY = 'upgrade-trilho';

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

/** Atalhos da casca: ⌘B recolhe o trilho, J/K trocam de corte. */
function useAtalhosDaCasca(alternarTrilho: () => void, chrome: Chrome) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      // Digitar "j" num campo de título não pode trocar de corte.
      const digitando =
        alvo instanceof HTMLInputElement ||
        alvo instanceof HTMLTextAreaElement ||
        alvo?.isContentEditable === true;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        alternarTrilho();
        return;
      }
      if (digitando || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'j') chrome.seletor?.onProximo?.();
      if (e.key === 'k') chrome.seletor?.onAnterior?.();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [alternarTrilho, chrome.seletor]);
}

function montarNavegacao(projetoId: string | null): {
  producao: ItemTrilho[];
  inteligencia: ItemTrilho[];
  rodape: ItemTrilho[];
} {
  const producao: ItemTrilho[] = [
    { icone: 'home', texto: 'Biblioteca', to: '/projetos', tela: 'biblioteca' },
  ];

  // O bloco da live só existe quando há uma live aberta. No protótipo
  // ele é fixo porque a live é uma só; aqui, mostrar "Cortes" sem
  // projeto seria oferecer uma porta que não abre.
  if (projetoId) {
    producao.push(
      { icone: 'layout-grid', texto: 'Esta live', to: `/projetos/${projetoId}`, tela: 'projeto' },
      { icone: 'scissors', texto: 'Cortes', to: `/projetos/${projetoId}/cortes`, tela: 'cortes' },
      {
        icone: 'clapperboard',
        texto: 'Pós-produção',
        to: `/projetos/${projetoId}/post-production`,
        tela: 'pos',
      },
      { icone: 'tags', texto: 'Metadados', to: `/projetos/${projetoId}/metadados`, tela: 'metadados' },
      {
        icone: 'check-check',
        texto: 'Revisão final',
        to: `/projetos/${projetoId}/final-review`,
        tela: 'revisao',
      },
    );
  }

  producao.push({ icone: 'flame', texto: 'Shorts', to: '/shorts', tela: 'shorts' });

  return {
    producao,
    inteligencia: [
      { icone: 'radio', texto: 'Buscar lives', to: '/buscar-lives', tela: 'lives' },
      { icone: 'trophy', texto: 'Ranking', to: '/ranking-lives', tela: 'ranking' },
      { icone: 'sparkles', texto: 'Padrões de capa', to: '/padroes-thumbnail', tela: 'thumbs' },
      { icone: 'bar-chart', texto: 'Análises', to: '/analises', tela: 'analises' },
    ],
    rodape: [
      { icone: 'layout-template', texto: 'Componentes', to: '/upgrade/kit', tela: 'kit' },
      { icone: 'keyboard', texto: 'Atalhos', to: '/atalhos', tela: 'atalhos' },
      { icone: 'settings', texto: 'Configurações', to: '/canais', tela: 'config' },
    ],
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

  const tela = telaDaRota(pathname);
  const projetoId = projetoDaRota(pathname);
  const nav = useMemo(() => montarNavegacao(projetoId), [projetoId]);
  const cab = CABECALHO[tela];

  useAtalhosDaCasca(alternar, chrome);

  // Quem decide se a coluna de contexto e o seletor aparecem é a TELA,
  // pelo simples ato de fornecer os dados. Duplicar essa decisão numa
  // tabela por rota só criaria duas fontes da verdade que um dia
  // discordariam — e a rota nunca sabe se a lista veio vazia.

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
        fila={fila}
      />

      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <TopBar
          trilha={trilhaDaTela(tela, chrome.rotulos)}
          seletor={chrome.seletor}
          estado={chrome.estado}
          tema={theme}
          onAlternarTema={toggleTheme}
        />

        <div style={{ display: 'flex', minHeight: 0, flex: 1 }}>
          {chrome.contexto ? <ContextColumn contexto={chrome.contexto} /> : null}

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

            <div style={{ flex: 1, overflow: 'auto', padding: '4px 18px 18px', minHeight: 0 }}>
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

            {chrome.barra ? <ActionBar barra={chrome.barra} /> : null}
          </main>
        </div>
      </div>
    </div>
  );
}

export function UpgradeShell({ children, fila }: CascaProps) {
  return (
    <UpgradeChromeProvider>
      <Casca fila={fila}>{children}</Casca>
    </UpgradeChromeProvider>
  );
}
