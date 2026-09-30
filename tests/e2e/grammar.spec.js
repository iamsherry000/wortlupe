// P2 端對端：S09、S10、句中標記、字卡 Why this form；P1 遺留（字卡不擋字、apple-touch-icon、授權標示）
import { test, expect } from '@playwright/test';
import { openApp, readText, tap, word } from './helpers.js';

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw e; });
  await openApp(page);
});

async function openGrammar(page, n = 0) {
  await page.locator('#text .g-btn').nth(n).click();
  const card = page.locator('#card');
  await expect(card).toHaveAttribute('data-mode', 'grammar');
  await expect(card).toHaveAttribute('data-state', /^(rules|norule)$/);
  return card;
}

test('S09 句子文法講解', async ({ page }) => {
  await readText(page, 'Ich bleibe zu Hause, weil ich krank bin.');
  const card = await openGrammar(page, 0);
  await expect(card.locator('.rule[data-rule="G01"]')).toHaveCount(1);
  await expect(card.locator('.rule[data-rule="G02"]')).toHaveCount(1);
  const g02 = card.locator('.rule[data-rule="G02"] .what');
  await expect(g02).toContainText('“weil”');
  await expect(g02).toContainText('“bin”');
  // 標記：bin 在從句句尾、從句淡底色、V2 動詞底線
  await expect(word(page, 'bin')).toHaveClass(/\bg-end\b/);
  await expect(word(page, 'weil')).toHaveClass(/\bg-clause\b/);
  await expect(word(page, 'bleibe')).toHaveClass(/\bg-v2\b/);
  await expect(word(page, 'Hause')).not.toHaveClass(/\bg-clause\b/);
});

test('S10 沒有規則命中就誠實說', async ({ page }) => {
  await readText(page, 'Alles klar 👍');
  const card = await openGrammar(page, 0);
  await expect(card).toHaveAttribute('data-state', 'norule');
  await expect(card).toContainText('No rule matched for this sentence');
  await expect(card.locator('.rule')).toHaveCount(0);
});

test('P2 每一句都有自己的 Grammar 按鈕（沒有字的片段沒有）', async ({ page }) => {
  await readText(page, 'Ich komme. Kommst du? 😊\n15');
  await expect(page.locator('#text .g-btn')).toHaveCount(2);
});

test('P2 標記 G06 可分離前綴用虛線連回主動詞', async ({ page }) => {
  await readText(page, 'Ich stehe um sieben Uhr auf.');
  const card = await openGrammar(page, 0);
  await expect(card.locator('.rule[data-rule="G06"]')).toContainText('aufstehen');
  await expect(word(page, 'stehe')).toHaveClass(/sep-verb/);
  await expect(word(page, 'auf')).toHaveClass(/sep-prefix/);
  await expect(page.locator('#sep-line path')).toHaveAttribute('stroke-dasharray', /\d/);
});

test('P2 標記 關掉面板就清掉', async ({ page }) => {
  await readText(page, 'Ich bleibe zu Hause, weil ich krank bin.');
  await openGrammar(page, 0);
  await page.locator('#close').click();
  await expect(page.locator('#text .g-end, #text .g-clause, #text .g-v2')).toHaveCount(0);
});

test('P2 字卡 Why this form：Kindern（G19）', async ({ page }) => {
  await readText(page, 'Sie hat mit den Kindern gespielt.');
  const card = await tap(page, 'Kindern');
  const why = card.locator('.why-form');
  await expect(why.locator('.rule[data-rule="G19"]')).toContainText('Kinder');
  await expect(why).toContainText('Why this form');
});

