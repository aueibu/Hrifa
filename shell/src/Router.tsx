import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { CompositionWorkbenchPage } from './pages/CompositionWorkbench.page';
import { HarmonicFieldLabPage } from './pages/HarmonicFieldLab.page';
import { HarmonicFieldLabMockPage } from './pages/harmonic-field-lab/mock/HarmonicFieldLabMock.page';
import { HomePage } from './pages/Home.page';
import { IntervalPlacementPage } from './pages/IntervalPlacement.page';
import { NotFoundPage } from './pages/NotFound.page';
import { PointConstructionPage } from './pages/PointConstruction.page';
import { RadialGrowthTreePage } from './pages/RadialGrowthTree.page';
import { RagaExplorerPage } from './pages/RagaExplorer.page';
import { ScaleExplorerPage } from './pages/ScaleExplorer.page';
import { SegmentTangentConstructionPage } from './pages/SegmentTangentConstruction.page';
import { ThemeEditorPage } from './pages/ThemeEditor.page';
import { UsernameSeedsPage } from './pages/UsernameSeeds.page';

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <HomePage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/username-seeds',
      element: <UsernameSeedsPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/interval-placement',
      element: <IntervalPlacementPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/composition-workbench',
      element: <CompositionWorkbenchPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/point-construction',
      element: <PointConstructionPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/radial-growth-tree',
      element: <RadialGrowthTreePage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/segment-tangent-construction',
      element: <SegmentTangentConstructionPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/theme',
      element: <ThemeEditorPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/scale-explorer',
      element: <ScaleExplorerPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/raga-explorer',
      element: <RagaExplorerPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/harmonic-field-lab',
      element: <HarmonicFieldLabPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '/harmonic-field-lab/mock',
      element: <HarmonicFieldLabMockPage />,
      errorElement: <NotFoundPage />,
    },
    {
      path: '*',
      element: <NotFoundPage />,
    },
  ],
  {
    basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
  }
);

export function Router() {
  return <RouterProvider router={router} />;
}
