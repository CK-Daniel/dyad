import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import path from 'node:path';

// Web-only configuration for GitHub Codespaces
export default defineConfig({
  plugins: [
    react(),
    tailwind(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  root: '.',
  base: '/',
  server: {
    port: 5173,
    host: true, // Listen on all addresses for Codespaces
    strictPort: false,
  },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.web.html'),
      },
    },
  },
  define: {
    'process.env.IS_WEB': 'true',
    'process.env.IS_ELECTRON': 'false',
  },
});