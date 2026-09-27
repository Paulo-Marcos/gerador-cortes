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
    // Mesmo com as versões alinhadas (D-734), cada projeto tem o seu
    // node_modules — sem isto seriam duas instâncias do React, e um elemento
    // de uma não é elemento para a outra (D-725).
    dedupe: ['react', 'react-dom', 'remotion'],
  },
});
