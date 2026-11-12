import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { CreateProvider } from './components/CreateModal.jsx';
import { SaveItemProvider } from './components/SaveItem.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { useMeta } from './lib/hooks.js';
import { LangProvider } from './lib/i18n.jsx';
import { ThemeProvider } from './lib/theme.jsx';
import './index.css';

// Idioma padrão vem de APP_LANG (meta); a escolha na tela tem prioridade.
function LangFromMeta({ children }) {
  const { data } = useMeta();
  return <LangProvider defaultLang={data?.lang}>{children}</LangProvider>;
}

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
          <LangFromMeta>
            <ToastProvider>
              <SaveItemProvider>
                <CreateProvider>
                  <App />
                </CreateProvider>
              </SaveItemProvider>
            </ToastProvider>
          </LangFromMeta>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
