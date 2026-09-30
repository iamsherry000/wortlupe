// T8 對抗性輸入、字典檔毀損、剪貼簿權限；TESTS §6 口語組（頁面層）
import { test, expect } from '@playwright/test';
import { openApp, readText, tap } from './helpers.js';

const ADVERSARIAL = {
  只有表情: '😅😅👍🏽🇩🇪',
  空白: '     \n\n\t   ',
  純數字: '15 3,50 12:30 2026',
  '2000 字以上': 'Ich gehe heute nach Hause, weil ich müde bin. '.repeat(50),
  德英混雜: 'Ich hab das Meeting gecancelt.',
  荷蘭文: 'Ik ga morgen naar huis.',
};

test.describe('T8 對抗性輸入 100% 不壞頁', () => {
  for (const [name, text] of Object.entries(ADVERSARIAL)) {
    test(`T8 ${name}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await openApp(page);
      await page.locator('#input').fill(text);
      await page.locator('#read').click();
      const hasWords = /\p{L}{2,}/u.test(text);
      if (hasWords) {
        await expect(page.locator('#text .w').first()).toBeVisible();
        await page.locator('#text .w').first().click();
        await expect(page.locator('#card')).toHaveAttribute('data-state', /^(found|notfound)$/);
      } else {
        // 沒有可查的字 → 可讀的訊息，不是空白頁
        await expect(page.locator('#message')).toBeVisible();
        await expect(page.locator('#message')).toContainText('No German words');
      }
      // 頁面還活著：回去再查一個正常句子
      await page.locator('#edit').click();
      await readText(page, 'Das Haus ist groß.');
      await expect(await tap(page, 'Haus')).toContainText('das Haus');
      expect(errors).toEqual([]);
    });
  }
});

test.describe('T8 字典檔載入失敗 → 明確錯誤訊息', () => {
  test.use({ serviceWorkers: 'block' }); // 讓攔截直接作用在頁面請求上

  test('T8 lexicon 毀損', async ({ page }) => {
    await page.route('**/data/lexicon.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '{"Haus":[{"pos":' }));
    await openApp(page);
    await expect(page.locator('#message')).toContainText('Dictionary could not be loaded');
    // 還是可以貼上看原文，點字給錯誤而不是空白
    await readText(page, 'Das Haus ist groß.');
    const card = await tap(page, 'Haus');
    await expect(card).toHaveAttribute('data-state', 'error');
    await expect(card).toContainText('Dictionary could not be loaded');
  });

  test('T8 變化形分片毀損', async ({ page }) => {
    await page.route('**/data/runtime/f-*.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: 'garbage' }));
    await openApp(page);
    await readText(page, 'Das Haus ist groß.');
    const card = await tap(page, 'Haus');
    await expect(card).toHaveAttribute('data-state', 'error');
    await expect(card).toContainText('Dictionary could not be loaded');
  });

  test('T8 字典檔 404', async ({ page }) => {
    await page.route('**/data/lexicon.json', (r) => r.fulfill({ status: 404, body: 'not found' }));
    await openApp(page);
    await expect(page.locator('#message')).toContainText('Dictionary could not be loaded');
  });
});

test.describe('P1 輸入：貼上按鈕讀剪貼簿', () => {
  test('P1 貼上 剪貼簿有字 → 直接變成閱讀頁', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { readText: async () => 'Das Haus ist groß.' }, configurable: true });
    });
    await openApp(page);
    await page.locator('#paste').click();
    await expect(page.locator('#text .w')).toHaveCount(4);
  });

  test('T8 剪貼簿權限被拒 → 提示改用手動貼進文字框', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', {
        value: { readText: async () => { throw new DOMException('denied', 'NotAllowedError'); } }, configurable: true,
      });
    });
    await openApp(page);
    await page.locator('#paste').click();
    await expect(page.locator('#hint')).toBeVisible();
    await expect(page.locator('#hint')).toContainText('paste it into the box');
    await expect(page.locator('#input')).toBeFocused();
  });

  test('T8 沒有剪貼簿 API → 同樣提示手動貼上', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    });
    await openApp(page);
    await page.locator('#paste').click();
    await expect(page.locator('#hint')).toBeVisible();
  });
});

test.describe('TE 口語組（頁面層）', () => {
  const E = [
    ['Hey, kommst du heut Abend? Ich hab nix vor 😅', 'nix', 'nichts'],
    ['Ne, ich kann leider nicht, muss noch arbeiten.', 'Ne', 'Nein'],
    ['Kannste mir kurz helfen?', 'Kannste', 'Kannst du'],
    ['Alles klar, dann machen wir das so 👍', 'klar', null],
    ['Bis später! 👋', 'später', null],
    ['Moin! Wie gehts?', 'gehts', 'geht es'],
  ];
  for (const [text, w, want] of E) {
    test(`TE ${text}`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await openApp(page);
      await readText(page, text);
      const card = await tap(page, w);
      if (want) await expect(card.locator('.colloquial')).toContainText(want);
      expect(errors).toEqual([]);
    });
  }
});

// P2.2 加修：WhatsApp 小寫名詞，字卡要註明「小寫；大概是名詞 Zeit」
test('LC 小寫名詞字卡註明（hab keine zeit）', async ({ page }) => {
  await openApp(page);
  await readText(page, 'hab keine zeit');
  const card = await tap(page, 'zeit');
  await expect(card.locator('.lowercase-note')).toHaveText('written in lowercase; probably the noun Zeit');
  await expect(card.locator('.reading').first()).toContainText('Zeit');
});
