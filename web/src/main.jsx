import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import AuthGate from './components/AuthGate.jsx';
import { CreateProvider } from './components/CreateModal.jsx';
import { SaveItemProvider } from './components/SaveItem.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, refetchOnWindowFocus: true, retry: 1 },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthGate>
            <SaveItemProvider>
              <CreateProvider>
                <App />
              </CreateProvider>
            </SaveItemProvider>
          </AuthGate>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
