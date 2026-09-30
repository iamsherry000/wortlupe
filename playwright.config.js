import { defineConfig, devices } from '@playwright/test';

// 端對端：WebKit（最接近 iPhone Safari）＋ iPhone 13 視窗。
// workers: 1 → 一次只跑一個瀏覽器，不拖慢 Sherry 的筆電。
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'off',
  },
  projects: [
    { name: 'webkit-iphone', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://localhost:4173/index.html',
    reuseExistingServer: false,
    timeout: 20_000,
  },
});
