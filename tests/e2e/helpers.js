import { expect } from '@playwright/test';

export const SERVER = 'http://localhost:4173';

export async function openApp(page) {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
}

// 「貼上」＝把文字放進文字框再按 Read（剪貼簿路徑另有專門測試）
export async function readText(page, text) {
  await page.locator('#input').fill(text);
  await page.locator('#read').click();
  await expect(page.locator('#reader')).toBeVisible();
}

export function word(page, text, nth = 0) {
  return page.locator('#text .w', { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).nth(nth);
}

export async function tap(page, text, nth = 0) {
  await word(page, text, nth).click();
  const card = page.locator('#card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-state', /^(found|notfound|error)$/);
  return card;
}

// 等 service worker 接管頁面（裝好＋預先快取完成）
export async function waitForServiceWorker(page) {
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
    }
    return !!reg.active;
  });
}

export async function serverStats() {
  const r = await fetch(`${SERVER}/__stats`);
  return r.json();
}
export async function resetServer() {
  await fetch(`${SERVER}/__reset`, { method: 'POST' });
}
