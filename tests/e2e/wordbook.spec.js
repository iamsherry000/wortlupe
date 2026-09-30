// P6.3 單字本畫面（TESTS §12：S12–S23 端對端、TK 效能／離線、對抗性）。Playwright WebKit（iPhone 13 視窗）。
import { test, expect } from '@playwright/test';
import { openApp, waitForServiceWorker } from './helpers.js';
import { startServer } from './server.mjs';

const SAMPLE = 'lebe seit\n\nbald\n\nsoon\n\nfeiern\n\nParty machen\n\nfeiren abend\n\nAll das';

async function openWords(page) {
  await page.locator('#tab-words').click();
  await expect(page.locator('#words')).toBeVisible();
}
async function preview(page, text) {
  await openWords(page);
  await page.locator('#wb-add').click();
  await page.locator('#wb-input').fill(text);
  await page.locator('#wb-preview-btn').click();
  await expect(page.locator('#wb-preview')).toHaveAttribute('data-state', 'ready');
  return page.locator('#wb-preview .pv-row');
}
async function importText(page, text) {
  await preview(page, text);
  await page.locator('#wb-commit').click();
  await expect(page.locator('#wb-home')).toBeVisible();
}
const rowTexts = (rows) => rows.evaluateAll((els) => els.map((e) => {
  const g = e.querySelector('.pv-german .pv-typed').textContent;
  const n = e.querySelector('.pv-note-text');
  return n ? `${g} ‖ ${n.textContent}` : g;
}));
// 分組頁：把某個字的某個方向移到某一組（S17、S18 的前置條件）
async function moveTo(page, text, dir, group) {
  await openWords(page);
  await page.locator('#wb-all').click();
  await expect(page.locator('#wb-items')).toHaveAttribute('data-state', 'ready');
  const row = page.locator(`.wb-item[data-dir="${dir}"]`, { hasText: text }).first();
  await row.locator('select').selectOption(group);
  await expect(row.locator('.due')).not.toHaveText('new');
  await page.locator('#wb-back').click();
}
// 預覽上的按鈕是非同步的（要查字典）：按完等預覽重畫好
async function act(page, locator) {
  await locator.click();
  await expect(page.locator('#wb-preview')).toHaveAttribute('data-state', 'ready');
}
async function startReview(page) {
  await page.locator('#wb-start').click();
  await expect(page.locator('#wb-progress')).toHaveText(/^1 \//);
}
async function flipAndAnswer(page, button) {
  const before = await page.locator('#wb-progress').textContent();
  await page.locator('#wb-card').click();
  await expect(page.locator('#wb-card')).toHaveAttribute('data-side', 'back');
  await page.locator(button).click();
  // 下一張已經換上（或本次結束）
  await expect(async () => {
    const sumVisible = await page.locator('#wb-summary').isVisible();
    const now = await page.locator('#wb-progress').textContent();
    expect(sumVisible || now !== before).toBe(true);
  }).toPass();
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
});

test('S12 夾雜輸入切出德文與原樣解釋', async ({ page }) => {
  const rows = await preview(page, 'die Rechnung bill 帳單\naufstehen - 起床\nder Termin: appointment');
  await expect(rows).toHaveCount(3);
  expect(await rowTexts(rows)).toEqual(['die Rechnung ‖ bill 帳單', 'aufstehen ‖ 起床', 'der Termin ‖ appointment']);
  await expect(page.locator('#wb-commit')).toHaveText('Add 3 words');
});

test('S13 沒附解釋的字由字典補，變化形存原形', async ({ page }) => {
  const rows = await preview(page, 'Kündigungsfrist\ngingen');
  const k = rows.nth(0);
  await expect(k.locator('.pv-display')).toHaveText('die Kündigungsfrist');
  await expect(k.locator('.pv-dict')).toContainText('plural');
  await expect(k.locator('.pv-dict')).toContainText('notice');
  await expect(k.locator('.pv-note-text')).toHaveCount(0);
  await expect(rows.nth(1).locator('.pv-from')).toHaveText('gingen → gehen');
  await page.locator('#wb-commit').click();
  await page.locator('#wb-all').click();
  await expect(page.locator('.wb-item', { hasText: 'gehen' }).first()).toBeVisible();
  await expect(page.locator('.wb-item', { hasText: 'gingen' })).toHaveCount(0);
});

