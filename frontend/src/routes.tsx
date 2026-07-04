import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from '@/App';
import { ProjetosPage } from '@/features/projetos/ProjetosPage';
import { StubPage } from '@/pages/StubPage';

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
const PostProductionPage = lazy(() =>
  import('@/features/post-production/PostProductionPage').then((m) => ({
    default: m.PostProductionPage,
  })),
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

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Navigate to="/projetos" replace /> },
      { path: 'projetos', element: <ProjetosPage /> },
      { path: 'projetos/:id', element: <ProjetoDetalhePage /> },
      { path: 'projetos/:id/cortes', element: <EditorPage /> },
      { path: 'projetos/:id/cortes/:corteId', element: <EditorPage /> },
      { path: 'projetos/:id/metadados', element: <MetadataPage /> },
      { path: 'projetos/:id/post-production', element: <ScenesPostProductionPage /> },
      { path: 'projetos/:id/final-review', element: <FinalReviewPage /> },
      { path: 'projetos/:id/export', element: <PostProductionPage /> },
      { path: 'buscar-lives', element: <LiveSearchPage /> },
      { path: 'ranking-lives', element: <RankingLivesPage /> },
      { path: 'padroes-thumbnail', element: <ThumbnailPadroesPage /> },
      { path: 'canais', element: <ChannelsPage /> },
      { path: '*', element: <StubPage titulo="Pagina nao encontrada" /> },
    ],
  },
]);
