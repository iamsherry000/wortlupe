import { defineConfig } from 'vitest/config';

// 單元測試跑 tests/*.test.js 與 tests/regression/（TH 集外迴歸）；tests/e2e/ 由 Playwright 跑
export default defineConfig({
  test: { include: ['tests/*.test.js', 'tests/regression/*.test.js'], testTimeout: 20_000 },
});