test('S14 查不到的字不編造（複習翻到背面）', async ({ page }) => {
  await importText(page, 'Blarkenschaft - 亂打的');
  await startReview(page);
  // 只有正向卡（反向卡的正面是「亂打的」）；翻到德→意思那張
  for (let k = 0; k < 2; k++) {
    if ((await page.locator('#wb-card').getAttribute('data-dir')) === 'fwd') break;
    await flipAndAnswer(page, '#wb-unsure');
  }
  await page.locator('#wb-card').click();
  const back = page.locator('#wb-card .back');
  await expect(back.locator('.your-note')).toHaveText('亂打的');
  await expect(back).toContainText('Not in dictionary');
  await expect(back.locator('[data-dict-field]')).toHaveCount(0);
});

test('S15 冠詞打錯不默默改', async ({ page }) => {
  const rows = await preview(page, 'der Rechnung - 帳單');
  await expect(rows.nth(0).locator('.flag-article')).toHaveText('Article: die (you wrote der)');
  await expect(rows.nth(0).locator('.pv-note-text')).toHaveText('帳單');
});

test('S16 德英同形不猜分界：點一下決定', async ({ page }) => {
  const rows = await preview(page, 'gehen will go');
  const r = rows.nth(0);
  await expect(r.locator('.flag-check')).toContainText('Check split');
  await act(page, r.locator('.split-word', { hasText: 'will' }));
  expect(await rowTexts(page.locator('#wb-preview .pv-row'))).toEqual(['gehen ‖ will go']);
  await expect(page.locator('#wb-preview .flag-check')).toHaveCount(0);
});

test('S17 重複的字不新增、熟悉度不歸零', async ({ page }) => {
  await importText(page, 'gehen');
  await moveTo(page, 'gehen', 'fwd', 'Almost');
  const rows = await preview(page, 'ging - 走（過去式）');
  await expect(rows.nth(0).locator('.flag-dup')).toBeVisible();
  await page.locator('#wb-commit').click();
  await page.locator('#wb-all').click();
  const items = page.locator('.wb-item[data-dir="fwd"]');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('gehen');
  await expect(items.first()).toContainText('走（過去式）');
  await expect(items.first().locator('select')).toHaveValue('Almost');
});

test('S18 答對往上、答錯退回', async ({ page }) => {
  await importText(page, 'die Rechnung - 帳單');
  await moveTo(page, 'Rechnung', 'fwd', 'Familiar');
  await moveTo(page, 'Rechnung', 'rev', 'Known'); // 只看正向卡
  await page.evaluate(() => { window.__wortlupeDayOffset = 3; });
  await openWords(page);
  await expect(page.locator('#wb-due')).toContainText('1');
  await startReview(page);
  await flipAndAnswer(page, '#wb-know');
  await expect(page.locator('#wb-summary')).toBeVisible();
  await page.locator('#wb-done').click();
  await page.locator('#wb-all').click();
  const fwd = page.locator('.wb-item[data-dir="fwd"]').first();
  await expect(fwd.locator('select')).toHaveValue('Almost');
  await expect(fwd.locator('.due')).toHaveText('due in 7 days');
  await page.locator('#wb-back').click();

  await page.evaluate(() => { window.__wortlupeDayOffset = 10; });
  await openWords(page);
  await startReview(page);
  await flipAndAnswer(page, '#wb-forgot');
  // 當次複習結束前再出一次
  await expect(page.locator('#wb-card')).toBeVisible();
  await expect(page.locator('#wb-card .front')).toContainText('die Rechnung');
  await flipAndAnswer(page, '#wb-know');
  await expect(page.locator('#wb-summary')).toBeVisible();
  await page.locator('#wb-done').click();
  await page.locator('#wb-all').click();
  await expect(page.locator('.wb-item[data-dir="fwd"]').first().locator('select')).toHaveValue('Learning');
});

test('S20 Sherry 9/30 真實樣本', async ({ page }) => {
  const rows = await preview(page, SAMPLE);
  expect(await rowTexts(rows)).toEqual(['lebe seit', 'bald ‖ soon', 'feiern', 'Party machen', 'feiren abend', 'All das']);
  const fe = rows.nth(4);
  await expect(fe.locator('.pv-suggest')).toHaveText('Did you mean Feierabend?');
  await expect(fe.locator('.pv-dict [data-dict-field]')).toHaveCount(0);
  await expect(fe.locator('.pv-dict')).toContainText('Not in dictionary');
  await expect(rows.nth(0).locator('.pv-restored')).toHaveText('leben seit');
  await act(page, rows.nth(3).locator('.pv-merge'));
  await act(page, page.locator('#wb-preview .pv-row').nth(3).locator('.pv-suggest'));
  expect(await rowTexts(page.locator('#wb-preview .pv-row'))).toEqual(['lebe seit', 'bald ‖ soon', 'feiern ‖ Party machen', 'Feierabend', 'All das']);
  await expect(page.locator('#wb-commit')).toHaveText('Add 5 words');
});