test('P2 字卡 Why this form：G15 無法判斷就列出可能性', async ({ page }) => {
  await readText(page, 'Die Frau sieht die Kinder.');
  const card = await tap(page, 'die');
  const g15 = card.locator('.why-form .rule[data-rule="G15"]');
  await expect(g15).toContainText('nominative');
  await expect(g15).toContainText('accusative');
  await expect(g15).toContainText(/can't tell/);
});

test('P2 字卡 T4 可分離提示升級：點前綴 an 也提示 anrufen', async ({ page }) => {
  await readText(page, 'Wann fängt der Film an?');
  const card = await tap(page, 'an');
  await expect(card.locator('.separable-hint')).toContainText('anfangen');
});

// ---------- P2.1 ----------

test('M3 頁寬永遠不超過視窗寬度（句尾長字＋Grammar 按鈕、壓力項、網址、面板打開時）', async ({ page }) => {
  const width = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: window.innerWidth }));
  const inputs = [
    'Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz',
    'Das ist der Donaudampfschifffahrtsgesellschaftskapitän',
    'Bundesausbildungsförderungsgesetz. Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz!',
    'Schau mal: https://www.example.de/ein/sehr/langer/pfad/der/nicht/umbricht/und/noch/mehr/text/hier',
    'Hey, kommst du heut Abend? Ich hab nix vor 😅',
  ];
  for (const text of inputs) {
    if (await page.locator('#edit').isVisible()) await page.locator('#edit').click();
    await readText(page, text);
    let w = await width();
    expect(w.sw, `${text}：頁寬 ${w.sw} > 視窗 ${w.vw}`).toBeLessThanOrEqual(w.vw);
    await page.locator('#text .w').last().click();
    await expect(page.locator('#card')).toHaveAttribute('data-state', /^(found|notfound)$/);
    w = await width();
    expect(w.sw, `${text}（字卡開著）`).toBeLessThanOrEqual(w.vw);
    await page.locator('#text .g-btn').last().click();
    await expect(page.locator('#card')).toHaveAttribute('data-mode', 'grammar');
    w = await width();
    expect(w.sw, `${text}（Grammar 開著）`).toBeLessThanOrEqual(w.vw);
    // Grammar 按鈕本身要在畫面內、點得到
    const b = await page.locator('#text .g-btn').last().boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(w.vw);
    await page.locator('#close').click();
  }
});

test('M4 縮寫字卡：im 顯示 in + dem，並給兩個字的解釋', async ({ page }) => {
  await readText(page, 'Ich bin im Büro.');
  const card = await tap(page, 'im');
  await expect(card).toHaveAttribute('data-state', 'found');
  await expect(card.locator('.contraction')).toContainText('in + dem');
  await expect(card.locator('.reading')).toHaveCount(2);
  await expect(card.locator('.reading').nth(0).locator('.lemma')).toHaveText('in');
  await expect(card.locator('.reading').nth(1).locator('[data-field="glosses"]')).toHaveText(/the/);
});

test('M4 縮寫字卡：句首 Beim 也查得到', async ({ page }) => {
  await readText(page, 'Beim Essen rede ich nicht.');
  const card = await tap(page, 'Beim');
  await expect(card.locator('.contraction')).toContainText('bei + dem');
});

test('P2.2 長字斷行時句點緊貼字尾，不單獨掉到下一行', async ({ page }) => {
  await readText(page, 'Das ist der Donaudampfschifffahrtsgesellschaftskapitän. Rindfleischetikettierungsüberwachungsaufgabenübertragungsgesetz!');
  // 會不會真的掉行取決於那一行剛好在哪裡斷，所以驗根本條件：字和緊接的句尾標點之間不可以有換行點（<wbr>），
  // 也不可以被拆進不同的不斷行組；另外驗畫面上兩者確實在同一行
  const bad = await page.evaluate(() => {
    const out = [];
    for (const w of document.querySelectorAll('#text .w')) {
      let n = w.nextSibling;
      if (n && n.nodeName === 'WBR') { const p = n.nextSibling; if (p && /^[.!?]/.test(p.textContent)) out.push(`<wbr> 在 ${w.textContent} 與標點之間`); continue; }
      if (n && n.nodeType === 1 && n.classList.contains('s-end') && /^[.!?]/.test(n.textContent)) out.push(`${w.textContent} 的標點被拆進另一組`);
      if (n && n.nodeType === 1 && n.classList.contains('nw') && /^[.!?]$/.test(n.textContent)) {
        const wr = [...w.getClientRects()].at(-1), pr = n.getBoundingClientRect();
        if (Math.abs(wr.top - pr.top) > 2) out.push(`${w.textContent}${n.textContent} 不在同一行`);
      }
    }
    return out;
  });
  expect(bad).toEqual([]);
});

test('P2.2 封閉詞類表在頁面上生效：Meine → my、Wo → where', async ({ page }) => {
  await readText(page, 'Meine Mutter fragt, wo du bist.');
  let card = await tap(page, 'Meine');
  await expect(card.locator('.reading').first().locator('.lemma')).toHaveText('mein');
  await expect(card.locator('.reading').first().locator('[data-field="glosses"]')).toContainText('my');
  card = await tap(page, 'wo');
  await expect(card.locator('.reading').first().locator('[data-field="glosses"]')).toContainText('where');
});

