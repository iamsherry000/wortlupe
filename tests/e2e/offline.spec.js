// S07 離線可用、TN 網路請求數 = 0、T6 效能（離線狀態下量）。
// 每支測試自己開一台伺服器（不同 port＝不同 origin，SW 彼此獨立），裝好 SW 後把伺服器關掉＝真的斷網。
import { test, expect } from '@playwright/test';
import { readText, tap, waitForServiceWorker } from './helpers.js';
import { startServer } from './server.mjs';

test.describe.configure({ mode: 'serial' });

async function installThenGoOffline(page, port) {
  const server = await startServer(port);
  await page.goto(server.url + '/');
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await waitForServiceWorker(page);
  await server.close();
  return server;
}

test('S07 離線可用', async ({ page }) => {
  const server = await installThenGoOffline(page, 4181);
  // 確認真的斷網：直接連伺服器會失敗
  await expect(fetch(server.url + '/index.html')).rejects.toThrow();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  await readText(page, 'Das Haus ist groß.');
  const card = await tap(page, 'Haus');
  await expect(card).toContainText('das Haus');
  await expect(card).toContainText('Häuser');
});

test('TN service worker 安裝後，全部情境執行期間網路請求數 = 0', async ({ page }) => {
  // 伺服器開著（不是斷網），看 app 還會不會去打它
  const server = await startServer(4182);
  await page.goto(server.url + '/');
  await waitForServiceWorker(page);
  server.reset();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const flows = [
    ['Das Haus ist groß.', 'Haus'],
    ['Wir gingen nach Hause.', 'gingen'],
    ['Die Bank ist geschlossen.', 'Bank'],
    ['Kommst du morgen?', 'Kommst'],
    ['Ich rufe dich morgen an.', 'rufe'],
    ['Hallo Jonas 😊 https://x.de 15 Uhr', 'Jonas'],
    ['Moin! Wie gehts?', 'gehts'],
    ['Der größte Fehler war die Eile.', 'größte'],
  ];
  for (const [text, w] of flows) {
    if (await page.locator('#edit').isVisible()) await page.locator('#edit').click();
    await readText(page, text);
    await tap(page, w);
    // P2.1：P2 的操作路徑也要零請求——每句都按 Grammar
    await page.locator('#text .g-btn').first().click();
    await expect(page.locator('#card')).toHaveAttribute('data-state', /^(rules|norule)$/);
  }
  // Why this form（字形規則）與縮寫字卡
  await page.locator('#edit').click();
  await readText(page, 'Ich gebe dem Mann das Buch. Ich bin im Büro.');
  await expect(await tap(page, 'dem')).toContainText('Why this form');
  await expect(await tap(page, 'im')).toContainText('in + dem');
  const { count, paths } = server.state;
  await server.close();
  test.info().annotations.push({ type: 'TN', description: `SW 裝好後伺服器收到 ${count} 個請求：${paths.join(', ') || '（無）'}` });
  console.log(test.info().annotations.at(-1).description);
  // /sw.js 是瀏覽器在每次開頁時自己發的「有沒有新版」檢查（SPEC §2「版本號變更才更新」就靠它），
  // 不是 app 發的，斷網時會安靜失敗、不影響使用（S07 驗過）。app 本身的請求必須是 0。
  // 這條解讀已回報 Charles，由 Charles 判斷 TN 要不要把它寫進規格。
  expect(paths.filter((p) => p !== '/sw.js')).toEqual([]);
  expect(paths.filter((p) => p === '/sw.js').length).toBeLessThanOrEqual(1);
});

test('T6 效能（離線）', async ({ page }) => {
  await installThenGoOffline(page, 4183);

  // 冷啟動到可貼上 ≤ 2 秒：從導覽開始到貼上按鈕可按（介面不等字典）
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
  const coldStart = await page.evaluate(() => Number(document.documentElement.dataset.readyAt));
  expect(coldStart).toBeLessThanOrEqual(2000);

  // 2000 字訊息貼上到可點 ≤ 1 秒
  const text = 'Ich gehe heute nach Hause, weil ich sehr müde bin und morgen früh arbeiten muss. '.repeat(26).slice(0, 2100);
  const pasteMs = await page.evaluate(async (t) => {
    document.querySelector('#input').value = t;
    const t0 = performance.now();
    document.querySelector('#read').click();
    while (!document.querySelector('#text .w')) await new Promise((r) => setTimeout(r, 1));
    await new Promise((r) => requestAnimationFrame(() => r()));
    return performance.now() - t0;
  }, text);
  expect(pasteMs).toBeLessThanOrEqual(1000);

  // 點字到卡片出現 ≤ 150 ms：貼上後馬上點第一個字（最慢，字典可能還在背景載入）＋另外 11 個字，取最大值
  const tapMs = await page.evaluate(async () => {
    const ws = [...document.querySelectorAll('#text .w')];
    const picks = [0, 3, 7, 12, 20, 31, 44, 58, 77, 101, 150, 200].map((k) => ws[k]).filter(Boolean);
    const out = [];
    for (const el of picks) {
      const t0 = performance.now();
      el.click();
      const card = document.querySelector('#card');
      while (!(card.dataset.i === el.dataset.i && card.dataset.state && card.dataset.state !== 'loading')) {
        await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => requestAnimationFrame(() => r()));
      out.push(performance.now() - t0);
    }
    return out;
  });
  const max = Math.max(...tapMs);

  // P2.1：Grammar 面板展開延遲（規格沒訂門檻，先比照點字到卡片的 150 ms）
  const grammarMs = await page.evaluate(async () => {
    const btns = [...document.querySelectorAll('#text .g-btn')].slice(0, 8);
    const out = [];
    for (const b of btns) {
      const t0 = performance.now();
      b.click();
      const card = document.querySelector('#card');
      while (!(card.dataset.mode === 'grammar' && /^(rules|norule)$/.test(card.dataset.state || ''))) {
        await new Promise((r) => setTimeout(r, 0));
      }
      await new Promise((r) => requestAnimationFrame(() => r()));
      out.push(performance.now() - t0);
    }
    return out;
  });
  const gmax = Math.max(...grammarMs);
  test.info().annotations.push({ type: 'T6', description: `冷啟動 ${coldStart} ms；2000 字貼上到可點 ${pasteMs.toFixed(0)} ms；點字到卡片 最大 ${max.toFixed(0)} ms，各次 ${tapMs.map((x) => x.toFixed(0)).join('/')}；Grammar 展開 最大 ${gmax.toFixed(0)} ms，各次 ${grammarMs.map((x) => x.toFixed(0)).join('/')}` });
  console.log(test.info().annotations.at(-1).description);
  expect(max).toBeLessThanOrEqual(150);
  expect(gmax).toBeLessThanOrEqual(150);
});