test('P6.5 §5.1 E Merge into previous：有 Your note 的不顯示，沒 note 的顯示普通樣式', async ({ page }) => {
  const rows = await preview(page, SAMPLE);
  // lebe seit／bald‖soon／feiern／Party machen／feiren abend／All das
  await expect(rows.nth(0).locator('.pv-merge')).toHaveCount(0); // 第一筆沒有上一筆
  await expect(rows.nth(1).locator('.pv-merge')).toHaveCount(0); // bald ‖ soon 已有 note，按了會誤併進 lebe seit
  for (const k of [2, 3, 4, 5]) {
    await expect(rows.nth(k).locator('.pv-merge')).toHaveCount(1);
    await expect(rows.nth(k).locator('.pv-merge')).not.toHaveClass(/hint/);
  }
  const accent = await rows.nth(3).locator('.pv-merge').evaluate((el) => getComputedStyle(el).borderColor);
  const plain = await rows.nth(3).locator('.pv-remove').evaluate((el) => getComputedStyle(el).borderColor);
  expect(accent).toBe(plain); // 不亮藍框
});

test('S21 拼字建議不按就不採用', async ({ page }) => {
  await importText(page, 'feiren abend');
  await page.locator('#wb-all').click();
  const item = page.locator('.wb-item[data-dir="fwd"]').first();
  await expect(item).toContainText('feiren abend');
  await expect(item).toContainText('Not in dictionary');
  await expect(item).not.toContainText('Feierabend');
});

test('S22 行首 = 一定掛到上一筆', async ({ page }) => {
  const rows = await preview(page, 'feiern\n\n= Party machen');
  await expect(rows).toHaveCount(1);
  expect(await rowTexts(rows)).toEqual(['feiern ‖ Party machen']);
});

test('S23 雙向考', async ({ page }) => {
  await importText(page, 'die Rechnung - 帳單\nKündigungsfrist');
  await expect(page.locator('#wb-due')).toContainText('4');
  await startReview(page);
  const seen = [];
  for (let k = 0; k < 4; k++) {
    await expect(page.locator('#wb-progress')).toHaveText(new RegExp(`^${k + 1} /`));
    const card = page.locator('#wb-card');
    const dir = await card.getAttribute('data-dir');
    const front = (await card.locator('.front .prompt').textContent()).trim();
    await card.click();
    const back = (await card.locator('.back .answer').textContent()).trim();
    seen.push({ dir, front, back });
    // 反向的 Rechnung 按 Know it，其他按 Not sure
    await page.locator(dir === 'rev' && back.includes('Rechnung') ? '#wb-know' : '#wb-unsure').click();
  }
  expect(seen).toContainEqual({ dir: 'fwd', front: 'die Rechnung', back: expect.any(String) });
  expect(seen).toContainEqual({ dir: 'rev', front: '帳單', back: 'die Rechnung' });
  const kRev = seen.find((s) => s.dir === 'rev' && s.back.includes('Kündigungsfrist'));
  expect(kRev.front).toMatch(/notice|period/i); // 沒有 note → 字典英文第一個義項
  await page.locator('#wb-done').click();
  await page.locator('#wb-all').click();
  const rev = page.locator('.wb-item[data-dir="rev"]', { hasText: 'Rechnung' }).first();
  const fwd = page.locator('.wb-item[data-dir="fwd"]', { hasText: 'Rechnung' }).first();
  await expect(rev.locator('select')).toHaveValue('Learning');
  await expect(fwd.locator('select')).toHaveValue('New');
});

test('S14／TK 原樣：背面的 Your note 與 Dictionary 分開', async ({ page }) => {
  await importText(page, 'die Rechnung bill 帳單');
  await startReview(page);
  for (let k = 0; k < 2; k++) {
    if ((await page.locator('#wb-card').getAttribute('data-dir')) === 'fwd') break;
    await flipAndAnswer(page, '#wb-unsure');
  }
  await page.locator('#wb-card').click();
  const back = page.locator('#wb-card .back');
  await expect(back.locator('.your-note')).toHaveText('bill 帳單');
  await expect(back.locator('.section-title')).toHaveText(['Your note', 'Dictionary']);
  await expect(back.locator('[data-dict-field="plural"]')).toContainText('Rechnungen');
});

