import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';

const videoRendererSrc = path.resolve(__dirname, '../video-renderer/src');

// D-197: o preview reaproveita os componentes reais do video-renderer
// (@video-renderer/cenas-v2), incluindo MascotSpotlight, que gateia o mascote em
// import.meta.env.VITE_CANAL_MASCOTE_HABILITADO === 'true'. Essa env nunca foi
// definida, entao o preview escondia o mascote (mesmo bug do render, corrigido no
// remotion.config.ts). Aqui derivamos o valor da PRESENCA das poses do mascote
// (materializadas por canal em frontend/public/mascote), mantendo preview e render
// consistentes sem tocar no componente travado. Reavalia ao reiniciar o dev
// server / no build (limitacao do env build-time do Vite).
// E-011: pasta canonica `mascote/`; o nome legado `sapo/` e aceito como fallback
// para nao regredir caches materializados antes da genericizacao.
const mascotePosePadrao = ['mascote', 'sapo']
  .map((pasta) => path.resolve(__dirname, 'public', pasta, 'sapo_pensativo.png'))
  .find((p) => fs.existsSync(p));
const mascoteHabilitado = mascotePosePadrao !== undefined;

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_CANAL_MASCOTE_HABILITADO': JSON.stringify(
      mascoteHabilitado ? 'true' : 'false',
    ),
  },
  server: {
    port: 4300,
    strictPort: true,
    // Sem isto o Vite recusa servir / não detecta mudanças em
    // ../video-renderer/src (fora do root). HMR fica preso na versão
    // inicialmente bundled — editar Chrome.tsx, Mascote.tsx etc.
    // não tem efeito até restart do dev server.
    fs: {
      allow: [path.resolve(__dirname, '..')],
    },
    watch: {
      followSymlinks: true,
      // Polling: detecta mudanças em path externo (`../video-renderer/src`)
      // que o watcher nativo do Windows às vezes não pega via alias.
      // 300ms é responsivo sem queimar CPU.
      usePolling: true,
      interval: 300,
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@video-renderer': videoRendererSrc,
    },
    dedupe: ['react', 'react-dom', 'remotion'],
  },
});
