import { defineConfig, loadEnv } from 'vite';

import { createRapidOcrVitePlugin } from './src/server/local-rapidocr-proxy.js';
import { createOpenAiVisionOcrVitePlugin } from './src/server/openai-vision-ocr-proxy.js';
import { createLocalPublishVitePlugin } from './src/server/local-publish-proxy.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  // 方案乙后 vite 只负责提取器（本地作者工具）。做题站点 = scripts/build-pages.mjs
  // 生成的纯静态目录页 + 单文件播放器（docs/），与 vite 构建无关。
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
      createLocalPublishVitePlugin({
        getRoot: () => process.cwd(),
      }),
    ],
    build: {
      rollupOptions: {
        input: { root: 'index.html', extractor: 'extractor/index.html' },
      },
    },
    test: {
      exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
    },
  };
});
