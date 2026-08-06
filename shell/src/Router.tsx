import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { HomePage } from './pages/Home.page';
import { NotFoundPage } from './pages/NotFound.page';
import { PointConstructionPage } from './pages/PointConstruction.page';
import { ThemeEditorPage } from './pages/ThemeEditor.page';
import { UsernameSeedsPage } from './pages/UsernameSeeds.page';

const router = createBrowserRouter([
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
    path: '/point-construction',
    element: <PointConstructionPage />,
    errorElement: <NotFoundPage />,
  },
  {
    path: '/theme',
    element: <ThemeEditorPage />,
    errorElement: <NotFoundPage />,
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
], {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
});

export function Router() {
  return <RouterProvider router={router} />;
}
