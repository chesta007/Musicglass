
import { defineConfig, loadEnv } from 'vite';
import process from 'node:process';

export default defineConfig(({ mode }) => {
  // Use node:process to fix type error on cwd()
  const env = loadEnv(mode, process.cwd(), '');
  return {
    base: './',
    build: {
      target: 'esnext',
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
    define: {
      // Mapeamos VITE_GEMINI_API_KEY a process.env.API_KEY para compatibilidad con el SDK GenAI
      'process.env.API_KEY': JSON.stringify(env.VITE_GEMINI_API_KEY || env.API_KEY),
    },
    server: {
      port: 3000,
    }
  };
});
