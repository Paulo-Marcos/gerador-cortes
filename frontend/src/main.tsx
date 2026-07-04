import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router-dom';
import { router } from './routes';
import { TooltipProvider } from './components/ui/tooltip';
import { ThemeProvider } from './hooks/useTheme';
import { bootstrapPalette } from './hooks/usePalette';
import { ToastProvider } from './components/ui/toaster';
import './index.css';

// Aplica a paleta salva no localStorage o mais cedo possivel — antes
// do React hidratar — para evitar flash de cor no boot.
bootstrapPalette();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <TooltipProvider delayDuration={150}>
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </TooltipProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
);