test('匯出：Markdown 有組別與原樣解釋', async ({ page }) => {
  await importText(page, 'die Rechnung bill 帳單\nBlarkenschaft - 亂打的！');
  await page.locator('#wb-export').click();
  await expect(page.locator('#wb-export-text')).toHaveValue(/\| bill 帳單 \|/);
  const md = await page.locator('#wb-export-text').inputValue();
  expect(md).toContain('| bill 帳單 |');
  expect(md).toContain('| 亂打的！ |');
  expect(md).toMatch(/Group/);
});

test('分組頁：每組幾個、點進去看清單、刪除', async ({ page }) => {
  await importText(page, 'die Rechnung - 帳單\nTermin');
  await openWords(page);
  await expect(page.locator('.wb-group[data-group="New"] .count')).toHaveText('4');
  await page.locator('.wb-group[data-group="New"]').click();
  await expect(page.locator('.wb-item')).toHaveCount(4);
  const del = page.locator('.wb-item', { hasText: 'Termin' }).first().locator('.wb-delete');
  await del.click();
  await del.click(); // 第二下才真的刪
  await expect(page.locator('.wb-item', { hasText: 'Termin' })).toHaveCount(0);
});

test('TK 效能：300 行貼上到預覽 ≤ 2 秒；翻卡 ≤ 100 ms', async ({ page }) => {
  const base = ['die Rechnung bill 帳單', 'aufstehen - 起床', 'der Termin: appointment', 'Kündigungsfrist', 'gingen', 'feiren abend',
    'bald', 'soon', 'Bescheid sagen let sb know 通知', 'sich freuen auf\tto look forward to', 'Gift poison', 'lebe seit', 'Wohnung', 'Arzt'];
  const text = Array.from({ length: 300 }, (_, k) => base[k % base.length]).join('\n');
  // 字典先載好（貼上前 App 已開著）
  await page.waitForFunction(() => document.documentElement.dataset.dictReady === '1');
  await openWords(page);
  await page.locator('#wb-add').click();
  await page.locator('#wb-input').fill(text);
  const t0 = Date.now();
  await page.locator('#wb-preview-btn').click();
  await expect(page.locator('#wb-preview')).toHaveAttribute('data-state', 'ready');
  const ms = Date.now() - t0;
  console.log(`TK 300 行 → 預覽 ${ms} ms`);
  expect(ms).toBeLessThanOrEqual(2000);
  await page.locator('#wb-commit').click();
  await startReview(page);
  // 翻 5 次（正→背→正…），每次量「點下去 → 下一個畫面影格」；取中位數（單次會受模擬器排程抖動影響，全部數字都印出來）
  const flip = await page.evaluate(async () => {
    const card = document.getElementById('wb-card');
    const times = [];
    let visible = true;
    for (let k = 0; k < 5; k++) {
      const t = performance.now();
      card.click();
      await new Promise((r) => requestAnimationFrame(() => r()));
      times.push(performance.now() - t);
      const want = k % 2 === 0 ? 'back' : 'front';
      if (card.dataset.side !== want || card.querySelector(`.${want}`).hidden) visible = false;
    }
    return { times, visible };
  });
  const sorted = [...flip.times].sort((a, b) => a - b);
  console.log(`TK 翻卡 ${flip.times.map((x) => x.toFixed(0)).join(' / ')} ms（中位數 ${sorted[2].toFixed(1)}）`);
  expect(flip.visible).toBe(true);
  expect(sorted[2]).toBeLessThanOrEqual(100);
});

test('T8 對抗性：2000 行、整段 WhatsApp 對話、全中文、全英文、只有空白 → 不壞頁', async ({ page }) => {
  const inputs = [
    Array.from({ length: 2000 }, (_, k) => (k % 2 ? `Termin ${k} - 約會` : 'bald')).join('\n'),
    '[29.09.26, 18:02] Jonas: Hey, kommst du heut Abend? 😅\n[29.09.26, 18:03] Sherry: Ja klar! 👍\n[29.09.26, 18:04] Jonas: Super, bis später',
    '這是一段全中文的文字\n完全沒有德文',
    'this is all english\nnothing german here',
  ];
  await openWords(page);
  await page.locator('#wb-add').click();
  for (const t of inputs) {
    await page.locator('#wb-input').fill(t);
    await page.locator('#wb-preview-btn').click();
    await expect(page.locator('#wb-preview')).toHaveAttribute('data-state', 'ready', { timeout: 15_000 });
  }
  await page.locator('#wb-input').fill('   \n\n \t ');
  await page.locator('#wb-preview-btn').click();
  await expect(page.locator('#wb-message')).toContainText('Nothing to add');
  await expect(page.locator('#wb-commit')).toBeHidden();
});

