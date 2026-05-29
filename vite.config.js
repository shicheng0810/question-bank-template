import { defineConfig, loadEnv } from 'vite';

import { createRapidOcrVitePlugin } from './src/server/local-rapidocr-proxy.js';
import { createOpenAiVisionOcrVitePlugin } from './src/server/openai-vision-ocr-proxy.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // SITE_ONLY=1 builds just the student-facing answering site (no Extractor).
  // GitHub Pages uses this so the author tool stays local-only; a plain `npm run build`
  // still builds both apps for local use.
  const siteOnly = process.env.SITE_ONLY === '1' || process.env.SITE_ONLY === 'true';

  return {
    // Relative asset paths so the built site works unchanged on GitHub Pages (both
    // user pages `user.github.io` and project pages `user.github.io/<repo>/`),
    // Cloudflare Pages, any sub-path host, and even opened directly from disk.
    // Runtime fetches (banks/index.json) are already relative, so no base is hard-coded.
    base: './',
    plugins: [
      createRapidOcrVitePlugin({
        getServerUrl: () => process.env.RAPIDOCR_URL || env.RAPIDOCR_URL || 'http://127.0.0.1:8765',
      }),
      createOpenAiVisionOcrVitePlugin({
        getApiKey: () => process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || '',
      }),
    ],
    build: {
      rollupOptions: {
        input: siteOnly
          ? { site: 'index.html' }
          : { site: 'index.html', extractor: 'extractor/index.html' },
      },
    },
    test: {
      exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    },
  };
});
