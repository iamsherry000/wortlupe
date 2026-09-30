// 交付用截圖：手機尺寸。P1：淺色／深色字卡；P2：Grammar 面板、字卡 Why this form。
// P2.1 起輸出到 docs/screens/，不覆寫 docs/ 下的驗收截圖（Tester 與 Charles 用的那份）。
import { test, expect } from '@playwright/test';
import { openApp, readText, tap } from './helpers.js';

for (const scheme of ['light', 'dark']) {
  test(`截圖 P1 ${scheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await readText(page, 'Hey, kommst du heut Abend? Ich hab nix vor 😅\n\nWir wohnen in zwei Häusern. Die Bank ist geschlossen, aber ich rufe dich morgen an.');
    await tap(page, 'Häusern');
    await expect(page.locator('#card')).toContainText('das Haus');
    await page.screenshot({ path: `docs/screens/p1-${scheme}.png` });
  });
}

test('截圖 P2 Grammar 面板', async ({ page }) => {
  await openApp(page);
  await readText(page, 'Ich bleibe zu Hause, weil ich krank bin. Morgen rufe ich dich an.');
  await page.locator('#text .g-btn').first().click();
  await expect(page.locator('#card')).toHaveAttribute('data-state', 'rules');
  await page.screenshot({ path: 'docs/screens/p2-grammar.png' });
});

for (const scheme of ['light', 'dark']) {
  test(`截圖 P2.1 輸入頁 Read 按鈕（${scheme}）`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await page.screenshot({ path: `docs/screens/p21-compose-${scheme}.png` });
  });
}

test('截圖 P2.1 縮寫字卡＋長字不破版', async ({ page }) => {
  await openApp(page);
  await readText(page, 'Ich bin im Büro.\nRindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz!\nDas ist der Donaudampfschifffahrtsgesellschaftskapitän.');
  await tap(page, 'im');
  await expect(page.locator('#card .contraction')).toBeVisible();
  await page.screenshot({ path: 'docs/screens/p21-contraction-longword.png' });
});

// P2.6（SPEC §4.5）：freuen 只講這句裡的形＋用法句型（Sherry 9/27：「這有點多了吧，沒有什麼意義」）
for (const scheme of ['light', 'dark']) {
  test(`截圖 P2.6 這句裡的形＋用法（${scheme}）`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await openApp(page);
    await readText(page, 'Wir freuen uns auf das Wochenende!');
    const card = await tap(page, 'freuen');
    const form = card.locator('.reading').first().locator('[data-field="form"]');
    await expect(form).toContainText('present tense · 1st person · plural (wir)');
    await expect(form).toContainText('in this sentence');
    await expect(form.locator('details.more-forms')).not.toHaveAttribute('open', '');
    await expect(card).not.toContainText('comparative');
    // 對得上這句的用法緊接在形下面；其餘用法在卡片底部，不重複
    const hit = card.locator('[data-field="usage-hit"]');
    await expect(hit).toContainText('sich freuen auf + accusative');
    await expect(hit).toContainText('look forward to');
    await expect(card.locator('[data-field="usage"]')).toContainText('sich freuen über + accusative');
    await expect(card.locator('[data-field="usage"]')).not.toContainText('sich freuen auf');
    await page.screenshot({ path: `docs/screens/p26-context-${scheme}.png` });
    await card.locator('[data-field="usage"]').evaluate((el) => el.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `docs/screens/p26-usage-${scheme}.png` });
  });
}

test('截圖 P2 Why this form', async ({ page }) => {
  await openApp(page);
  await readText(page, 'Ich gebe dem Mann das Buch.\nSie hat mit den Kindern gespielt.');
  await tap(page, 'dem');
  await expect(page.locator('#card .why-form')).toBeVisible();
  await page.locator('#card .why-form').evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: 'docs/screens/p2-why-form.png' });
});