test('T8 對抗性：IndexedDB 寫入失敗 → 明確錯誤，不假裝已匯入', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function put() { throw new DOMException('Disk full (test)', 'QuotaExceededError'); };
    window.__restorePut = () => { IDBObjectStore.prototype.put = orig; };
  });
  await openApp(page);
  await preview(page, 'die Rechnung - 帳單');
  await page.locator('#wb-commit').click();
  await expect(page.locator('#wb-message')).toContainText('Could not save');
  await expect(page.locator('#wb-message')).toHaveClass(/error/);
  await expect(page.locator('#wb-import')).toBeVisible(); // 預覽還在，可以再試
  await page.evaluate(() => window.__restorePut());
  await page.locator('#wb-home-link').click();
  await expect(page.locator('.wb-group[data-group="New"] .count')).toHaveText('0');
});

test.describe('P6.6（SPEC §5.1 F，Tester P6 報告 F1–F8）', () => {
  test('F1 Termn appointmnet：預覽標 Check split、Did you mean Termin?、appointmnet 是 Your note', async ({ page }) => {
    const rows = await preview(page, 'Termn appointmnet');
    await expect(rows).toHaveCount(1);
    expect(await rowTexts(rows)).toEqual(['Termn ‖ appointmnet']);
    await expect(rows.nth(0).locator('.flag-check')).toContainText('Check split');
    await expect(rows.nth(0).locator('.pv-suggest')).toHaveText('Did you mean Termin?');
  });

  test('F2 Kühlschrnak fridge：建議只修德文段，按了 fridge 仍是 note', async ({ page }) => {
    const rows = await preview(page, 'Kühlschrnak fridge');
    await expect(rows.nth(0).locator('.pv-suggest')).toHaveText('Did you mean Kühlschrank?');
    await act(page, rows.nth(0).locator('.pv-suggest'));
    expect(await rowTexts(page.locator('#wb-preview .pv-row'))).toEqual(['Kühlschrank ‖ fridge']);
    await expect(page.locator('#wb-preview')).not.toContainText('Bridge');
  });

  test('F3 每一筆都有 Fix：重選分界、併到上一筆（有 note 也行，收在 Fix 裡）、刪除', async ({ page }) => {
    const rows = await preview(page, 'Ausweis\nId - card\nTermn appointmnet');
    await expect(rows).toHaveCount(3);
    for (let k = 0; k < 3; k++) await expect(rows.nth(k).locator('.pv-fix')).toHaveCount(1);
    // 有 note 的那筆外面沒有 Merge（§5.1 E），Fix 裡面有
    await expect(rows.nth(1).locator('.pv-actions > .pv-merge')).toHaveCount(0);
    await rows.nth(1).locator('.pv-fix').click();
    await act(page, rows.nth(1).locator('.fix-panel .fix-merge'));
    expect(await rowTexts(page.locator('#wb-preview .pv-row'))).toEqual(['Ausweis ‖ Id - card', 'Termn ‖ appointmnet']);
    // 重選分界：整行都是德文
    const r = page.locator('#wb-preview .pv-row').nth(1);
    await r.locator('.pv-fix').click();
    await act(page, r.locator('.fix-panel .split-all'));
    expect(await rowTexts(page.locator('#wb-preview .pv-row'))).toEqual(['Ausweis ‖ Id - card', 'Termn appointmnet']);
    // 刪除
    const r2 = page.locator('#wb-preview .pv-row').nth(1);
    await r2.locator('.pv-fix').click();
    await act(page, r2.locator('.fix-panel .fix-delete'));
    await expect(page.locator('#wb-preview .pv-row')).toHaveCount(1);
  });

  test('F4 長網址／無空白長字串不撐破版面（預覽、複習卡、清單，390 px 不可橫向捲動）', async ({ page }) => {
    const url = 'https://www.bundesregierung.de/breg-de/service/terminvereinbarung-buergeramt-anmeldung-wohnsitz-2026-09-30-extra-lange-adresse';
    const blob = 'x'.repeat(3000);
    await preview(page, `Termin - ${url}\nArzt - ${blob}`);
    const noHScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noHScroll()).toBe(true);
    await page.locator('#wb-commit').click();
    await expect(page.locator('#wb-home')).toBeVisible();
    await startReview(page);
    for (let k = 0; k < 4; k++) {
      await page.locator('#wb-card').click();
      await expect(page.locator('#wb-card')).toHaveAttribute('data-side', 'back');
      expect(await noHScroll()).toBe(true);
      expect(await page.locator('#wb-card').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
      if (await page.locator('#wb-summary').isVisible()) break;
      await page.locator('#wb-unsure').click();
      if (await page.locator('#wb-summary').isVisible()) break;
    }
    await page.locator('#tab-words').click();
    await page.locator('#wb-all').click();
    await expect(page.locator('#wb-items')).toHaveAttribute('data-state', 'ready');
    expect(await noHScroll()).toBe(true);
  });

  test('F5 匯入後首頁不先閃舊數字', async ({ page }) => {
    await preview(page, 'die Rechnung - 帳單\nTermin\nArzt - doctor');
    // 從按下 Add 起每個影格記一次（首頁看得到時的數字）
    await page.evaluate(() => {
      window.__dueSamples = [];
      const tick = () => {
        const home = document.getElementById('wb-home');
        if (home && !home.hidden && home.offsetParent !== null) window.__dueSamples.push(document.querySelector('#wb-due .num')?.textContent);
        if (window.__dueSamples.length < 60) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.locator('#wb-commit').click();
    await expect(page.locator('#wb-due .num')).toHaveText('6');
    await page.waitForFunction(() => window.__dueSamples.length >= 20);
    const samples = await page.evaluate(() => window.__dueSamples);
    expect(samples.length).toBeGreaterThan(0);
    expect(new Set(samples)).toEqual(new Set(['6']));
  });

  test('F6 Add N 是去重後實際新增的數量；併進既有字另外顯示；0 筆時停用並說明', async ({ page }) => {
    await preview(page, Array.from({ length: 300 }, () => 'gehen - go').join('\n'));
    await expect(page.locator('#wb-commit')).toHaveText('Add 1 word');
    await page.locator('#wb-commit').click();
    await expect(page.locator('#wb-home')).toBeVisible();
    await page.locator('#wb-add').click();
    await page.locator('#wb-input').fill('ging - walked\nTermin');
    await page.locator('#wb-preview-btn').click();
    await expect(page.locator('#wb-preview')).toHaveAttribute('data-state', 'ready');
    await expect(page.locator('#wb-commit')).toHaveText('Add 1 word');
    await expect(page.locator('#wb-commit-note')).toContainText('1 merged into existing');
    // 全部移除 → 0 筆：停用＋說明
    await act(page, page.locator('#wb-preview .pv-row').nth(1).locator('.pv-remove'));
    await act(page, page.locator('#wb-preview .pv-row').nth(0).locator('.pv-remove'));
    await expect(page.locator('#wb-commit')).toBeDisabled();
    await expect(page.locator('#wb-commit-note')).toContainText('Nothing to add');
  });

  test('F7 條列符號不出現在預覽標題', async ({ page }) => {
    const rows = await preview(page, '- Wohnung - apartment\n• Miete rent 房租\n1. Hose trousers');
    expect(await rows.locator('.pv-typed').allTextContents()).toEqual(['Wohnung', 'Miete', 'Hose']);
  });

  test('F8 輸入框字型與 App 一致；390 寬首頁三顆按鈕都是一行', async ({ page }) => {
    await openWords(page);
    const fonts = await page.evaluate(() => [getComputedStyle(document.body).fontFamily, getComputedStyle(document.getElementById('wb-input')).fontFamily]);
    expect(fonts[1]).toBe(fonts[0]);
    const hs = await page.evaluate(() => ['wb-add', 'wb-all', 'wb-export'].map((id) => document.getElementById(id).getBoundingClientRect().height));
    expect(new Set(hs).size).toBe(1);
    expect(hs[0]).toBeLessThanOrEqual(48);
  });

  test('§5.1 F 翻卡：點下去到第一個含新內容的影格 p95 ≤ 100 ms；淡入動畫 ≤ 150 ms', async ({ page }) => {
    await importText(page, Array.from({ length: 30 }, (_, k) => ['Rechnung', 'Termin', 'Arzt', 'Wohnung', 'Bank', 'Haus'][k % 6] + ` - n${k}`).join('\n'));
    await startReview(page);
    // P6.7（SPEC §5.1 F 正式量法）：模擬真實使用——每次翻完「等淡入結束」再翻，連翻 40 次取 p95。
    // 淡入長度量的是真正在跑的那個動畫（新的一面上的 CSS transition，用 getAnimations()；
    // P6.6 讀 .front 的 animationDuration 永遠是 0s，Tester T1 抓到）。「每影格連翻」壓力測只記錄不判定。
    const r = await page.evaluate(async () => {
      const card = document.getElementById('wb-card');
      const frame = () => new Promise((res) => requestAnimationFrame(() => res()));
      const times = [];
      const fades = [];
      let ok = true;
      for (let k = 0; k < 40; k++) {
        const want = card.dataset.side === 'back' ? 'front' : 'back';
        const t = performance.now();
        card.click();
        // 第一個影格：rAF 回呼在這個影格畫之前跑，這時 DOM 已經是新的一面
        await frame();
        times.push(performance.now() - t);
        const el = card.querySelector(`.${want}`);
        if (card.dataset.side !== want || el.hidden || !el.textContent.trim()) ok = false;
        const anims = el.getAnimations();
        fades.push(anims.length ? Math.max(...anims.map((a) => Number(a.effect.getComputedTiming().endTime) || 0)) : 0);
        await Promise.all(anims.map((a) => a.finished.catch(() => {})));
        await frame();
      }
      // 壓力測（只記錄）：每個影格翻一次
      const stress = [];
      for (let k = 0; k < 40; k++) {
        const t = performance.now();
        card.click();
        await frame();
        stress.push(performance.now() - t);
      }
      return { times, fades, ok, stress };
    });
    const pct = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.ceil(s.length * p) - 1]; };
    const p95 = pct(r.times, 0.95);
    const fadeMax = Math.max(...r.fades);
    console.log(`TK 翻卡（正式量法，等淡入結束再翻，40 次）：中位數 ${pct(r.times, 0.5).toFixed(0)}、p95 ${p95.toFixed(0)}、最高 ${Math.max(...r.times).toFixed(0)} ms；淡入 ${Math.min(...r.fades)}–${fadeMax} ms`);
    console.log(`TK 翻卡（壓力測，每影格連翻，只記錄）：中位數 ${pct(r.stress, 0.5).toFixed(0)}、p95 ${pct(r.stress, 0.95).toFixed(0)} ms`);
    expect(r.ok).toBe(true);
    expect(p95).toBeLessThanOrEqual(100);
    // 真的有淡入（不是量到 0），而且 ≤ 150 ms
    expect(fadeMax).toBeGreaterThan(0);
    expect(fadeMax).toBeLessThanOrEqual(150);
  });

  test('P6.7 N1 理由文字：查不到的字不寫成「德英同形」', async ({ page }) => {
    const rows = await preview(page, 'Farbe colr 顏色\nArzt blorp zzz');
    for (let k = 0; k < 2; k++) await expect(rows.nth(k).locator('.flag-check')).not.toContainText('both German and English');
    await expect(rows.nth(0).locator('.flag-check')).toContainText('neither in the dictionary nor in the English word list');
  });

  test('P6.7 N3 Schal scarf ⏎ Mode fashion → 兩筆', async ({ page }) => {
    const rows = await preview(page, 'Schal scarf\nMode fashion');
    expect(await rowTexts(rows)).toEqual(['Schal ‖ scarf', 'Mode ‖ fashion']);
  });

  test('§5.1 F About 標英文詞表（SCOWL）授權', async ({ page }) => {
    await expect(page.locator('#about')).toContainText('en_GB');
    await expect(page.locator('#about')).toContainText('SCOWL');
  });
});

test.describe('交付截圖（docs/screenshots/p6-*.png）', () => {
  for (const scheme of ['light', 'dark']) {
    test(`截圖 P6 Import 預覽（Sherry 9/30 真實樣本，${scheme}）`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await openApp(page);
      await preview(page, SAMPLE);
      // 手機一屏的樣子（預覽從頂端開始）；fullPage 會把固定在底部的 Add 按鈕印在頁面中間，不代表實際畫面
      await page.evaluate(() => { const el = document.querySelector('#wb-skipped:not([hidden])') || document.querySelector('#wb-preview'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - document.querySelector('.bar').offsetHeight - 12); });
      await page.screenshot({ path: `docs/screenshots/p6-import${scheme === 'dark' ? '-dark' : ''}.png`, animations: 'disabled' });
    });
  }
  test('截圖 P6.6 Check split＋Fix（Tester F1–F3 的輸入）', async ({ page }) => {
    await openApp(page);
    const rows = await preview(page, 'Ausweis\nID card\n=身分證\nTermn appointmnet\nKühlschrnak fridge\nMama mom');
    await rows.nth(1).locator('.pv-fix').click();
    await expect(page.locator('#wb-preview .fix-panel')).toBeVisible();
    await page.evaluate(() => { const el = document.querySelector('#wb-preview'); window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - document.querySelector('.bar').offsetHeight - 12); });
    await page.screenshot({ path: 'docs/screenshots/p6-fix.png', animations: 'disabled' });
  });
  test('截圖 P6 Review 卡片正面／背面', async ({ page }) => {
    await importText(page, 'die Rechnung bill 帳單\nKündigungsfrist');
    await startReview(page);
    for (let k = 0; k < 4; k++) {
      const c = page.locator('#wb-card');
      if ((await c.getAttribute('data-dir')) === 'fwd' && (await c.locator('.front .prompt').textContent()) === 'die Rechnung') break;
      await flipAndAnswer(page, '#wb-unsure');
    }
    // 截圖抓到過：沒有還原行的字正面印出 "null"（replaceChildren 不濾 null）
    await expect(page.locator('#wb-card .front')).not.toContainText('null');
    await page.screenshot({ path: 'docs/screenshots/p6-review-front.png', animations: 'disabled' });
    await page.locator('#wb-card').click();
    await expect(page.locator('#wb-card')).toHaveAttribute('data-side', 'back');
    await expect(page.locator('#wb-card .back')).not.toContainText('null');
    await page.screenshot({ path: 'docs/screenshots/p6-review-back.png', animations: 'disabled' });
  });
});

