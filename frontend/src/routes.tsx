import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App';
import { ProjetosPage } from '@/features/projetos/ProjetosPage';
import { StubPage } from '@/pages/StubPage';
import { isUpgradeShellEnabled } from '@/upgrade/upgradeFlag';

const EditorPage = lazy(() =>
  import('@/features/editor/EditorPage').then((m) => ({ default: m.EditorPage })),
);
const FinalReviewPage = lazy(() =>
  import('@/features/final-review/FinalReviewPage').then((m) => ({ default: m.FinalReviewPage })),
);
const LiveSearchPage = lazy(() =>
  import('@/features/lives/LiveSearchPage').then((m) => ({ default: m.LiveSearchPage })),
);
const RankingLivesPage = lazy(() =>
  import('@/features/lives/RankingLivesPage').then((m) => ({ default: m.RankingLivesPage })),
);
const MetadataPage = lazy(() =>
  import('@/features/metadata/MetadataPage').then((m) => ({ default: m.MetadataPage })),
);
const ScenesPostProductionPage = lazy(() =>
  import('@/features/post-production/ScenesPostProductionPage').then((m) => ({
    default: m.ScenesPostProductionPage,
  })),
);
const ProjetoDetalhePage = lazy(() =>
  import('@/features/projeto-detalhe/ProjetoDetalhePage').then((m) => ({
    default: m.ProjetoDetalhePage,
  })),
);
const ThumbnailPadroesPage = lazy(() =>
  import('@/features/thumbnail-padroes/ThumbnailPadroesPage').then((m) => ({
    default: m.ThumbnailPadroesPage,
  })),
);
const ChannelsPage = lazy(() =>
  import('@/features/channels/ChannelsPage').then((m) => ({ default: m.ChannelsPage })),
);
// E-022: Área de Análises (telemetria proposta×final + desempenho YouTube).
const AnalisesPage = lazy(() =>
  import('@/features/analises/AnalisesPage').then((m) => ({ default: m.AnalisesPage })),
);
// Workbench Etapa 7: página de Atalhos renderizada do shortcutsRegistry.
const ShortsPage = lazy(() =>
  import('./features/shorts/ShortsPage').then((m) => ({ default: m.default })),
);
const FireDetalhePage = lazy(() =>
  import('./features/shorts/FireDetalhePage').then((m) => ({ default: m.default })),
);
// D-581: a segunda tela de cada Fire — a prateleira dos aprovados, com o
// despacho em massa. Rota irma da edicao, e nao aba dentro dela: sao dois
// trabalhos com posturas opostas, e a URL propria e o que deixa cada um
// linkavel e recarregavel no lugar onde o operador estava.
const WorkspaceDoFirePage = lazy(() =>
  import('./features/shorts/WorkspaceDoFirePage').then((m) => ({ default: m.default })),
);
const AtalhosPage = lazy(() =>
  import('@/features/atalhos/AtalhosPage').then((m) => ({ default: m.AtalhosPage })),
);
// D-599 Etapa 0: vitrine da fundacao visual do upgrade de layout. Rota de
// nivel superior (fora do <App/>) de proposito — ver UpgradeKitPage.
const UpgradeKitPage = lazy(() => import('@/upgrade/UpgradeKitPage'));
// D-599 Etapa 1: a casca com os dados de demonstracao da LIVE 267.
const UpgradeShellDemoPage = lazy(() => import('@/upgrade/UpgradeShellDemoPage'));
// D-599 Etapa 2: a Biblioteca na linguagem nova. A troca e feita aqui, uma
// vez, na montagem do router — a mesma leitura de flag que o AppShell faz
// para escolher a casca. Assim tela e casca nunca ficam em versoes
// diferentes dentro da mesma sessao.
const BibliotecaPage = lazy(() => import('@/upgrade/telas/BibliotecaPage'));
const WorkspaceProjetoPage = lazy(() => import('@/upgrade/telas/WorkspaceProjetoPage'));
// D-599: telas que o design pede e o app ainda nao tinha.
const FilaPage = lazy(() => import('@/upgrade/telas/FilaPage'));
const Erro404Page = lazy(() => import('@/upgrade/telas/Erro404Page'));
const CASCA_NOVA = isUpgradeShellEnabled();

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/projetos" replace /> },
      { path: 'projetos', element: CASCA_NOVA ? <BibliotecaPage /> : <ProjetosPage /> },
      {
        path: 'projetos/:id',
        element: CASCA_NOVA ? <WorkspaceProjetoPage /> : <ProjetoDetalhePage />,
      },
      { path: 'projetos/:id/cortes', element: <EditorPage /> },
      { path: 'projetos/:id/cortes/:corteId', element: <EditorPage /> },
      { path: 'projetos/:id/metadados', element: <MetadataPage /> },
      { path: 'projetos/:id/post-production', element: <ScenesPostProductionPage /> },
      { path: 'projetos/:id/final-review', element: <FinalReviewPage /> },
      // /export foi aposentada (A6d): redireciona para a tela viva de pos-producao,
      // preservando favoritos antigos em vez de devolver 404. O relative="path" e
      // obrigatorio: sem ele o `..` sobe um nivel de ROTA (as rotas aqui sao filhas
      // planas de `/`) e o destino vira /post-production, sem o id do projeto.
      {
        path: 'projetos/:id/export',
        element: <Navigate to="../post-production" replace relative="path" />,
      },
      { path: 'buscar-lives', element: <LiveSearchPage /> },
      { path: 'ranking-lives', element: <RankingLivesPage /> },
      { path: 'padroes-thumbnail', element: <ThumbnailPadroesPage /> },
      { path: 'canais', element: <ChannelsPage /> },
      { path: 'analises', element: <AnalisesPage /> },
      { path: 'shorts', element: <ShortsPage /> },
      { path: 'shorts/:corteId', element: <FireDetalhePage /> },
      { path: 'shorts/:corteId/workspace', element: <WorkspaceDoFirePage /> },
      { path: 'atalhos', element: <AtalhosPage /> },
      ...(CASCA_NOVA ? [{ path: 'fila', element: <FilaPage /> }] : []),
      {
        path: '*',
        element: CASCA_NOVA ? <Erro404Page /> : <StubPage titulo="Pagina nao encontrada" />,
      },
    ],
  },
  {
    path: '/upgrade/kit',
    element: (
      <Suspense fallback={null}>
        <UpgradeKitPage />
      </Suspense>
    ),
  },
  {
    path: '/upgrade/shell',
    element: (
      <Suspense fallback={null}>
        <UpgradeShellDemoPage />
      </Suspense>
    ),
  },
]);
