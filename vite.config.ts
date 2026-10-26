import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react-swc';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

function precacheManifest(): Plugin {
  return {
    name: 'sanjeh-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const assets = Object.keys(bundle).filter((fileName) =>
        /\.(?:js|css)$/.test(fileName),
      );
      // A fresh id per build gives the service worker new cache names.
      const buildId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      this.emitFile({
        type: 'asset',
        fileName: 'precache-manifest.js',
        source: `self.__SANJEH_BUILD_ID__ = ${JSON.stringify(buildId)};\nself.__SANJEH_PRECACHE__ = ${JSON.stringify(assets)};\n`,
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheManifest()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