test.describe('離線（S19、TN）', () => {
  test.describe.configure({ mode: 'serial' });

  test('S19 離線複習：匯入 50 個字、複習 10 個，重開後進度還在', async ({ page }) => {
    const server = await startServer(4191);
    await page.goto(server.url + '/');
    await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
    await waitForServiceWorker(page);
    await server.close();
    await expect(fetch(server.url + '/index.html')).rejects.toThrow();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
    const words = ['Rechnung', 'Termin', 'Arzt', 'Wohnung', 'Bank', 'Haus', 'Kind', 'Tisch', 'Stuhl', 'Buch', 'Auto', 'Stadt', 'Land', 'Frau', 'Mann',
      'Hund', 'Katze', 'Baum', 'Blume', 'Wasser', 'Brot', 'Milch', 'Zug', 'Weg', 'Tag', 'Nacht', 'Woche', 'Jahr', 'Monat', 'Stunde', 'Minute',
      'Schule', 'Arbeit', 'Freund', 'Familie', 'Bruder', 'Schwester', 'Vater', 'Mutter', 'Sohn', 'Tochter', 'Zimmer', 'Küche', 'Fenster', 'Tür',
      'Straße', 'Bahnhof', 'Flughafen', 'Geld', 'Preis'];
    await importText(page, words.map((w) => `${w} - note ${w}`).join('\n'));
    await expect(page.locator('#wb-due')).toContainText('40'); // 20 個新字 × 兩個方向
    await startReview(page);
    for (let k = 0; k < 10; k++) await flipAndAnswer(page, '#wb-know');
    await expect(page.locator('#wb-review')).toHaveAttribute('data-pending', '0'); // 答案都寫進手機了
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
    await openWords(page);
    await expect(page.locator('.wb-group[data-group="Learning"] .count')).toHaveText('10');
    await expect(page.locator('#wb-due')).toContainText('30');
  });

  test('TN 單字本全部操作期間網路請求數 = 0', async ({ page }) => {
    const server = await startServer(4192);
    await page.goto(server.url + '/');
    await waitForServiceWorker(page);
    server.reset();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', '1');
    const rows = await preview(page, SAMPLE + '\ndie Rechnung - 帳單\ngehen will go\nder Rechnung - x');
    await act(page, rows.nth(3).locator('.pv-merge'));
    await act(page, page.locator('#wb-preview .pv-suggest').first());
    await page.locator('#wb-commit').click();
    await startReview(page);
    for (let k = 0; k < 4; k++) await flipAndAnswer(page, k % 2 ? '#wb-forgot' : '#wb-know');
    await page.locator('#wb-quit').click();
    await page.locator('#wb-done').click();
    await page.locator('#wb-all').click();
    await page.locator('#wb-back').click();
    await page.locator('#wb-export').click();
    const { paths } = server.state;
    await server.close();
    console.log(`TN 單字本：SW 裝好後伺服器收到 ${paths.length} 個請求：${paths.join(', ') || '（無）'}`);
    expect(paths.filter((p) => p !== '/sw.js')).toEqual([]);
  });
});
