import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@video-renderer': path.resolve(__dirname, '../video-renderer/src'),
    },
    // O mesmo do vite.config: o código do renderer roda no React do frontend.
    // Sem isto, o teste montava as cenas com o React 19 do renderer e a tela
    // com o 18 — um ambiente que o app não tem (D-725).
    dedupe: ['react', 'react-dom', 'remotion'],
  },
});