test('P2.1 圖例不斷行（subordinate clause 整段同一行）', async ({ page }) => {
  await readText(page, 'Ich bleibe zu Hause, weil ich krank bin.');
  await openGrammar(page, 0);
  const rects = await page.locator('.legend .g-clause').evaluate((el) => el.getClientRects().length);
  expect(rects).toBe(1);
});

// ---------- P1 遺留 ----------

test('P1 遺留 被點的字永遠不會被字卡擋住（上、中、下、◀ ▶）', async ({ page }) => {
  const long = Array.from({ length: 30 }, (_, k) => `Zeile ${k}: Wir wohnen in zwei Häusern und gehen morgen nach Hause.`).join('\n');
  await readText(page, long);
  const check = async (loc) => {
    const w = await loc.boundingBox();
    const c = await page.locator('#card').boundingBox();
    const vh = page.viewportSize().height;
    const overlap = !(w.y + w.height <= c.y + 1 || w.y >= c.y + c.height - 1);
    expect(overlap, `字 y=${w.y} 卡片 y=${c.y}..${c.y + c.height}`).toBe(false);
    expect(w.y).toBeGreaterThanOrEqual(0);
    expect(w.y + w.height).toBeLessThanOrEqual(vh);
  };
  for (const n of [0, 4, 12, 20, 29]) {
    const loc = word(page, 'Häusern', n);
    await loc.evaluate((el, block) => el.scrollIntoView({ block }), n % 2 ? 'end' : 'start');
    await loc.click();
    await expect(page.locator('#card')).toHaveAttribute('data-state', 'found');
    await check(loc);
    // ◀ ▶ 移動後，新的字也不能被擋
    for (let k = 0; k < 3; k++) {
      await page.locator('#next').click();
      const i = await page.locator('#card').getAttribute('data-i');
      await expect(page.locator('#card')).toHaveAttribute('data-state', 'found');
      await check(page.locator(`#text .w[data-i="${i}"]`));
    }
    await page.locator('#close').click();
  }
});

test('P1 遺留 字卡在上方時，最上面幾行仍可捲到卡片下方看得到', async ({ page }) => {
  const long = Array.from({ length: 30 }, (_, k) => `Zeile ${k}: Das Haus ist groß.`).join('\n');
  await readText(page, long);
  const last = word(page, 'groß', 29);
  await last.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await last.click();
  await expect(page.locator('#card')).toHaveClass(/\btop\b/);
  await page.evaluate(() => window.scrollTo(0, 0));
  const first = await word(page, 'Zeile', 0).boundingBox();
  const card = await page.locator('#card').boundingBox();
  expect(first.y).toBeGreaterThanOrEqual(card.y + card.height - 1);
});

test('P1 遺留 apple-touch-icon 180×180 PNG', async ({ page }) => {
  const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(href).toMatch(/\.png$/);
  const size = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return [img.naturalWidth, img.naturalHeight];
  }, href);
  expect(size).toEqual([180, 180]);
});

test('P1 遺留 授權標示：Wiktionary via kaikki.org（CC BY-SA 4.0 and GFDL）與 FrequencyWords（CC BY-SA 4.0），附連結', async ({ page }) => {
  const about = page.locator('#about');
  await expect(about).toContainText('Wiktionary');
  await expect(about).toContainText('kaikki.org');
  await expect(about).toContainText('FrequencyWords');
  await expect(about).toContainText('CC BY-SA 4.0');
  // SPEC §8（P2.1）：Wiktionary 寫明雙授權
  await expect(about).toContainText('CC BY-SA 4.0 and GFDL');
  const gfdl = await about.locator('a').evaluateAll((as) => as.map((a) => a.href));
  expect(gfdl.some((h) => h.includes('gnu.org/licenses/fdl'))).toBe(true);
  const hrefs = await about.locator('a').evaluateAll((as) => as.map((a) => a.href));
  expect(hrefs.some((h) => h.includes('kaikki.org'))).toBe(true);
  expect(hrefs.some((h) => h.includes('wiktionary.org'))).toBe(true);
  expect(hrefs.some((h) => h.includes('github.com/hermitdave/FrequencyWords'))).toBe(true);
  expect(hrefs.some((h) => h.includes('creativecommons.org/licenses/by-sa'))).toBe(true);
});
