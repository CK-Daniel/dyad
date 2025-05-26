import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/globals.css';
import './web/mockElectron'; // Import mock electron API
import { simulateMockEvents } from './web/mockElectron';

// Import the existing app components
import AppLayout from './app/layout';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from './contexts/ThemeContext';
import { DeepLinkProvider } from './contexts/DeepLinkContext';

const queryClient = new QueryClient();

// Web mode banner component
const WebModeBanner = () => (
  <div className="bg-yellow-500 text-black px-4 py-2 text-center text-sm font-medium">
    🌐 Running in GitHub Codespaces Web Mode - Some features may be limited
  </div>
);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// Start mock event simulation
simulateMockEvents();

root.render(
  <React.StrictMode>
    <WebModeBanner />
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <DeepLinkProvider>
          <AppLayout>
            <RouterProvider router={router} />
          </AppLayout>
        </DeepLinkProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

console.log('Dyad Web Mode initialized for GitHub Codespaces');