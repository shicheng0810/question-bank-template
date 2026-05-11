import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        site: 'index.html',
        extractor: 'extractor/index.html',
      },
    },
  },
  test: {
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
});
