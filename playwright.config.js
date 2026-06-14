import { defineConfig } from '@playwright/test';

const port = Number(process.env.PLAYWRIGHT_PORT || 4179);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    // 用测试专用清单构建（与作者本地的上/下架状态解耦），输出到独立目录
    command: 'BANKS_MANIFEST=tests/fixtures/e2e-site/manifest.json BANKS_ROOT=tests/fixtures/e2e-site PAGES_OUT=.e2e-pages npm run build:pages && E2E_DIR=.e2e-pages node scripts/serve-e2e.mjs',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
